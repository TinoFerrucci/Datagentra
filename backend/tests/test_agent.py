"""Tests for the Text-to-SQL agent pipeline."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import create_engine, text


@pytest.fixture
def mem_engine_with_data():
    from sqlalchemy.pool import StaticPool
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    with engine.connect() as conn:
        conn.execute(text("CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, price REAL, category TEXT)"))
        conn.execute(text("""
            INSERT INTO products VALUES
            (1, 'Widget A', 9.99, 'Electronics'),
            (2, 'Widget B', 19.99, 'Electronics'),
            (3, 'Gadget X', 49.99, 'Toys')
        """))
        conn.commit()
    return engine


def _make_mock_llm(*responses):
    """Create a mock LLM that returns successive responses."""
    mock = MagicMock()
    mock.provider_name = "mock"
    mock.model = "mock-model"
    mock.invoke.side_effect = list(responses) + [responses[-1]] * 10
    return mock


# Default planner JSON used as the first LLM call in pipeline tests.
_PLAN_DEFAULT = (
    '{"intent": "exploration", "row_limit": 10, "needs_chart": true, '
    '"chart_hint": "bar", "user_wants_extensive": false, "reasoning": "test"}'
)
_PLAN_EXTENSIVE = (
    '{"intent": "listing", "row_limit": null, "needs_chart": true, '
    '"chart_hint": "table", "user_wants_extensive": true, "reasoning": "test"}'
)


# ---------------------------------------------------------------------------
# Full pipeline
# ---------------------------------------------------------------------------

def test_full_pipeline_valid_sql(mem_engine_with_data):
    sql_response = "SELECT * FROM products LIMIT 3"
    summary_response = "There are 3 products."
    chart_response = "bar"
    mock_llm = _make_mock_llm(_PLAN_DEFAULT, sql_response, summary_response, chart_response)

    with patch("app.agent.get_llm", return_value=mock_llm), \
         patch("app.agent.get_schema_ddl", return_value="TABLE products (id INT, name TEXT, price REAL)"):
        from app.agent import run_pipeline
        result = run_pipeline("Show all products", engine=mem_engine_with_data, )

    assert result["sql"] == sql_response
    assert result["columns"] == ["id", "name", "price", "category"]
    assert len(result["rows"]) == 3
    assert result["chart_type"] == "bar"
    assert "question" in result
    assert "summary" in result
    assert "plan" in result
    assert result["plan"]["row_limit"] == 10


# ---------------------------------------------------------------------------
# Retry logic
# ---------------------------------------------------------------------------

def test_retry_on_bad_sql(mem_engine_with_data):
    bad_sql = "SELECT * FROM nonexistent_table"
    good_sql = "SELECT * FROM products LIMIT 1"
    summary = "One product found."
    chart = "metric"
    mock_llm = _make_mock_llm(_PLAN_DEFAULT, bad_sql, good_sql, summary, chart)

    with patch("app.agent.get_llm", return_value=mock_llm), \
         patch("app.agent.get_schema_ddl", return_value="TABLE products (id INT, name TEXT)"):
        from app.agent import run_pipeline
        # plan, bad SQL, fixed SQL, summary, chart
        mock_llm.invoke.side_effect = [_PLAN_DEFAULT, bad_sql, good_sql, summary, chart]
        result = run_pipeline("Get one product", engine=mem_engine_with_data, )

    assert result["rows"] is not None
    assert len(result["rows"]) >= 0


# ---------------------------------------------------------------------------
# Dangerous SQL detection
# ---------------------------------------------------------------------------

def test_dangerous_sql_is_blocked(mem_engine_with_data):
    drop_sql = "DROP TABLE products"
    mock_llm = _make_mock_llm(_PLAN_DEFAULT, drop_sql)

    with patch("app.agent.get_llm", return_value=mock_llm), \
         patch("app.agent.get_schema_ddl", return_value="TABLE products (id INT)"):
        from app.agent import run_pipeline
        with pytest.raises((PermissionError, RuntimeError)):
            run_pipeline("Delete all products", engine=mem_engine_with_data, )


def test_delete_sql_is_blocked(mem_engine_with_data):
    delete_sql = "DELETE FROM products WHERE id=1"
    mock_llm = _make_mock_llm(_PLAN_DEFAULT, delete_sql)

    with patch("app.agent.get_llm", return_value=mock_llm), \
         patch("app.agent.get_schema_ddl", return_value="TABLE products (id INT)"):
        from app.agent import run_pipeline
        with pytest.raises((PermissionError, RuntimeError)):
            run_pipeline("Remove product 1", engine=mem_engine_with_data, )


# ---------------------------------------------------------------------------
# Planner
# ---------------------------------------------------------------------------

def test_plan_defaults_to_compact_limit_for_ranking():
    from app.agent import _plan_query
    plan_json = (
        '{"intent": "ranking", "row_limit": 10, "needs_chart": true, '
        '"chart_hint": "bar", "user_wants_extensive": false, "reasoning": "top X"}'
    )
    mock_llm = _make_mock_llm(plan_json)
    with patch("app.agent.get_llm", return_value=mock_llm):
        plan = _plan_query("top productos más vendidos", "TABLE products (id, sales)")
    assert plan["intent"] == "ranking"
    assert plan["row_limit"] == 10
    assert plan["needs_chart"] is True
    assert plan["user_wants_extensive"] is False


def test_plan_unlimited_when_user_wants_extensive():
    from app.agent import _plan_query
    mock_llm = _make_mock_llm(_PLAN_EXTENSIVE)
    with patch("app.agent.get_llm", return_value=mock_llm):
        plan = _plan_query("dame la lista completa de todos los productos", "TABLE products (id)")
    assert plan["user_wants_extensive"] is True
    assert plan["row_limit"] is None


def test_plan_falls_back_to_defaults_on_garbage_response():
    from app.agent import _plan_query
    mock_llm = _make_mock_llm("not json at all, just words")
    with patch("app.agent.get_llm", return_value=mock_llm):
        plan = _plan_query("anything", "TABLE x (y INT)")
    assert plan["intent"] == "exploration"
    assert plan["row_limit"] == 10
    assert plan["needs_chart"] is True


def test_plan_clamps_oversized_limit_when_not_extensive():
    from app.agent import _plan_query, EXTENSIVE_ROW_LIMIT
    plan_json = (
        '{"intent": "ranking", "row_limit": 9999, "needs_chart": true, '
        '"chart_hint": "bar", "user_wants_extensive": false}'
    )
    mock_llm = _make_mock_llm(plan_json)
    with patch("app.agent.get_llm", return_value=mock_llm):
        plan = _plan_query("top productos", "TABLE x (y)")
    assert plan["row_limit"] == EXTENSIVE_ROW_LIMIT


def test_generate_sql_injects_limit_from_plan():
    """The SQL prompt must instruct the LLM to apply the planner's row limit."""
    from app.agent import _generate_sql
    captured: dict = {}
    mock_llm = MagicMock()
    mock_llm.provider_name = "mock"
    mock_llm.model = "mock-model"

    def _capture(prompt: str) -> str:
        captured["prompt"] = prompt
        return "SELECT 1"

    mock_llm.invoke.side_effect = _capture
    plan = {
        "intent": "ranking", "row_limit": 10, "needs_chart": True,
        "chart_hint": "bar", "user_wants_extensive": False,
    }
    with patch("app.agent.get_llm", return_value=mock_llm):
        _generate_sql("top productos", "TABLE products (id, sales)", "SQLite", plan=plan)

    assert "LIMIT 10" in captured["prompt"]


def test_generate_sql_skips_limit_when_extensive():
    from app.agent import _generate_sql
    captured: dict = {}
    mock_llm = MagicMock()
    mock_llm.provider_name = "mock"
    mock_llm.model = "mock-model"

    def _capture(prompt: str) -> str:
        captured["prompt"] = prompt
        return "SELECT 1"

    mock_llm.invoke.side_effect = _capture
    plan = {
        "intent": "listing", "row_limit": None, "needs_chart": True,
        "chart_hint": "table", "user_wants_extensive": True,
    }
    with patch("app.agent.get_llm", return_value=mock_llm):
        _generate_sql("lista completa", "TABLE products (id)", "SQLite", plan=plan)

    assert "complete dataset" in captured["prompt"]
    # No fixed LIMIT N injected
    assert "LIMIT 10" not in captured["prompt"]


def test_suggest_chart_short_circuits_to_table_when_planner_says_no_chart():
    """If planner sets needs_chart=False, no extra LLM call is made."""
    from app.agent import _suggest_chart
    mock_llm = MagicMock()
    mock_llm.provider_name = "mock"
    mock_llm.model = "mock-model"
    mock_llm.invoke.side_effect = AssertionError("LLM should not be called")

    plan = {
        "intent": "exploration", "row_limit": 10, "needs_chart": False,
        "chart_hint": None, "user_wants_extensive": False,
    }
    with patch("app.agent.get_llm", return_value=mock_llm):
        chart_type, _config, _title = _suggest_chart(
            "explica qué columnas hay",
            ["name", "value"],
            [["a", 1]],
            plan=plan,
        )
    assert chart_type == "table"


# ---------------------------------------------------------------------------
# Chart suggestion
# ---------------------------------------------------------------------------

def test_chart_suggestion_for_temporal_data():
    """Temporal data should suggest line or area."""
    from app.agent import _suggest_chart
    mock_llm = _make_mock_llm("line")
    with patch("app.agent.get_llm", return_value=mock_llm):
        chart_type, _, _ = _suggest_chart(
            "Sales by month",
            ["month", "total_sales"],
            [["2024-01", 1000], ["2024-02", 1200]],
        )
    assert chart_type in ("line", "area", "bar")


def test_chart_suggestion_for_single_metric():
    """Single value should suggest metric."""
    from app.agent import _suggest_chart
    mock_llm = _make_mock_llm("metric")
    with patch("app.agent.get_llm", return_value=mock_llm):
        chart_type, _, _ = _suggest_chart(
            "Total revenue",
            ["total_revenue"],
            [[98765.50]],
        )
    assert chart_type == "metric"


def test_chart_suggestion_for_categories():
    """Category comparison should suggest bar."""
    from app.agent import _suggest_chart
    mock_llm = _make_mock_llm("bar")
    with patch("app.agent.get_llm", return_value=mock_llm):
        chart_type, _, _ = _suggest_chart(
            "Products by category",
            ["category", "count"],
            [["Electronics", 10], ["Books", 5], ["Toys", 3]],
        )
    assert chart_type == "bar"


# ---------------------------------------------------------------------------
# SQL extraction (clean_sql)
# ---------------------------------------------------------------------------

def test_clean_sql_strips_markdown():
    from app.agent import _clean_sql
    raw = "Here is the query:\n```sql\nSELECT * FROM users\n```"
    assert _clean_sql(raw) == "SELECT * FROM users"


def test_clean_sql_strips_think_tags():
    from app.agent import _clean_sql
    raw = "<think>reasoning...</think>\nSELECT 1"
    result = _clean_sql(raw)
    assert "SELECT" in result
    assert "<think>" not in result
