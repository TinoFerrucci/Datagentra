"""FastAPI application — all endpoints."""
from __future__ import annotations

import os
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app import data_loader as dl
from app.agent import run_pipeline
from app.database import get_schema_info, readonly_engine

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Datagentra API",
    description="Autonomous Data Analyst — Text-to-SQL with LLM",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Active data source state (in-memory, per-server)
# ---------------------------------------------------------------------------

_active_source: dict = {"id": "postgres_default", "type": "postgres"}


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class AskRequest(BaseModel):
    question: str
    session_id: Optional[str] = None


class FixRequest(BaseModel):
    session_id: str
    prompt: str


class DataSourceSwitch(BaseModel):
    source_id: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok"}


# ------ Ask endpoint ------

@app.post("/api/ask")
async def ask(req: AskRequest):
    """Main pipeline: natural language → SQL → results → chart."""
    try:
        session_id = req.session_id or (_active_source.get("id") if _active_source["type"] != "postgres" else None)
        result = run_pipeline(question=req.question, session_id=session_id)
        return result
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ------ Upload endpoints ------

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """Upload a CSV or SQLite .db file."""
    filename = file.filename or "upload"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext not in ("csv", "db"):
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported file type '.{ext}'. Only .csv and .db (SQLite) are accepted.",
        )

    content = await file.read()

    try:
        if ext == "csv":
            result = dl.load_csv(content, filename)
        else:
            result = dl.load_sqlite(content, filename)
    except dl.ValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    return result


@app.post("/api/upload/fix")
async def fix_upload(req: FixRequest):
    """Apply a natural-language correction to an uploaded CSV."""
    try:
        result = dl.apply_correction(req.session_id, req.prompt)
        return result
    except dl.ValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@app.post("/api/upload/confirm")
async def confirm_upload(req: DataSourceSwitch):
    """Confirm an uploaded file as the active data source."""
    session = dl.get_session(req.source_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{req.source_id}' not found.")

    _active_source["id"] = req.source_id
    _active_source["type"] = session["source_type"]

    return {"status": "ok", "active_source": _active_source}


# ------ Schema endpoint ------

@app.get("/api/schema")
async def get_schema():
    """Return the schema of the currently active data source."""
    try:
        source_id = _active_source["id"]
        source_type = _active_source["type"]

        if source_type == "postgres":
            schema = get_schema_info(readonly_engine)
        else:
            from app.data_loader import get_engine_for_session
            engine = get_engine_for_session(source_id)
            if engine is None:
                raise HTTPException(status_code=404, detail="Session engine not found.")
            schema = get_schema_info(engine)

        return {
            "source_id": source_id,
            "source_type": source_type,
            "tables": schema,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ------ Data source management ------

@app.get("/api/datasource")
async def list_datasources():
    """List all available data sources."""
    sources = [
        {
            "id": "postgres_default",
            "type": "postgres",
            "name": "PostgreSQL (default)",
            "active": _active_source["id"] == "postgres_default",
        }
    ]
    for session_id in dl.list_sessions():
        session = dl.get_session(session_id)
        if session:
            sources.append({
                "id": session_id,
                "type": session["source_type"],
                "name": session.get("filename", session_id),
                "active": _active_source["id"] == session_id,
            })

    return {"sources": sources, "active": _active_source}


@app.put("/api/datasource")
async def switch_datasource(req: DataSourceSwitch):
    """Switch the active data source."""
    if req.source_id == "postgres_default":
        _active_source["id"] = "postgres_default"
        _active_source["type"] = "postgres"
        return {"status": "ok", "active_source": _active_source}

    session = dl.get_session(req.source_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{req.source_id}' not found.")

    _active_source["id"] = req.source_id
    _active_source["type"] = session["source_type"]

    return {"status": "ok", "active_source": _active_source}


# ------ LLM info ------

@app.get("/api/llm-info")
async def llm_info():
    """Return active LLM provider info."""
    from app.llm_provider import get_llm
    try:
        llm = get_llm()
        return {"provider": llm.provider_name, "model": llm.model}
    except Exception as exc:
        return {"provider": "unknown", "model": "unknown", "error": str(exc)}
