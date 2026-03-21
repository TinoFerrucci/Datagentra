"""Shared test fixtures."""
from __future__ import annotations

import io
import os
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# ---------------------------------------------------------------------------
# SQLite in-memory test database
# ---------------------------------------------------------------------------

TEST_DB_URL = "sqlite:///:memory:"


@pytest.fixture(scope="session")
def test_engine():
    from sqlalchemy.pool import StaticPool
    engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool)
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                price REAL NOT NULL,
                category TEXT
            )
        """))
        conn.execute(text("""
            INSERT OR IGNORE INTO products VALUES
            (1, 'Widget A', 9.99, 'Electronics'),
            (2, 'Widget B', 19.99, 'Electronics'),
            (3, 'Gadget X', 49.99, 'Toys'),
            (4, 'Book Y', 14.99, 'Books')
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY,
                product_id INTEGER,
                quantity INTEGER,
                total REAL
            )
        """))
        conn.execute(text("""
            INSERT OR IGNORE INTO orders VALUES
            (1, 1, 2, 19.98),
            (2, 3, 1, 49.99),
            (3, 2, 3, 59.97)
        """))
        conn.commit()
    return engine


# ---------------------------------------------------------------------------
# Mock LLM
# ---------------------------------------------------------------------------

class MockLLM:
    provider_name = "mock"
    model = "mock-model"
    _response = "SELECT * FROM products LIMIT 5"

    def invoke(self, prompt: str) -> str:
        return self._response


@pytest.fixture
def mock_llm():
    return MockLLM()


@pytest.fixture(autouse=False)
def patch_llm(mock_llm):
    with patch("app.llm_provider._llm_instance", mock_llm):
        with patch("app.agent.get_llm", return_value=mock_llm):
            yield mock_llm


# ---------------------------------------------------------------------------
# FastAPI TestClient
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def test_app(test_engine):
    # Patch the engines before importing main
    with patch("app.database.readonly_engine", test_engine), \
         patch("app.database.readwrite_engine", test_engine):
        from app.main import app
        client = TestClient(app)
        yield client


# ---------------------------------------------------------------------------
# Sample CSV content
# ---------------------------------------------------------------------------

@pytest.fixture
def simple_csv_bytes():
    df = pd.DataFrame({
        "product": ["A", "B", "C"],
        "price": [10.0, 20.0, 30.0],
        "quantity": [5, 3, 8],
        "category": ["Electronics", "Books", "Toys"],
    })
    buf = io.BytesIO()
    df.to_csv(buf, index=False)
    return buf.getvalue()


@pytest.fixture
def wide_csv_bytes():
    """CSV with > 30 columns."""
    cols = {f"col_{i}": range(3) for i in range(35)}
    df = pd.DataFrame(cols)
    buf = io.BytesIO()
    df.to_csv(buf, index=False)
    return buf.getvalue()


@pytest.fixture
def simple_sqlite_bytes(tmp_path):
    """Small SQLite .db file."""
    db_path = tmp_path / "test.db"
    import sqlite3
    conn = sqlite3.connect(str(db_path))
    conn.execute("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT, value REAL)")
    conn.execute("INSERT INTO items VALUES (1, 'foo', 1.5), (2, 'bar', 2.5)")
    conn.commit()
    conn.close()
    return db_path.read_bytes()


@pytest.fixture
def many_tables_sqlite_bytes(tmp_path):
    """SQLite .db file with > 20 tables."""
    db_path = tmp_path / "many.db"
    import sqlite3
    conn = sqlite3.connect(str(db_path))
    for i in range(22):
        conn.execute(f"CREATE TABLE t_{i} (id INTEGER PRIMARY KEY, val TEXT)")
    conn.commit()
    conn.close()
    return db_path.read_bytes()
