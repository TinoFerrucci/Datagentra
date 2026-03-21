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


def _generate_sql(question: str, ddl: str, db_type: str = "PostgreSQL") -> str:
    llm = get_llm()
    prompt = f"""You are a {db_type} expert. Given the following database schema:

{ddl}

Write a {db_type} SELECT query to answer this question:
"{question}"

Rules:
- Return ONLY the SQL query, no explanations.
- Use only SELECT statements — never INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, TRUNCATE.
- Use proper {db_type} syntax.
- If using date functions, use {db_type}-compatible functions.
- Wrap column and table names in double quotes if they contain special characters.

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
    preview = rows[:20]
    data_str = "\n".join([", ".join(str(v) for v in row) for row in preview])
    prompt = f"""You are a data analyst. A user asked: "{question}"

The SQL query executed was:
{sql}

The results (columns: {', '.join(columns)}):
{data_str}
(showing up to 20 rows of {len(rows)} total)

Write a concise summary in natural language. Mention key insights: trends, maximums, minimums, notable patterns.
Be direct and informative. Use 2-4 sentences. Do not include markdown headers."""
    result = get_llm().invoke(prompt)
    # Strip think tags
    result = re.sub(r"<think>[\s\S]*?</think>", "", result, flags=re.IGNORECASE).strip()
    return result


def _suggest_chart(question: str, columns: list[str], rows: list[list]) -> tuple[str, dict]:
    """Suggest the most appropriate chart type based on data shape."""
    llm = get_llm()
    col_sample = ", ".join(columns)
    row_sample = str(rows[:3]) if rows else "[]"

    prompt = f"""Given a question and query results, suggest the best chart type.

Question: "{question}"
Columns: {col_sample}
Sample rows: {row_sample}
Total rows: {len(rows)}

Choose ONE from: bar, line, area, pie, metric

Rules:
- "metric": exactly 1 row and 1 column (single KPI value)
- "pie": 2 columns (label + value), ≤8 rows, shows distribution/percentage
- "line" or "area": data has a time/date dimension (months, weeks, days, years)
- "bar": comparisons between categories (products, regions, etc.)
- Default to "bar" if unsure

Respond with ONLY the chart type word (bar/line/area/pie/metric), nothing else."""

    raw = llm.invoke(prompt).strip().lower()
    raw = re.sub(r"<think>[\s\S]*?</think>", "", raw, flags=re.IGNORECASE).strip()
    # Extract first word
    chart_type = raw.split()[0] if raw else "bar"
    if chart_type not in ("bar", "line", "area", "pie", "metric"):
        chart_type = "bar"

    # Build chart config
    chart_config: dict = {"x_key": columns[0] if columns else "label", "y_keys": []}
    if len(columns) >= 2:
        chart_config["x_key"] = columns[0]
        chart_config["y_keys"] = columns[1:]
    elif len(columns) == 1:
        chart_config["x_key"] = columns[0]
        chart_config["y_keys"] = [columns[0]]

    return chart_type, chart_config


def run_pipeline(
    question: str,
    engine: Engine | None = None,
    session_id: str | None = None,
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

    # Step 1: Generate SQL
    sql = _generate_sql(question, ddl, db_type)

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
    chart_type, chart_config = _suggest_chart(question, columns, rows)

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
        "source": session_id or "postgres_default",
        "llm_provider": llm.provider_name,
        "llm_model": llm.model,
    }
