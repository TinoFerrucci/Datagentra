"""Integration tests for FastAPI endpoints."""
from __future__ import annotations

import io
import sqlite3
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text


def _make_test_engine():
    from sqlalchemy.pool import StaticPool
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    with engine.connect() as conn:
        conn.execute(text("CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, price REAL)"))
        conn.execute(text("INSERT INTO products VALUES (1,'Prod A',10.0),(2,'Prod B',20.0)"))
        conn.commit()
    return engine


def _make_mock_llm(responses: list[str]):
    mock = MagicMock()
    mock.provider_name = "mock"
    mock.model = "mock-model"
    mock.invoke.side_effect = responses + [responses[-1]] * 20
    return mock


@pytest.fixture(scope="module")
def test_engine():
    return _make_test_engine()


@pytest.fixture(scope="module")
def client(test_engine):
    from app.main import app
    with TestClient(app) as c:
        yield c


# ---------------------------------------------------------------------------
# /health
# ---------------------------------------------------------------------------

def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# /api/ask
# ---------------------------------------------------------------------------

_PLAN_DEFAULT = (
    '{"intent": "exploration", "row_limit": 10, "needs_chart": true, '
    '"chart_hint": "bar", "user_wants_extensive": false, "reasoning": "test"}'
)


def test_ask_returns_required_fields(test_engine):
    mock_llm = _make_mock_llm([
        _PLAN_DEFAULT,
        "SELECT * FROM products LIMIT 2",
        "Two products found with prices 10 and 20.",
        "bar",
    ])
    from app.main import app
    with patch("app.agent.readonly_engine", test_engine), \
         patch("app.agent.get_llm", return_value=mock_llm), \
         patch("app.agent.get_schema_ddl", return_value="TABLE products (id INT, name TEXT, price REAL)"):
        with TestClient(app) as c:
            resp = c.post("/api/ask", json={"question": "Show me all products"})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    for field in ("question", "sql", "columns", "rows", "summary", "chart_type", "plan"):
        assert field in data, f"Missing field: {field}"
    assert data["plan"]["row_limit"] == 10


def test_ask_returns_error_on_pipeline_failure(test_engine):
    mock_llm = _make_mock_llm([_PLAN_DEFAULT, "NOT VALID SQL $$$$$$$$$"])
    from app.main import app
    with patch("app.agent.readonly_engine", test_engine), \
         patch("app.agent.get_llm", return_value=mock_llm), \
         patch("app.agent.get_schema_ddl", return_value="TABLE products (id INT)"):
        with TestClient(app) as c:
            resp = c.post("/api/ask", json={"question": "break things"})
    assert resp.status_code in (422, 500)


# ---------------------------------------------------------------------------
# /api/upload
# ---------------------------------------------------------------------------

def test_upload_valid_csv_returns_200(client):
    df = pd.DataFrame({"a": [1, 2], "b": ["x", "y"]})
    buf = io.BytesIO()
    df.to_csv(buf, index=False)
    buf.seek(0)
    resp = client.post("/api/upload", files={"file": ("data.csv", buf, "text/csv")})
    assert resp.status_code == 200
    data = resp.json()
    assert data["source_type"] == "csv"
    assert "session_id" in data


def test_upload_invalid_extension_returns_422(client):
    resp = client.post(
        "/api/upload",
        files={"file": ("data.txt", b"col1,col2\n1,2", "text/plain")},
    )
    assert resp.status_code == 422


def test_upload_csv_too_many_columns_returns_422(client):
    cols = {f"col_{i}": [1, 2] for i in range(35)}
    df = pd.DataFrame(cols)
    buf = io.BytesIO()
    df.to_csv(buf, index=False)
    buf.seek(0)
    resp = client.post("/api/upload", files={"file": ("wide.csv", buf, "text/csv")})
    assert resp.status_code == 422
    assert "30" in resp.json()["detail"]


def test_upload_valid_sqlite(client, tmp_path):
    db_path = tmp_path / "test.db"
    conn = sqlite3.connect(str(db_path))
    conn.execute("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)")
    conn.execute("INSERT INTO items VALUES (1,'foo')")
    conn.commit()
    conn.close()
    with open(db_path, "rb") as f:
        resp = client.post("/api/upload", files={"file": ("test.db", f, "application/octet-stream")})
    assert resp.status_code == 200
    assert resp.json()["source_type"] == "sqlite"


# ---------------------------------------------------------------------------
# /api/upload/fix
# ---------------------------------------------------------------------------

def test_upload_fix_renames_column(client):
    df = pd.DataFrame({"col1": [1, 2], "col2": ["a", "b"]})
    buf = io.BytesIO()
    df.to_csv(buf, index=False)
    buf.seek(0)
    upload_resp = client.post("/api/upload", files={"file": ("fix_test.csv", buf, "text/csv")})
    assert upload_resp.status_code == 200
    session_id = upload_resp.json()["session_id"]

    mock_llm = MagicMock()
    mock_llm.invoke.return_value = '{"action": "rename", "old_name": "col1", "new_name": "revenue"}'
    with patch("app.llm_provider._llm_instance", mock_llm):
        fix_resp = client.post("/api/upload/fix", json={"session_id": session_id, "prompt": "rename col1 to revenue"})
    assert fix_resp.status_code == 200
    data = fix_resp.json()
    assert "revenue" in data["columns_info"]


def test_upload_fix_invalid_session_returns_422(client):
    resp = client.post("/api/upload/fix", json={"session_id": "bad-id-xyz", "prompt": "rename x to y"})
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# /api/schema
# ---------------------------------------------------------------------------

def test_get_schema_returns_tables(test_engine):
    from app.main import app
    with patch("app.main.readonly_engine", test_engine), \
         patch("app.database.readonly_engine", test_engine):
        with TestClient(app) as c:
            resp = c.get("/api/schema")
    assert resp.status_code == 200
    data = resp.json()
    assert "tables" in data
    assert "source_type" in data


# ---------------------------------------------------------------------------
# /api/datasource
# ---------------------------------------------------------------------------

def test_list_datasources(client):
    resp = client.get("/api/datasource")
    assert resp.status_code == 200
    data = resp.json()
    assert "sources" in data
    ids = [s["id"] for s in data["sources"]]
    assert "sqlite_default" in ids


def test_switch_to_sqlite_default(client):
    resp = client.put("/api/datasource", json={"source_id": "sqlite_default"})
    assert resp.status_code == 200
    assert resp.json()["active_source"]["id"] == "sqlite_default"


def test_switch_to_nonexistent_session_returns_404(client):
    resp = client.put("/api/datasource", json={"source_id": "nonexistent-xyz"})
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# /api/suggest — auth error mapping
# ---------------------------------------------------------------------------

class _FakeAuthError(Exception):
    """Simulates the openai.AuthenticationError shape."""
    def __init__(self, message: str = "Incorrect API key provided"):
        super().__init__(message)
        self.status_code = 401


def test_suggest_returns_401_on_llm_auth_error(test_engine):
    mock_llm = MagicMock()
    mock_llm.provider_name = "openai"
    mock_llm.model = "gpt-4o-mini"
    mock_llm.invoke.side_effect = _FakeAuthError()

    from app.main import app
    with patch("app.main.readonly_engine", test_engine), \
         patch("app.database.readonly_engine", test_engine), \
         patch("app.main.get_llm", return_value=mock_llm):
        with TestClient(app) as c:
            resp = c.get("/api/suggest")

    assert resp.status_code == 401
    assert "API key" in resp.json()["detail"]


def test_suggest_returns_401_on_message_based_auth_error(test_engine):
    """Even if status_code is missing, message keywords should map to 401."""
    mock_llm = MagicMock()
    mock_llm.provider_name = "openai"
    mock_llm.model = "gpt-4o-mini"
    mock_llm.invoke.side_effect = RuntimeError("Error code: 401 - {'error': {'message': 'Incorrect API key'}}")

    from app.main import app
    with patch("app.main.readonly_engine", test_engine), \
         patch("app.database.readonly_engine", test_engine), \
         patch("app.main.get_llm", return_value=mock_llm):
        with TestClient(app) as c:
            resp = c.get("/api/suggest")

    assert resp.status_code == 401


def test_suggest_returns_500_on_generic_failure(test_engine):
    mock_llm = MagicMock()
    mock_llm.provider_name = "ollama"
    mock_llm.model = "qwen2.5"
    mock_llm.invoke.side_effect = RuntimeError("connection refused")

    from app.main import app
    with patch("app.main.readonly_engine", test_engine), \
         patch("app.database.readonly_engine", test_engine), \
         patch("app.main.get_llm", return_value=mock_llm):
        with TestClient(app) as c:
            resp = c.get("/api/suggest")

    assert resp.status_code == 500
