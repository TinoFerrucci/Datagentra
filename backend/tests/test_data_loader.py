"""Tests for data loader: CSV and SQLite upload, validation, correction."""
from __future__ import annotations

import io
import sqlite3
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from app.data_loader import (
    ValidationError,
    apply_correction,
    get_session,
    load_csv,
    load_sqlite,
)


# ---------------------------------------------------------------------------
# CSV tests
# ---------------------------------------------------------------------------

def test_load_valid_csv(simple_csv_bytes):
    result = load_csv(simple_csv_bytes, "test.csv")
    assert result["source_type"] == "csv"
    assert "schema_analysis" in result
    assert "preview_rows" in result
    assert "columns_info" in result
    assert len(result["preview_rows"]) > 0


def test_csv_columns_info_has_dtype(simple_csv_bytes):
    result = load_csv(simple_csv_bytes, "test.csv")
    cols = result["columns_info"]
    assert "price" in cols
    assert cols["price"]["dtype"] in ("INT", "FLOAT", "VARCHAR")


def test_csv_too_many_columns_raises(wide_csv_bytes):
    with pytest.raises(ValidationError, match="30"):
        load_csv(wide_csv_bytes, "wide.csv")


def test_csv_preview_has_10_or_fewer_rows(simple_csv_bytes):
    result = load_csv(simple_csv_bytes, "test.csv")
    assert len(result["preview_rows"]) <= 10


def test_csv_session_stored(simple_csv_bytes):
    result = load_csv(simple_csv_bytes, "s.csv")
    session_id = result["session_id"]
    assert get_session(session_id) is not None


def test_csv_dtype_inference():
    df = pd.DataFrame({
        "age": [25, 30, 35],
        "score": [1.5, 2.5, 3.5],
        "date": pd.to_datetime(["2024-01-01", "2024-02-01", "2024-03-01"]),
        "name": ["Alice", "Bob", "Carol"],
    })
    buf = io.BytesIO()
    df.to_csv(buf, index=False)
    result = load_csv(buf.getvalue(), "types.csv")
    cols = result["columns_info"]
    assert cols["age"]["dtype"] in ("INT", "FLOAT")
    assert cols["score"]["dtype"] == "FLOAT"
    assert cols["name"]["dtype"] == "VARCHAR"


# ---------------------------------------------------------------------------
# SQLite tests
# ---------------------------------------------------------------------------

def test_load_valid_sqlite(simple_sqlite_bytes):
    result = load_sqlite(simple_sqlite_bytes, "test.db")
    assert result["source_type"] == "sqlite"
    assert result["table_count"] >= 1
    assert "columns_info" in result


def test_sqlite_too_many_tables_raises(many_tables_sqlite_bytes):
    with pytest.raises(ValidationError, match="20"):
        load_sqlite(many_tables_sqlite_bytes, "many.db")


def test_sqlite_too_many_columns_raises(tmp_path):
    db_path = tmp_path / "wide.db"
    conn = sqlite3.connect(str(db_path))
    cols = ", ".join(f"col_{i} TEXT" for i in range(35))
    conn.execute(f"CREATE TABLE wide_table ({cols})")
    conn.commit()
    conn.close()
    with pytest.raises(ValidationError, match="30"):
        load_sqlite(db_path.read_bytes(), "wide.db")


# ---------------------------------------------------------------------------
# Correction tests
# ---------------------------------------------------------------------------

def _make_rename_session():
    df = pd.DataFrame({"col1": [1, 2], "col2": ["a", "b"]})
    buf = io.BytesIO()
    df.to_csv(buf, index=False)
    result = load_csv(buf.getvalue(), "rename_test.csv")
    return result["session_id"]


def _mock_llm(response: str) -> MagicMock:
    mock = MagicMock()
    mock.invoke.return_value = response
    return mock


def test_correction_rename_column():
    session_id = _make_rename_session()
    llm = _mock_llm('{"action": "rename", "old_name": "col1", "new_name": "revenue"}')
    with patch("app.llm_provider._llm_instance", llm):
        result = apply_correction(session_id, "rename col1 to revenue")
    assert "revenue" in result["columns_info"]
    assert "col1" not in result["columns_info"]


def test_correction_rename_spanish():
    session_id = _make_rename_session()
    llm = _mock_llm('{"action": "rename", "old_name": "col1", "new_name": "ingresos"}')
    with patch("app.llm_provider._llm_instance", llm):
        result = apply_correction(session_id, "renombra col1 a ingresos")
    assert "ingresos" in result["columns_info"]


def test_correction_invalid_session_raises():
    with pytest.raises(ValidationError, match="not found"):
        apply_correction("nonexistent-session-id", "rename col1 to x")


def test_correction_drop_column():
    df = pd.DataFrame({"a": [1, 2], "b": ["x", "y"], "unnamed_0": [0, 1]})
    buf = io.BytesIO()
    df.to_csv(buf, index=False)
    result = load_csv(buf.getvalue(), "drop_test.csv")
    session_id = result["session_id"]
    llm = _mock_llm('{"action": "drop", "column": "unnamed_0"}')
    with patch("app.llm_provider._llm_instance", llm):
        result2 = apply_correction(session_id, "elimina columna unnamed_0")
    assert "unnamed_0" not in result2["columns_info"]
