"""Tests for database engines and DDL helpers."""
from __future__ import annotations

import pytest
from sqlalchemy import create_engine, text

from app.database import _make_engine, _make_readonly_engine, get_schema_ddl, get_schema_info


@pytest.fixture
def mem_engine():
    """Writable in-memory SQLite with sample data."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    with engine.connect() as conn:
        conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE)"))
        conn.execute(text("INSERT INTO users VALUES (1, 'Alice', 'alice@test.com')"))
        conn.execute(text("INSERT INTO users VALUES (2, 'Bob', 'bob@test.com')"))
        conn.commit()
    return engine


def _make_preloaded_readonly() -> tuple:
    """Return (rw_engine, ro_engine) sharing same in-memory file via URI."""
    import tempfile, os
    # Use file-based SQLite so both engines share the same data
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    path = tmp.name

    rw = create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})
    ro = _make_readonly_engine(f"sqlite:///{path}")
    return rw, ro, path


def test_readonly_engine_blocks_insert():
    rw, ro, _ = _make_preloaded_readonly()
    with rw.connect() as conn:
        conn.execute(text("CREATE TABLE t (id INTEGER)"))
        conn.commit()
    with pytest.raises(PermissionError, match="INSERT"):
        with ro.connect() as conn:
            conn.execute(text("INSERT INTO t VALUES (1)"))


def test_readonly_engine_blocks_update():
    rw, ro, _ = _make_preloaded_readonly()
    with rw.connect() as conn:
        conn.execute(text("CREATE TABLE t2 (id INTEGER, val TEXT)"))
        conn.commit()
    with pytest.raises(PermissionError, match="UPDATE"):
        with ro.connect() as conn:
            conn.execute(text("UPDATE t2 SET val='x' WHERE id=1"))


def test_readonly_engine_blocks_delete():
    rw, ro, _ = _make_preloaded_readonly()
    with rw.connect() as conn:
        conn.execute(text("CREATE TABLE t3 (id INTEGER)"))
        conn.commit()
    with pytest.raises(PermissionError, match="DELETE"):
        with ro.connect() as conn:
            conn.execute(text("DELETE FROM t3 WHERE id=1"))


def test_readonly_engine_blocks_drop():
    rw, ro, _ = _make_preloaded_readonly()
    with rw.connect() as conn:
        conn.execute(text("CREATE TABLE t4 (id INTEGER)"))
        conn.commit()
    with pytest.raises(PermissionError, match="DROP"):
        with ro.connect() as conn:
            conn.execute(text("DROP TABLE t4"))


def test_readonly_engine_allows_select():
    rw, ro, _ = _make_preloaded_readonly()
    with rw.connect() as conn:
        conn.execute(text("CREATE TABLE t5 (id INTEGER, name TEXT)"))
        conn.execute(text("INSERT INTO t5 VALUES (1, 'hello')"))
        conn.commit()
    with ro.connect() as conn:
        result = conn.execute(text("SELECT * FROM t5"))
        rows = result.fetchall()
    assert len(rows) == 1


def test_get_schema_ddl_returns_table_info(mem_engine):
    ddl = get_schema_ddl(mem_engine)
    assert "users" in ddl


def test_get_schema_info_returns_row_count(mem_engine):
    info = get_schema_info(mem_engine)
    assert "users" in info
    assert info["users"]["row_count"] == 2
    assert len(info["users"]["columns"]) == 3
