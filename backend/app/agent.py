"""Text-to-SQL agent pipeline.

Steps:
1. Plan: LLM decides intent, row limit, chart need, and chart hint from the question
2. Text-to-SQL: generate SQL from plan + schema
3. Execute with retry (up to 2 retries on error)
4. Summarize results
5. Render chart (using the planner's hint as primary signal)
"""
from __future__ import annotations

import json
import re
import time
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.database import get_schema_ddl, readonly_engine
from app.logger import get_logger
from app.llm_provider import get_llm

MAX_RETRIES = 2

DEFAULT_ROW_LIMIT = 10
EXTENSIVE_ROW_LIMIT = 500

VALID_INTENTS = {
    "ranking", "distribution", "trend", "metric",
    "listing", "comparison", "exploration",
}
VALID_CHART_TYPES = ("bar", "line", "area", "pie", "metric", "scatter", "table")

logger = get_logger("agent")


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


def _extract_json_object(raw: str) -> dict | None:
    """Best-effort JSON object extractor for LLM responses."""
    if not raw:
        return None
    cleaned = re.sub(r"<think>[\s\S]*?</think>", "", raw, flags=re.IGNORECASE)
    fenced = re.search(r"```(?:json)?\s*([\s\S]+?)```", cleaned, re.IGNORECASE)
    if fenced:
        cleaned = fenced.group(1)
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        return json.loads(cleaned[start:end + 1])
    except json.JSONDecodeError:
        return None


def _normalize_plan(raw_plan: dict | None, question: str) -> dict:
    """Validate and fill defaults so downstream steps can rely on the plan."""
    plan: dict[str, Any] = {
        "intent": "exploration",
        "row_limit": DEFAULT_ROW_LIMIT,
        "needs_chart": True,
        "chart_hint": None,
        "user_wants_extensive": False,
        "reasoning": "",
    }
    if not raw_plan:
        return plan

    intent = str(raw_plan.get("intent", "")).strip().lower()
    if intent in VALID_INTENTS:
        plan["intent"] = intent

    extensive = bool(raw_plan.get("user_wants_extensive", False))
    plan["user_wants_extensive"] = extensive

    raw_limit = raw_plan.get("row_limit", DEFAULT_ROW_LIMIT)
    if raw_limit is None or (isinstance(raw_limit, str) and raw_limit.lower() in ("null", "none", "all")):
        plan["row_limit"] = None if extensive else EXTENSIVE_ROW_LIMIT
    else:
        try:
            limit_val = int(raw_limit)
            if limit_val <= 0:
                plan["row_limit"] = DEFAULT_ROW_LIMIT
            else:
                # Cap at EXTENSIVE_ROW_LIMIT unless the user explicitly wants everything
                plan["row_limit"] = limit_val if extensive else min(limit_val, EXTENSIVE_ROW_LIMIT)
        except (TypeError, ValueError):
            plan["row_limit"] = DEFAULT_ROW_LIMIT

    needs_chart = raw_plan.get("needs_chart")
    if isinstance(needs_chart, bool):
        plan["needs_chart"] = needs_chart
    elif isinstance(needs_chart, str):
        plan["needs_chart"] = needs_chart.strip().lower() in ("true", "yes", "1")

    hint = str(raw_plan.get("chart_hint", "") or "").strip().lower().split()[0:1]
    hint_val = hint[0] if hint else ""
    plan["chart_hint"] = hint_val if hint_val in VALID_CHART_TYPES else None

    reasoning = raw_plan.get("reasoning")
    if isinstance(reasoning, str):
        plan["reasoning"] = reasoning.strip()[:200]

    return plan


def _plan_query(
    question: str,
    ddl: str,
    history: list[dict] | None = None,
) -> dict:
    """LLM-driven planner: decides row limit, chart needs and chart hint.

    Returns a dict shaped like:
        {
          "intent": str,
          "row_limit": int | None,
          "needs_chart": bool,
          "chart_hint": str | None,
          "user_wants_extensive": bool,
          "reasoning": str,
        }
    """
    llm = get_llm()
    history_block = _format_history(history or [])
    history_section = f"\n{history_block}\n" if history_block else ""

    prompt = f"""You are the planning brain of a data analyst agent. Decide how to handle the user's question.

Database schema:
{ddl}
{history_section}
User question: "{question}"

Respond with ONLY a single JSON object (no prose, no markdown fences) using this exact shape:
{{
  "intent": "ranking" | "distribution" | "trend" | "metric" | "listing" | "comparison" | "exploration",
  "row_limit": <integer between 1 and 500, OR null if the user explicitly asked for the complete dataset>,
  "needs_chart": true | false,
  "chart_hint": "bar" | "line" | "area" | "pie" | "metric" | "scatter" | "table",
  "user_wants_extensive": true | false,
  "reasoning": "<one short sentence>"
}}

Decision guidelines:

row_limit:
- Default to {DEFAULT_ROW_LIMIT}. Keep results compact — users rarely need hundreds of rows.
- Use 1 for single-value aggregates ("total", "promedio", "cuántos", "how many", "average").
- Use 8–12 for pie charts (composition or breakdown questions).
- Use {DEFAULT_ROW_LIMIT} for rankings or top-N questions.
- Use up to 25 for distributions or comparisons spanning many categories.
- Set user_wants_extensive=true and row_limit=null ONLY when the question explicitly signals it: "todos", "lista completa", "completo", "extenso", "all of them", "every record", "full list", "exporta todo".

needs_chart:
- False only when the question is exploratory or structural ("qué columnas hay", "describe la tabla", "what does this field mean").

chart_hint — choose the BEST match for the question intent and expected data shape:
- metric  → question asks for a single aggregate value; result is 1 row × 1 numeric column.
- pie     → question asks about part-to-whole composition or breakdown of a categorical variable (e.g. "distribución de X por Y", "qué proporción", "breakdown"). Use when ≤15 expected categories. Prefer pie over bar for "distribution" or "how is X distributed" questions.
- line    → time series or sequential trend; X axis is a date, month, quarter, or year dimension.
- area    → same as line when cumulative volume or fill context matters (e.g. "acumulado", "crecimiento").
- scatter → explores correlation between two numeric variables with no natural categorical X axis.
- table   → detail listing with many mixed columns, catalog browsing, or no clear numeric aggregation focus.
- bar     → rankings, categorical comparisons, or distributions with >15 categories (default fallback for most intents).

Return ONLY the JSON object."""

    logger.info("Planning query | question=%s", question[:120])
    t0 = time.perf_counter()
    raw = llm.invoke(prompt)
    plan = _normalize_plan(_extract_json_object(raw), question)
    logger.info(
        "Plan ready in %.2fs | intent=%s | limit=%s | chart=%s (hint=%s) | extensive=%s",
        time.perf_counter() - t0,
        plan["intent"],
        plan["row_limit"],
        plan["needs_chart"],
        plan["chart_hint"],
        plan["user_wants_extensive"],
    )
    return plan


def _generate_sql(
    question: str,
    ddl: str,
    db_type: str = "PostgreSQL",
    history: list[dict] | None = None,
    plan: dict | None = None,
) -> str:
    llm = get_llm()
    history_block = _format_history(history or [])
    history_section = f"\n{history_block}\n" if history_block else ""

    plan = plan or {}
    row_limit = plan.get("row_limit", DEFAULT_ROW_LIMIT)
    intent = plan.get("intent", "exploration")
    extensive = bool(plan.get("user_wants_extensive", False))

    if row_limit is None or extensive:
        limit_rule = (
            "- The user asked for the complete dataset. Do NOT add a LIMIT clause "
            "unless the question explicitly mentions a specific number."
        )
    else:
        limit_rule = (
            f"- Add `LIMIT {row_limit}` at the end of the query so the user gets a focused result. "
            f"This applies even when the question does not specify a number — small previews are preferred. "
            f"Skip the LIMIT only if the question itself names a different limit "
            f"(e.g. 'top 25', 'first 50')."
        )

    order_rule = (
        "- For rankings or 'top X' style questions, ORDER BY the relevant numeric column DESC."
        if intent in ("ranking", "comparison")
        else ""
    )

    prompt = f"""You are a {db_type} expert. Given the following database schema:

{ddl}
{history_section}
Write a {db_type} SELECT query to answer this question:
"{question}"

Planner intent: {intent}

Rules:
- Return ONLY the SQL query, no explanations.
- Use only SELECT statements — never INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, TRUNCATE.
- Use proper {db_type} syntax.
- If using date functions, use {db_type}-compatible functions.
- Wrap column and table names in double quotes if they contain special characters.
- If the question refers to previous results (e.g. "those same products", "the top one"), use the context above.
{limit_rule}
{order_rule}

SQL:"""
    logger.info("Generating SQL | db=%s | question=%s | limit=%s", db_type, question[:120], row_limit)
    t0 = time.perf_counter()
    sql = _clean_sql(llm.invoke(prompt))
    logger.info("SQL generated in %.2fs | sql=%s", time.perf_counter() - t0, sql[:200])
    return sql


def _fix_sql(sql: str, error: str, question: str, ddl: str, db_type: str = "PostgreSQL") -> str:
    llm = get_llm()
    logger.warning("SQL failed, fixing | error=%s | sql=%s", error[:200], sql[:200])
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
    t0 = time.perf_counter()
    fixed = _clean_sql(llm.invoke(prompt))
    logger.info("SQL fixed in %.2fs | sql=%s", time.perf_counter() - t0, fixed[:200])
    return fixed


def _execute_sql(sql: str, engine: Engine) -> tuple[list[str], list[list[Any]]]:
    """Execute SQL and return (columns, rows)."""
    if _is_dangerous(sql):
        logger.error("Dangerous SQL blocked | sql=%s", sql[:200])
        raise PermissionError(f"Dangerous SQL detected and blocked: {sql[:100]}")

    t0 = time.perf_counter()
    with engine.connect() as conn:
        result = conn.execute(text(sql))
        columns = list(result.keys())
        rows = [list(row) for row in result.fetchall()]
    logger.info("SQL executed in %.2fs | rows=%d | cols=%s", time.perf_counter() - t0, len(rows), columns)
    return columns, rows


def _build_summary_prompt(question: str, columns: list[str], rows: list[list]) -> str:
    """Build the LLM prompt for summarization without calling the LLM."""
    preview = rows[:30]
    data_str = "\n".join([", ".join(str(v) for v in row) for row in preview])

    numeric_stats = []
    for i, col in enumerate(columns):
        vals = [row[i] for row in rows if row[i] is not None]
        nums = [float(v) for v in vals if _try_float(v)]
        if nums:
            total = sum(nums)
            avg = total / len(nums)
            numeric_stats.append(
                f"  {col}: total={total:,.2f}, avg={avg:,.2f}, min={min(nums):,.2f}, max={max(nums):,.2f}"
            )
    stats_block = "\nPre-computed stats:\n" + "\n".join(numeric_stats) if numeric_stats else ""

    return f"""You are a senior data analyst. A user asked: "{question}"

The data returned ({len(rows)} rows, columns: {', '.join(columns)}):
{data_str}
{"(first 30 rows shown)" if len(rows) > 30 else ""}
{stats_block}

Write a structured analytical report in markdown. Follow this format exactly:

**[Bold headline — one sentence with the single most important quantified insight. Lead with the number.]**

- **[Insight 1]**: [value and context]
- **[Insight 2]**: [value and context]
- **[Insight 3]**: [value and context]
[add up to 2 more bullets if the data warrants it]

Analytical framework — cover the angles relevant to the data:
- DISTRIBUTION: Report concentration (top N items account for X% of total), identify the long tail, note skewness or uniformity.
- RANKING: Call out the clear leader and runner-up, the gap between them, and anything below average.
- TREND: Identify direction (growth/decline), magnitude, inflection points, and velocity of change.
- OUTLIERS: Flag any value that is unusually far from the average or breaks a pattern.
- STATISTICAL CONTEXT: Mention average, median, or range if it adds insight. Compute percentages and ratios.
- COMPARISON: Identify the biggest gap between segments, highlight who is above or below average.

Strict rules:
- Every claim must be backed by a specific number, percentage, ratio, or comparison from the data.
- Each bullet must address a DISTINCT analytical angle — no repetition.
- Keep each bullet to one concise sentence.
- Do NOT restate the question. Do NOT say "the query returned" or "the data shows".
- Do NOT add headers, sections, or markdown beyond the format above."""


def _summarize(question: str, columns: list[str], rows: list[list], sql: str) -> str:
    llm = get_llm()
    prompt = _build_summary_prompt(question, columns, rows)
    t0 = time.perf_counter()
    result = llm.invoke(prompt)
    result = re.sub(r"<think>[\s\S]*?</think>", "", result, flags=re.IGNORECASE).strip()
    logger.info("Summary generated in %.2fs | rows=%d", time.perf_counter() - t0, len(rows))
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


def _suggest_chart(
    question: str,
    columns: list[str],
    rows: list[list],
    plan: dict | None = None,
) -> tuple[str, dict, str]:
    """Ask the LLM to determine chart type, title, and axes from question and result data.

    If the planner already decided a chart type and the user did not need one, this short-circuits
    to a `table` view (no extra LLM call).
    """
    plan = plan or {}
    types = _col_types(columns, rows)

    # Short-circuit: planner said no chart needed → render as table without extra LLM call.
    if plan.get("needs_chart") is False:
        text_col = next((c for c in columns if types[c] == 'text'), columns[0] if columns else "")
        y_keys = [c for c in columns if c != text_col][:3]
        title = (question[:60] or "Result").strip()
        logger.info("Chart skipped by planner | rendering table | title=%s", title)
        return "table", {"x_key": text_col, "y_keys": y_keys}, title

    llm = get_llm()
    col_summary = ", ".join(f"{c} ({types[c]})" for c in columns)

    sample_rows = rows[:3]
    sample_str = "\n".join(
        "  " + "  |  ".join(f"{columns[i]}: {row[i]}" for i in range(min(len(columns), len(row))))
        for row in sample_rows
    )

    chart_hint = plan.get("chart_hint")
    hint_block = (
        f"\nThe planner suggested chart_type='{chart_hint}' based on the question intent — "
        f"prefer that unless the data clearly demands a different shape.\n"
        if chart_hint else ""
    )

    prompt = f"""You are a senior data visualization engineer. Choose the best chart type and axis configuration for the given question and data.
{hint_block}
Respond with exactly 4 lines — nothing else:
Line 1: chart_type  (one of: bar, line, area, pie, metric, table, scatter)
Line 2: title       (3-8 words, Title Case, no punctuation)
Line 3: x_key       (exact column name for the label/category axis)
Line 4: y_keys      (comma-separated exact column names for the value axes, most relevant first, max 3)

Question: "{question}"
Columns: {col_summary}
Total rows: {len(rows)}
Sample data:
{sample_str}

Analytical reasoning — work through these steps before choosing:
1. INTENT: Is the question about a single value, a ranking, a part-to-whole breakdown, a time trend, a correlation, or a detail listing?
2. DATA SHAPE: How many rows? Are there one or two numeric columns? Is there a time/date column? Are categories few (<15) or many?
3. BEST FIT: Which chart type maps most directly to the analytical intent?

Chart type selection (apply first match that fits):
- metric  → result is a single row with one numeric value (total, average, count for a specific filter)
- pie     → question asks for distribution, proportion, or breakdown of a categorical variable with few categories (≤15 rows, exactly 1 label + 1 numeric column); ALWAYS prefer pie over bar for "distribución", "breakdown", "proporción" questions
- line    → X axis is a sequential time dimension (date, month, quarter, year); data shows change over time
- area    → same as line, but cumulative volume or the magnitude of the filled area is meaningful
- scatter → two numeric columns with potential correlation; no natural categorical X axis
- table   → many mixed columns, catalog or detail query, or no clear numeric aggregation focus
- bar     → ranking, categorical comparison, or distribution with >15 categories (default fallback)

Axis rules:
- x_key: the column that uniquely identifies each row in the context of the question (the label/category, never an id or metadata column)
- y_keys: the numeric columns the question is asking about, most important first
- For scatter: x_key = first numeric variable, y_keys = second numeric variable
- For table: x_key = first column, y_keys = remaining columns
- Never select id columns, surrogate keys, or row-number columns as x_key or y_keys"""

    raw = llm.invoke(prompt).strip()
    raw = re.sub(r"<think>[\s\S]*?</think>", "", raw, flags=re.IGNORECASE).strip()
    lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]

    chart_type = lines[0].lower().split()[0] if lines else "bar"
    if chart_type not in VALID_CHART_TYPES:
        chart_type = chart_hint if chart_hint in VALID_CHART_TYPES else "bar"

    chart_title = lines[1] if len(lines) > 1 else question[:60]
    logger.info(
        "Chart suggested | type=%s | hint=%s | title=%s",
        chart_type, chart_hint, chart_title,
    )

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


def _serialize_rows(rows: list[list]) -> list[list]:
    """Convert non-JSON-serializable types to strings."""
    return [
        [str(v) if not isinstance(v, (int, float, str, bool, type(None))) else v for v in row]
        for row in rows
    ]


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
    t_start = time.perf_counter()
    logger.info(
        "Pipeline start | source=%s | provider=%s | model=%s | question=%s",
        session_id or "sqlite_default",
        llm.provider_name,
        llm.model,
        question[:120],
    )

    # Select engine
    if engine is None:
        if session_id:
            from app.data_loader import get_engine_for_session
            engine = get_engine_for_session(session_id)
        if engine is None:
            engine = readonly_engine
    db_type = _get_db_type(engine)

    ddl = get_schema_ddl(engine)

    # Step 1: Plan (LLM decides limit, chart need, chart hint)
    plan = _plan_query(question, ddl, history=history)

    # Step 2: Generate SQL (with plan + conversation context)
    sql = _generate_sql(question, ddl, db_type, history=history, plan=plan)

    # Step 3: Execute with retries
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
                logger.warning("Attempt %d/%d failed | error=%s", attempt + 1, MAX_RETRIES, last_error[:200])
                sql = _fix_sql(sql, last_error, question, ddl, db_type)
            else:
                logger.error("Pipeline failed after %d retries | last_error=%s", MAX_RETRIES, last_error[:200])
                raise RuntimeError(
                    f"Failed to execute SQL after {MAX_RETRIES} retries. Last error: {last_error}"
                ) from exc

    # Step 4: Summarize
    summary = _summarize(question, columns, rows, sql)

    # Step 5: Chart suggestion (planner decides whether and what kind)
    chart_type, chart_config, chart_title = _suggest_chart(question, columns, rows, plan=plan)

    serializable_rows = _serialize_rows(rows)

    logger.info(
        "Pipeline done in %.2fs | rows=%d | chart=%s | intent=%s",
        time.perf_counter() - t_start,
        len(rows),
        chart_type,
        plan["intent"],
    )

    return {
        "question": question,
        "sql": sql,
        "columns": columns,
        "rows": serializable_rows,
        "summary": summary,
        "chart_type": chart_type,
        "chart_config": chart_config,
        "chart_title": chart_title,
        "plan": plan,
        "source": session_id or "sqlite_default",
        "llm_provider": llm.provider_name,
        "llm_model": llm.model,
    }
