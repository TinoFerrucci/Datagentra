"""Data loader: handles CSV and SQLite file uploads, validation, analysis, and correction."""
from __future__ import annotations

import io
import os
import sqlite3
import uuid
from pathlib import Path
from typing import Any

import pandas as pd
from sqlalchemy import create_engine, inspect as sa_inspect, text

MAX_COLUMNS = 30
MAX_TABLES = 20
MAX_FILE_SIZE_MB = int(os.getenv("MAX_UPLOAD_SIZE_MB", "50"))


class ValidationError(Exception):
    pass


# ---------------------------------------------------------------------------
# In-memory session store
# ---------------------------------------------------------------------------

_sessions: dict[str, dict] = {}


def get_session(session_id: str) -> dict | None:
    return _sessions.get(session_id)


def set_session(session_id: str, data: dict) -> None:
    _sessions[session_id] = data


def delete_session(session_id: str) -> None:
    _sessions.pop(session_id, None)


def list_sessions() -> list[str]:
    return list(_sessions.keys())


# ---------------------------------------------------------------------------
# Column analysis helpers
# ---------------------------------------------------------------------------

def _infer_dtype_label(series: pd.Series) -> str:
    dtype = str(series.dtype)
    if "int" in dtype:
        return "INT"
    if "float" in dtype:
        return "FLOAT"
    if "datetime" in dtype or "date" in dtype:
        return "DATE"
    if "bool" in dtype:
        return "BOOLEAN"
    return "VARCHAR"


def _analyze_column(series: pd.Series) -> dict:
    dtype_label = _infer_dtype_label(series)
    total = len(series)
    null_count = int(series.isna().sum())
    null_pct = round(null_count / total * 100, 1) if total > 0 else 0.0
    unique_count = int(series.nunique(dropna=True))

    info: dict[str, Any] = {
        "dtype": dtype_label,
        "null_pct": null_pct,
        "unique_count": unique_count,
    }

    if dtype_label in ("INT", "FLOAT"):
        numeric = series.dropna()
        if len(numeric) > 0:
            info["min"] = float(numeric.min())
            info["max"] = float(numeric.max())
            info["mean"] = round(float(numeric.mean()), 4)
    else:
        top = series.value_counts(dropna=True).head(5)
        info["top_values"] = top.index.tolist()

    return info


def _analyze_dataframe(df: pd.DataFrame) -> dict:
    return {col: _analyze_column(df[col]) for col in df.columns}


# ---------------------------------------------------------------------------
# CSV loader
# ---------------------------------------------------------------------------

def load_csv(content: bytes, filename: str) -> dict:
    """Load, validate, and analyze a CSV file. Returns session data."""
    size_mb = len(content) / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise ValidationError(f"File exceeds maximum size of {MAX_FILE_SIZE_MB}MB (got {size_mb:.1f}MB).")

    try:
        df = pd.read_csv(io.BytesIO(content))
    except Exception as exc:
        raise ValidationError(f"Could not parse CSV: {exc}") from exc

    if len(df.columns) > MAX_COLUMNS:
        raise ValidationError(
            f"CSV has {len(df.columns)} columns but maximum allowed is {MAX_COLUMNS}. "
            "Please reduce the number of columns before uploading."
        )

    session_id = str(uuid.uuid4())
    columns_info = _analyze_dataframe(df)
    preview = df.head(10).fillna("").to_dict(orient="records")

    session_data = {
        "session_id": session_id,
        "source_type": "csv",
        "filename": filename,
        "df": df,
        "columns_info": columns_info,
        "preview_rows": preview,
        "table_name": Path(filename).stem.replace(" ", "_").replace("-", "_"),
    }

    set_session(session_id, session_data)
    return _build_response(session_data)


def _build_response(session_data: dict) -> dict:
    df = session_data["df"]
    return {
        "session_id": session_data["session_id"],
        "source_type": session_data["source_type"],
        "filename": session_data.get("filename", ""),
        "table_count": len(df.columns) if session_data["source_type"] == "csv" else session_data.get("table_count", 1),
        "schema_analysis": session_data["columns_info"],
        "preview_rows": session_data["preview_rows"],
        "columns_info": session_data["columns_info"],
    }


# ---------------------------------------------------------------------------
# SQLite loader
# ---------------------------------------------------------------------------

def load_sqlite(content: bytes, filename: str) -> dict:
    """Load, validate, and analyze a SQLite .db file."""
    size_mb = len(content) / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise ValidationError(f"File exceeds maximum size of {MAX_FILE_SIZE_MB}MB.")

    # Write to temp file
    session_id = str(uuid.uuid4())
    tmp_path = Path(f"/tmp/datagentra_{session_id}.db")
    tmp_path.write_bytes(content)

    try:
        conn = sqlite3.connect(str(tmp_path))
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in cursor.fetchall()]
        conn.close()
    except Exception as exc:
        tmp_path.unlink(missing_ok=True)
        raise ValidationError(f"Could not open SQLite file: {exc}") from exc

    if len(tables) > MAX_TABLES:
        tmp_path.unlink(missing_ok=True)
        raise ValidationError(
            f"SQLite database has {len(tables)} tables but maximum allowed is {MAX_TABLES}."
        )

    # Validate columns per table
    engine = create_engine(f"sqlite:///{tmp_path}")
    inspector = sa_inspect(engine)

    all_columns_info: dict[str, Any] = {}
    preview_rows: list[dict] = []

    for table in tables:
        cols = inspector.get_columns(table)
        if len(cols) > MAX_COLUMNS:
            tmp_path.unlink(missing_ok=True)
            raise ValidationError(
                f"Table '{table}' has {len(cols)} columns but maximum allowed is {MAX_COLUMNS}."
            )

        try:
            df_table = pd.read_sql_table(table, engine)
            table_cols_info = _analyze_dataframe(df_table)
            all_columns_info[table] = table_cols_info
            if not preview_rows:
                preview_rows = df_table.head(10).fillna("").to_dict(orient="records")
        except Exception:
            all_columns_info[table] = {}

    session_data = {
        "session_id": session_id,
        "source_type": "sqlite",
        "filename": filename,
        "db_path": str(tmp_path),
        "tables": tables,
        "table_count": len(tables),
        "columns_info": all_columns_info,
        "preview_rows": preview_rows,
        "df": None,
    }

    set_session(session_id, session_data)

    return {
        "session_id": session_id,
        "source_type": "sqlite",
        "filename": filename,
        "table_count": len(tables),
        "schema_analysis": all_columns_info,
        "preview_rows": preview_rows,
        "columns_info": all_columns_info,
    }


# ---------------------------------------------------------------------------
# Interactive correction
# ---------------------------------------------------------------------------

def apply_correction(session_id: str, prompt: str) -> dict:
    """Apply a natural-language correction to a CSV dataframe using the LLM."""
    import json
    import re

    session = get_session(session_id)
    if session is None:
        raise ValidationError(f"Session '{session_id}' not found.")
    if session["source_type"] != "csv":
        raise ValidationError("Corrections are only supported for CSV sources.")

    df: pd.DataFrame = session["df"].copy()
    columns = list(df.columns)

    from app.llm_provider import get_llm
    llm = get_llm()

    llm_prompt = f"""You are a data transformation assistant. The user wants to modify a CSV dataset.

Current columns: {columns}

User instruction: "{prompt}"

Respond with exactly one JSON object describing the transformation. No extra text, no markdown.

Supported actions:
- {{"action": "rename", "old_name": "<exact column name from the list>", "new_name": "<new name>"}}
- {{"action": "drop", "column": "<exact column name from the list>"}}
- {{"action": "convert_date", "column": "<exact column name from the list>"}}
- {{"action": "fillna", "column": "<exact column name from the list>", "value": "<fill value>"}}
- {{"action": "unsupported", "reason": "<brief explanation in the same language as the instruction>"}}

JSON:"""

    raw = llm.invoke(llm_prompt).strip()
    raw = re.sub(r"<think>[\s\S]*?</think>", "", raw, flags=re.IGNORECASE).strip()

    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        raise ValidationError("Could not interpret the instruction. Please rephrase and try again.")

    try:
        action = json.loads(match.group())
    except json.JSONDecodeError:
        raise ValidationError("Could not interpret the instruction. Please rephrase and try again.")

    action_type = action.get("action")

    if action_type == "rename":
        old_name = action.get("old_name", "")
        new_name = action.get("new_name", "")
        matching = [c for c in df.columns if c.lower() == old_name.lower()]
        if matching:
            df = df.rename(columns={matching[0]: new_name})

    elif action_type == "drop":
        col_name = action.get("column", "")
        matching = [c for c in df.columns if c.lower() == col_name.lower()]
        if matching:
            df = df.drop(columns=matching)

    elif action_type == "convert_date":
        col_name = action.get("column", "")
        matching = [c for c in df.columns if c.lower() == col_name.lower()]
        if matching:
            try:
                df[matching[0]] = pd.to_datetime(df[matching[0]], errors="coerce")
            except Exception:
                pass

    elif action_type == "fillna":
        col_name = action.get("column", "")
        fill_val = action.get("value", "")
        matching = [c for c in df.columns if c.lower() == col_name.lower()]
        if matching:
            try:
                df[matching[0]] = df[matching[0]].fillna(fill_val)
            except Exception:
                pass

    elif action_type == "unsupported":
        raise ValidationError(action.get("reason", "Unsupported operation."))

    # Update session
    session["df"] = df
    session["columns_info"] = _analyze_dataframe(df)
    session["preview_rows"] = df.head(10).fillna("").to_dict(orient="records")
    set_session(session_id, session)

    return _build_response(session)


# ---------------------------------------------------------------------------
# Persist CSV to SQLite for querying
# ---------------------------------------------------------------------------

def persist_csv_session(session_id: str) -> str:
    """Write CSV dataframe to an in-memory SQLite and return the database URL."""
    session = get_session(session_id)
    if session is None:
        raise ValidationError(f"Session '{session_id}' not found.")

    df: pd.DataFrame = session["df"]
    table_name: str = session["table_name"]

    tmp_path = f"/tmp/datagentra_{session_id}.db"
    engine = create_engine(f"sqlite:///{tmp_path}")
    df.to_sql(table_name, engine, if_exists="replace", index=False)

    session["db_path"] = tmp_path
    session["tables"] = [table_name]
    set_session(session_id, session)

    return f"sqlite:///{tmp_path}"


def get_engine_for_session(session_id: str):
    """Return a SQLAlchemy engine for the given session (CSV or SQLite)."""
    from app.database import _make_readonly_engine

    session = get_session(session_id)
    if session is None:
        return None

    if session["source_type"] == "csv":
        db_url = persist_csv_session(session_id)
        if db_url.startswith("sqlite:///"):
            db_path = db_url.replace("sqlite:///", "")
            return _make_readonly_engine(f"sqlite:///{db_path}")
    elif session["source_type"] == "sqlite":
        db_path = session.get("db_path")
        if db_path:
            return _make_readonly_engine(f"sqlite:///{db_path}")

    return None
