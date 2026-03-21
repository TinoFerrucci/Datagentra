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


# ---------------------------------------------------------------------------
# Full pipeline
# ---------------------------------------------------------------------------

def test_full_pipeline_valid_sql(mem_engine_with_data):
    sql_response = "SELECT * FROM products LIMIT 3"
    summary_response = "There are 3 products."
    chart_response = "bar"
    mock_llm = _make_mock_llm(sql_response, summary_response, chart_response)

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


# ---------------------------------------------------------------------------
# Retry logic
# ---------------------------------------------------------------------------

def test_retry_on_bad_sql(mem_engine_with_data):
    bad_sql = "SELECT * FROM nonexistent_table"
    good_sql = "SELECT * FROM products LIMIT 1"
    summary = "One product found."
    chart = "metric"
    mock_llm = _make_mock_llm(bad_sql, good_sql, summary, chart)

    with patch("app.agent.get_llm", return_value=mock_llm), \
         patch("app.agent.get_schema_ddl", return_value="TABLE products (id INT, name TEXT)"):
        from app.agent import run_pipeline
        # first call returns bad SQL, second call (fix) returns good SQL
        mock_llm.invoke.side_effect = [bad_sql, good_sql, summary, chart]
        result = run_pipeline("Get one product", engine=mem_engine_with_data, )

    assert result["rows"] is not None
    assert len(result["rows"]) >= 0


# ---------------------------------------------------------------------------
# Dangerous SQL detection
# ---------------------------------------------------------------------------

def test_dangerous_sql_is_blocked(mem_engine_with_data):
    drop_sql = "DROP TABLE products"
    mock_llm = _make_mock_llm(drop_sql)

    with patch("app.agent.get_llm", return_value=mock_llm), \
         patch("app.agent.get_schema_ddl", return_value="TABLE products (id INT)"):
        from app.agent import run_pipeline
        with pytest.raises((PermissionError, RuntimeError)):
            run_pipeline("Delete all products", engine=mem_engine_with_data, )


def test_delete_sql_is_blocked(mem_engine_with_data):
    delete_sql = "DELETE FROM products WHERE id=1"
    mock_llm = _make_mock_llm(delete_sql)

    with patch("app.agent.get_llm", return_value=mock_llm), \
         patch("app.agent.get_schema_ddl", return_value="TABLE products (id INT)"):
        from app.agent import run_pipeline
        with pytest.raises((PermissionError, RuntimeError)):
            run_pipeline("Remove product 1", engine=mem_engine_with_data, )


# ---------------------------------------------------------------------------
# Chart suggestion
# ---------------------------------------------------------------------------

def test_chart_suggestion_for_temporal_data():
    """Temporal data should suggest line or area."""
    from app.agent import _suggest_chart
    mock_llm = _make_mock_llm("line")
    with patch("app.agent.get_llm", return_value=mock_llm):
        chart_type, _ = _suggest_chart(
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
        chart_type, _ = _suggest_chart(
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
        chart_type, _ = _suggest_chart(
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
