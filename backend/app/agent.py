"""Text-to-SQL agent pipeline.

Steps:
1. Text-to-SQL: generate SQL from natural language + schema
2. Execute with retry (up to 2 retries on error)
3. Summarize results
4. Suggest chart type
"""
from __future__ import annotations

import re
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.database import get_schema_ddl, readonly_engine
from app.llm_provider import get_llm

MAX_RETRIES = 2


def _get_db_type(engine: Engine) -> str:
    dialect = engine.dialect.name
    if dialect == "sqlite":
        return "SQLite"
    if dialect == "postgresql":
        return "PostgreSQL"
    return "SQL"

DANGEROUS_PATTERNS = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE)\b",
    re.IGNORECASE,
)


def _clean_sql(raw: str) -> str:
    """Extract SQL from LLM response (may be wrapped in markdown code block)."""
    # Strip ```sql ... ``` or ``` ... ```
    match = re.search(r"```(?:sql)?\s*([\s\S]+?)```", raw, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    # Remove think tags (some models output <think>...</think>)
    raw = re.sub(r"<think>[\s\S]*?</think>", "", raw, flags=re.IGNORECASE)
    # Find the SQL statement at the start of a line.
    # WITH must be checked before SELECT because SELECT also appears inside CTE bodies —
    # matching SELECT first would silently strip the leading "WITH ... AS (" prefix.
    start = re.search(r"(?m)^[ \t]*(WITH|SELECT)\b", raw, re.IGNORECASE)
    if start:
        sql = raw[start.start():]
        # Drop anything after a trailing semicolon + newline (post-SQL prose the LLM adds)
        sql = re.split(r";[ \t]*\n", sql)[0].rstrip(";").strip()
        return sql
    return raw.strip()


def _is_dangerous(sql: str) -> bool:
    return bool(DANGEROUS_PATTERNS.search(sql))


def _format_history(history: list[dict]) -> str:
    """Format conversation history for inclusion in prompts."""
    if not history:
        return ""
    lines = ["Previous conversation context:"]
    for entry in history:
        if entry["type"] == "user":
            lines.append(f"  User asked: {entry['content']}")
        elif entry["type"] == "agent":
            if entry.get("sql"):
                lines.append(f"  SQL used: {entry['sql']}")
            lines.append(f"  Answer summary: {entry['content']}")
    return "\n".join(lines)


def _generate_sql(
    question: str,
    ddl: str,
    db_type: str = "PostgreSQL",
    history: list[dict] | None = None,
) -> str:
    llm = get_llm()
    history_block = _format_history(history or [])
    history_section = f"\n{history_block}\n" if history_block else ""
    prompt = f"""You are a {db_type} expert. Given the following database schema:

{ddl}
{history_section}
Write a {db_type} SELECT query to answer this question:
"{question}"

Rules:
- Return ONLY the SQL query, no explanations.
- Use only SELECT statements — never INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, TRUNCATE.
- Use proper {db_type} syntax.
- If using date functions, use {db_type}-compatible functions.
- Wrap column and table names in double quotes if they contain special characters.
- If the question refers to previous results (e.g. "those same products", "the top one"), use the context above.

SQL:"""
    return _clean_sql(llm.invoke(prompt))


def _fix_sql(sql: str, error: str, question: str, ddl: str, db_type: str = "PostgreSQL") -> str:
    llm = get_llm()
    prompt = f"""The following {db_type} SQL query failed with this error:

SQL:
{sql}

Error:
{error}

Original question: "{question}"

Database schema:
{ddl}

Fix the SQL query. Return ONLY the corrected SQL, no explanations.

Corrected SQL:"""
    return _clean_sql(llm.invoke(prompt))


def _execute_sql(sql: str, engine: Engine) -> tuple[list[str], list[list[Any]]]:
    """Execute SQL and return (columns, rows)."""
    if _is_dangerous(sql):
        raise PermissionError(f"Dangerous SQL detected and blocked: {sql[:100]}")

    with engine.connect() as conn:
        result = conn.execute(text(sql))
        columns = list(result.keys())
        rows = [list(row) for row in result.fetchall()]
    return columns, rows


def _summarize(question: str, columns: list[str], rows: list[list], sql: str) -> str:
    llm = get_llm()
    preview = rows[:30]
    data_str = "\n".join([", ".join(str(v) for v in row) for row in preview])

    # Compute quick stats for numeric columns to help the LLM
    numeric_stats = []
    for i, col in enumerate(columns):
        vals = [row[i] for row in rows if row[i] is not None]
        nums = []
        for v in vals:
            try:
                nums.append(float(v))
            except (TypeError, ValueError):
                pass
        if nums:
            total = sum(nums)
            avg = total / len(nums)
            numeric_stats.append(
                f"  {col}: total={total:,.2f}, avg={avg:,.2f}, min={min(nums):,.2f}, max={max(nums):,.2f}"
            )
    stats_block = "\nPre-computed stats:\n" + "\n".join(numeric_stats) if numeric_stats else ""

    prompt = f"""You are a senior data analyst. A user asked: "{question}"

The data returned ({len(rows)} rows, columns: {', '.join(columns)}):
{data_str}
{"(first 30 rows shown)" if len(rows) > 30 else ""}
{stats_block}

Write a structured analysis in markdown. Follow this format exactly:

**[One-sentence headline with the most important insight]**

- **[Key metric or top performer]**: [value and context]
- **[Second insight]**: [value and context]
- **[Third insight — trend, pattern, or outlier]**: [value and context]

Rules:
- Be specific: use actual numbers, percentages, comparisons.
- Highlight the maximum, minimum, total or average where relevant.
- If there is a trend (growth, decline, seasonality), call it out.
- If there is a notable outlier, mention it.
- Keep each bullet point to one concise sentence.
- Do NOT restate the question. Do NOT say "the query returned".
- Do NOT add headers or extra sections beyond the format above."""

    result = llm.invoke(prompt)
    result = re.sub(r"<think>[\s\S]*?</think>", "", result, flags=re.IGNORECASE).strip()
    return result


# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Chart suggestion — fully LLM-driven
# ---------------------------------------------------------------------------

def _try_float(v: object) -> bool:
    try:
        float(v)  # type: ignore[arg-type]
        return True
    except (TypeError, ValueError):
        return False


def _col_types(columns: list[str], rows: list[list]) -> dict[str, str]:
    """Return {'col': 'numeric' | 'text'} for each column based on sample data."""
    sample = rows[:20]
    result: dict[str, str] = {}
    for i, col in enumerate(columns):
        vals = [row[i] for row in sample if i < len(row) and row[i] is not None]
        num_count = sum(1 for v in vals if _try_float(v))
        result[col] = 'numeric' if vals and num_count / len(vals) >= 0.7 else 'text'
    return result


def _suggest_chart(question: str, columns: list[str], rows: list[list]) -> tuple[str, dict, str]:
    """Ask the LLM to determine chart type, title, and axes from question and result data."""
    llm = get_llm()
    types = _col_types(columns, rows)

    col_summary = ", ".join(f"{c} ({types[c]})" for c in columns)

    sample_rows = rows[:3]
    sample_str = "\n".join(
        "  " + "  |  ".join(f"{columns[i]}: {row[i]}" for i in range(min(len(columns), len(row))))
        for row in sample_rows
    )

    prompt = f"""You are a data visualization expert. Given a user question and query results, decide the best chart configuration.

Respond with exactly 4 lines — nothing else:
Line 1: chart_type  (one of: bar, line, area, pie, metric)
Line 2: title       (3-8 words, Title Case, no punctuation)
Line 3: x_key       (exact column name for the label axis)
Line 4: y_keys      (comma-separated exact column names for the value axes, most relevant first, max 3)

Question: "{question}"
Columns: {col_summary}
Total rows: {len(rows)}
Sample data:
{sample_str}

Chart type rules:
- metric → single KPI (1 row, 1 key number)
- pie    → parts of a whole (≤8 rows, exactly 2 columns)
- area   → continuous time trend (fill under line)
- line   → time series or multi-series trend
- bar    → ranking, comparison, or any other case (default)

Axis rules:
- x_key must be the column that uniquely identifies each row in the context of the question
  (e.g. for "top products by revenue" → product_name, not category_name or brand_name)
- y_keys must be the numeric columns the question is asking about
- never use id columns, internal keys, or metadata

Example output for "top 10 products by revenue":
bar
Top 10 Products by Revenue
product_name
total_revenue, total_orders, total_units_sold"""

    raw = llm.invoke(prompt).strip()
    raw = re.sub(r"<think>[\s\S]*?</think>", "", raw, flags=re.IGNORECASE).strip()
    lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]

    chart_type = lines[0].lower().split()[0] if lines else "bar"
    if chart_type not in ("bar", "line", "area", "pie", "metric"):
        chart_type = "bar"

    chart_title = lines[1] if len(lines) > 1 else question[:60]

    # x_key — validate it exists in columns, fall back to first text column
    raw_x = lines[2] if len(lines) > 2 else ""
    x_key = raw_x if raw_x in columns else next(
        (c for c in columns if types[c] == 'text'), columns[0]
    )

    # y_keys — validate each against columns, fall back to numeric columns
    raw_y = lines[3] if len(lines) > 3 else ""
    y_keys = [k.strip() for k in raw_y.split(",") if k.strip() in columns and k.strip() != x_key]
    if not y_keys:
        y_keys = [c for c in columns if types[c] == 'numeric' and c != x_key][:3]

    return chart_type, {"x_key": x_key, "y_keys": y_keys}, chart_title


def run_pipeline(
    question: str,
    engine: Engine | None = None,
    session_id: str | None = None,
    history: list[dict] | None = None,
) -> dict:
    """Full Text-to-SQL pipeline.

    Returns a unified response dict.
    """
    from app.llm_provider import get_llm

    llm = get_llm()

    # Select engine
    if engine is None:
        if session_id:
            from app.data_loader import get_engine_for_session
            engine = get_engine_for_session(session_id)
        if engine is None:
            engine = readonly_engine
    db_type = _get_db_type(engine)

    ddl = get_schema_ddl(engine)

    # Step 1: Generate SQL (with conversation context if available)
    sql = _generate_sql(question, ddl, db_type, history=history)

    # Step 2: Execute with retries
    columns: list[str] = []
    rows: list[list] = []
    last_error = ""

    for attempt in range(MAX_RETRIES + 1):
        try:
            columns, rows = _execute_sql(sql, engine)
            last_error = ""
            break
        except PermissionError:
            raise
        except Exception as exc:
            last_error = str(exc)
            if attempt < MAX_RETRIES:
                sql = _fix_sql(sql, last_error, question, ddl, db_type)
            else:
                raise RuntimeError(
                    f"Failed to execute SQL after {MAX_RETRIES} retries. Last error: {last_error}"
                ) from exc

    # Step 3: Summarize
    summary = _summarize(question, columns, rows, sql)

    # Step 4: Chart suggestion
    chart_type, chart_config, chart_title = _suggest_chart(question, columns, rows)

    # Serialize rows (handle non-serializable types)
    serializable_rows = []
    for row in rows:
        serializable_rows.append([
            str(v) if not isinstance(v, (int, float, str, bool, type(None))) else v
            for v in row
        ])

    return {
        "question": question,
        "sql": sql,
        "columns": columns,
        "rows": serializable_rows,
        "summary": summary,
        "chart_type": chart_type,
        "chart_config": chart_config,
        "chart_title": chart_title,
        "source": session_id or "sqlite_default",
        "llm_provider": llm.provider_name,
        "llm_model": llm.model,
    }
