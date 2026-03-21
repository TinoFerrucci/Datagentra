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
    # Return first SELECT statement found
    sel = re.search(r"(SELECT[\s\S]+?)(;|$)", raw, re.IGNORECASE)
    if sel:
        return sel.group(1).strip()
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
# Column classification helpers
# ---------------------------------------------------------------------------

# Columns with these substrings should NEVER be x_key or y_key
_COL_EXCLUDE = frozenset([
    'email', 'mail', 'url', 'link', 'phone', 'tel', 'address',
    'password', 'token', 'hash', 'avatar', 'image', 'photo', 'uuid', 'guid',
])

# Substrings that indicate an ID column (numeric but not a metric)
_COL_ID = frozenset(['_id', 'id'])

# Substrings that make a column a good x_key label
_COL_NAME_KWORDS = frozenset([
    'name', 'title', 'label', 'category', 'product', 'type', 'status',
    'region', 'country', 'city', 'brand', 'model', 'description',
    'department', 'segment', 'group', 'class', 'tag',
])

# Substrings that indicate a time dimension (x_key for line/area)
_COL_DATE_KWORDS = frozenset([
    'date', 'month', 'year', 'week', 'day', 'period',
    'time', 'quarter', 'created', 'updated', 'at',
])

# Substrings that indicate a meaningful numeric metric (prefer for y_keys)
_COL_METRIC_KWORDS = frozenset([
    'total', 'sum', 'count', 'amount', 'revenue', 'sales', 'price',
    'cost', 'value', 'spent', 'earning', 'profit', 'quantity', 'avg',
    'average', 'orders', 'items', 'purchases', 'transactions', 'rate',
    'score', 'rank', 'volume', 'balance',
])


def _col_is_id(col: str) -> bool:
    c = col.lower()
    return c == 'id' or c.endswith('_id') or c.endswith('id') or 'uuid' in c or 'guid' in c


def _col_is_excluded(col: str) -> bool:
    c = col.lower()
    return any(kw in c for kw in _COL_EXCLUDE)


def _detect_column_types(columns: list[str], rows: list[list]) -> tuple[list[str], list[str]]:
    """Classify columns as numeric or categorical based on sample data.
    Returns (numeric_cols, string_cols).
    """
    numeric: list[str] = []
    strings: list[str] = []
    sample = rows[:20]
    for i, col in enumerate(columns):
        vals = [row[i] for row in sample if i < len(row) and row[i] is not None]
        num_count = sum(1 for v in vals if _try_float(v))
        if vals and num_count / len(vals) >= 0.7:
            numeric.append(col)
        else:
            strings.append(col)
    return numeric, strings


def _try_float(v: object) -> bool:
    try:
        float(v)  # type: ignore[arg-type]
        return True
    except (TypeError, ValueError):
        return False


def _xkey_score(col: str, idx: int, rows: list[list]) -> int:
    """Score a column for use as the chart's label axis. Higher = better."""
    c = col.lower()
    if _col_is_id(col):      return -1000
    if _col_is_excluded(col): return -800

    score = 0
    if any(kw in c for kw in _COL_NAME_KWORDS):  score += 120
    if any(kw in c for kw in _COL_DATE_KWORDS):  score += 90
    score += max(0, 30 - idx * 8)  # slight preference for earlier columns

    # Penalise very long values (emails, URLs, etc.)
    sample_vals = [
        str(rows[r][idx])
        for r in range(min(5, len(rows)))
        if idx < len(rows[r]) and rows[r][idx] is not None
    ]
    if sample_vals:
        avg_len = sum(len(v) for v in sample_vals) / len(sample_vals)
        if avg_len > 40:  score -= 150
        elif avg_len > 25: score -= 40
        if any('@' in v for v in sample_vals): score -= 300

    return score


def _ykey_score(col: str) -> int:
    """Score a numeric column for use as a chart metric. Higher = better."""
    if _col_is_id(col):      return -500
    if _col_is_excluded(col): return -500
    c = col.lower()
    score = 0
    if any(kw in c for kw in _COL_METRIC_KWORDS): score += 100
    if any(kw in c for kw in ['total', 'revenue', 'sales', 'spent', 'amount']): score += 60
    if 'count' in c or 'orders' in c:   score += 30
    if 'avg' in c or 'average' in c:    score += 20
    return score


def _select_axes(
    columns: list[str],
    rows: list[list],
    numeric_cols: list[str],
    string_cols: list[str],
) -> tuple[str, list[str]]:
    """Deterministically pick the best x_key and y_keys without the LLM."""
    col_index = {c: i for i, c in enumerate(columns)}

    # Score every column for x_key
    x_scores = {col: _xkey_score(col, col_index[col], rows) for col in columns}
    x_key = max(x_scores, key=x_scores.__getitem__)
    if x_scores[x_key] < -100:
        x_key = string_cols[0] if string_cols else columns[0]

    # Score numeric columns for y_keys (exclude the chosen x_key and bad cols)
    y_cands = sorted(
        [(col, _ykey_score(col)) for col in numeric_cols if col != x_key and _ykey_score(col) > -100],
        key=lambda t: t[1],
        reverse=True,
    )
    y_keys = [c for c, _ in y_cands[:3]]

    if not y_keys:
        y_keys = [c for c in numeric_cols if c != x_key][:1]
    if not y_keys:
        y_keys = [c for c in columns if c != x_key][:1]

    return x_key, y_keys


def _suggest_chart(question: str, columns: list[str], rows: list[list]) -> tuple[str, dict, str]:
    """Suggest chart type + title (LLM), axes (deterministic)."""
    llm = get_llm()
    numeric_cols, string_cols = _detect_column_types(columns, rows)

    # Deterministic axis selection — no LLM hallucinations
    x_key, y_keys = _select_axes(columns, rows, numeric_cols, string_cols)

    # Detect if there is a time dimension for line/area vs bar choice
    has_time = any(any(kw in c.lower() for kw in _COL_DATE_KWORDS) for c in columns)

    col_summary = ", ".join(
        f"{c}={'numeric' if c in numeric_cols else 'text'}" for c in columns
    )

    prompt = f"""Given a data question and result shape, respond with exactly 2 lines:
Line 1: chart type (one word)
Line 2: chart title (3-7 words, title case, no punctuation)

Question: "{question}"
Columns: {col_summary}
Rows: {len(rows)}
Has time dimension: {has_time}

Rules:
- "metric" → 1 row, 1 numeric column (single KPI)
- "pie"    → 2 columns (label + value), ≤8 rows, parts of a whole
- "area"   → time series with continuous trend (fill under line)
- "line"   → time series, multiple series or discrete points
- "bar"    → category comparison or ranking (default)

Example:
bar
Top Customers by Total Spend

Respond with exactly 2 lines. Nothing else."""

    raw = llm.invoke(prompt).strip()
    raw = re.sub(r"<think>[\s\S]*?</think>", "", raw, flags=re.IGNORECASE).strip()
    lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]

    chart_type = lines[0].lower().split()[0] if lines else "bar"
    if chart_type not in ("bar", "line", "area", "pie", "metric"):
        chart_type = "bar"

    chart_title = lines[1] if len(lines) > 1 else question[:60]

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
