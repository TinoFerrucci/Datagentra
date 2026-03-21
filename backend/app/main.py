"""FastAPI application — all endpoints."""
from __future__ import annotations

import os
from typing import Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app import conversations as conv
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

# Initialize conversation database on startup
conv.init_db()

# ---------------------------------------------------------------------------
# Active data source state (in-memory, per-server)
# ---------------------------------------------------------------------------

_active_source: dict = {"id": "sqlite_default", "type": "sqlite"}


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class AskRequest(BaseModel):
    question: str
    session_id: Optional[str] = None
    conversation_id: Optional[str] = None


class FixRequest(BaseModel):
    session_id: str
    prompt: str


class DataSourceSwitch(BaseModel):
    source_id: str


class ConversationRename(BaseModel):
    title: str


class SetupRequest(BaseModel):
    provider: str   # "openai" | "ollama"
    model: str
    api_key: Optional[str] = None


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
        session_id = req.session_id or (
            _active_source.get("id") if _active_source["type"] not in ("postgres", "sqlite") else None
        )
        result = run_pipeline(question=req.question, session_id=session_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    # Persist to conversation history
    conv_id = req.conversation_id
    if conv_id is None:
        conversation = conv.create_conversation()
        conv_id = conversation["id"]

    conv.auto_title(conv_id, req.question)
    conv.add_message(conv_id, "user", req.question)
    conv.add_message(conv_id, "agent", result.get("summary", ""), response=result)

    result["conversation_id"] = conv_id
    return result


# ------ Conversation endpoints ------

@app.get("/api/conversations")
async def list_conversations():
    return {"conversations": conv.list_conversations()}


@app.post("/api/conversations")
async def create_conversation():
    return conv.create_conversation()


@app.get("/api/conversations/{conv_id}")
async def get_conversation(conv_id: str):
    data = conv.get_conversation(conv_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return data


@app.delete("/api/conversations/{conv_id}")
async def delete_conversation(conv_id: str):
    if not conv.delete_conversation(conv_id):
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return {"status": "ok"}


@app.patch("/api/conversations/{conv_id}")
async def rename_conversation(conv_id: str, req: ConversationRename):
    if not conv.rename_conversation(conv_id, req.title):
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return {"status": "ok"}


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

        if source_type in ("postgres", "sqlite"):
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
            "id": "sqlite_default",
            "type": "sqlite",
            "name": "E-commerce (default)",
            "active": _active_source["id"] == "sqlite_default",
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
    if req.source_id == "sqlite_default":
        _active_source["id"] = "sqlite_default"
        _active_source["type"] = "sqlite"
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


# ------ Setup & Config ------

_OPENAI_MODELS = [
    {"id": "gpt-4o-mini",    "name": "GPT-4o mini",    "desc": "Rápido y económico — recomendado"},
    {"id": "gpt-4o",         "name": "GPT-4o",          "desc": "Mayor calidad, más capaz"},
    {"id": "gpt-4-turbo",    "name": "GPT-4 Turbo",     "desc": "Muy capaz, buen balance"},
    {"id": "gpt-3.5-turbo",  "name": "GPT-3.5 Turbo",   "desc": "Económico, menor calidad"},
]


@app.get("/api/setup/status")
async def get_setup_status():
    """Check whether the LLM is properly configured."""
    provider = os.getenv("LLM_PROVIDER", "openai").lower()
    if provider == "openai":
        api_key = os.getenv("OPENAI_API_KEY", "")
        configured = bool(api_key) and api_key not in ("", "sk-your-key-here")
        return {"configured": configured, "provider": provider, "model": os.getenv("OPENAI_MODEL", "gpt-4o-mini")}
    # ollama: configured if model is set
    model = os.getenv("OLLAMA_MODEL", "")
    return {"configured": bool(model), "provider": provider, "model": model}


@app.post("/api/setup")
async def save_setup(req: SetupRequest):
    """Persist LLM configuration to .env and reload the singleton."""
    from pathlib import Path
    from dotenv import set_key
    from app.llm_provider import reset_llm

    env_path = str(Path(__file__).parent.parent / ".env")

    set_key(env_path, "LLM_PROVIDER", req.provider)
    os.environ["LLM_PROVIDER"] = req.provider

    if req.provider == "openai":
        if req.api_key:
            set_key(env_path, "OPENAI_API_KEY", req.api_key)
            os.environ["OPENAI_API_KEY"] = req.api_key
        set_key(env_path, "OPENAI_MODEL", req.model)
        os.environ["OPENAI_MODEL"] = req.model
    else:
        set_key(env_path, "OLLAMA_MODEL", req.model)
        os.environ["OLLAMA_MODEL"] = req.model

    reset_llm()
    return {"status": "ok", "provider": req.provider, "model": req.model}


@app.get("/api/ollama/models")
async def get_ollama_models():
    """List models available in the local Ollama instance."""
    import httpx
    base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{base_url}/api/tags", timeout=5.0)
            resp.raise_for_status()
            data = resp.json()
            models = [{"name": m["name"], "size": m.get("size", 0)} for m in data.get("models", [])]
            return {"running": True, "models": models, "base_url": base_url}
    except Exception:
        return {"running": False, "models": [], "base_url": base_url}


@app.get("/api/openai/models")
async def get_openai_models():
    """Return the curated list of supported OpenAI models."""
    return {"models": _OPENAI_MODELS}
