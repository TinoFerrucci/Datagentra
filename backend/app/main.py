"""FastAPI application — all endpoints."""
from __future__ import annotations

import asyncio
import json
import os
import re
import threading
from typing import Any, Optional

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app import conversations as conv
from app import data_loader as dl
from app.agent import (
    MAX_RETRIES,
    _build_summary_prompt,
    _execute_sql,
    _fix_sql,
    _generate_sql,
    _get_db_type,
    _serialize_rows,
    _suggest_chart,
    run_pipeline,
)
from app.database import get_schema_ddl, get_schema_info, readonly_engine
from app.llm_provider import get_llm

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="Datagentra API",
    description="Autonomous Data Analyst — Text-to-SQL with LLM",
    version="0.1.0",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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

class ChartConfig(BaseModel):
    x_key: str = ""
    y_keys: list[str] = []


class AskResponse(BaseModel):
    question: str
    sql: str
    columns: list[str]
    rows: list[list[Any]]
    summary: str
    chart_type: str
    chart_config: ChartConfig
    chart_title: str
    source: str
    llm_provider: str
    llm_model: str
    conversation_id: str


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

@app.post("/api/ask", response_model=AskResponse)
@limiter.limit("10/minute")
async def ask(request: Request, req: AskRequest):
    """Main pipeline: natural language → SQL → results → chart."""
    try:
        session_id = req.session_id or (
            _active_source.get("id") if _active_source["type"] not in ("postgres", "sqlite") else None
        )
        # Fetch conversation history for context-aware SQL generation
        history = conv.get_recent_history(req.conversation_id) if req.conversation_id else []
        result = run_pipeline(question=req.question, session_id=session_id, history=history)
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


# ------ Streaming ask endpoint ------

@app.post("/api/ask/stream")
@limiter.limit("10/minute")
async def ask_stream(request: Request, req: AskRequest):
    """Streaming pipeline: yields NDJSON events as each step completes.

    Events:
      {"event": "sql",          "sql": "..."}
      {"event": "data",         "columns": [...], "rows": [...]}
      {"event": "summary_chunk","chunk": "..."}
      {"event": "chart",        "chart_type": "...", "chart_config": {...}, "chart_title": "..."}
      {"event": "done",         ...full result + "conversation_id"}
      {"event": "error",        "detail": "..."}
    """
    async def generate():
        try:
            session_id = req.session_id or (
                _active_source.get("id") if _active_source["type"] not in ("postgres", "sqlite") else None
            )
            history = conv.get_recent_history(req.conversation_id) if req.conversation_id else []

            if session_id:
                from app.data_loader import get_engine_for_session
                engine = get_engine_for_session(session_id) or readonly_engine
            else:
                engine = readonly_engine

            db_type = _get_db_type(engine)
            ddl = await asyncio.to_thread(get_schema_ddl, engine)

            # Step 1: Generate SQL
            sql = await asyncio.to_thread(_generate_sql, req.question, ddl, db_type, history)
            yield json.dumps({"event": "sql", "sql": sql}) + "\n"

            # Step 2: Execute with retries
            columns: list[str] = []
            rows: list[list] = []
            last_error = ""
            for attempt in range(MAX_RETRIES + 1):
                try:
                    columns, rows = await asyncio.to_thread(_execute_sql, sql, engine)
                    break
                except PermissionError as exc:
                    yield json.dumps({"event": "error", "detail": str(exc)}) + "\n"
                    return
                except Exception as exc:
                    last_error = str(exc)
                    if attempt < MAX_RETRIES:
                        sql = await asyncio.to_thread(_fix_sql, sql, last_error, req.question, ddl, db_type)
                        yield json.dumps({"event": "sql", "sql": sql}) + "\n"
                    else:
                        yield json.dumps({"event": "error", "detail": f"Failed after {MAX_RETRIES} retries: {last_error}"}) + "\n"
                        return

            serialized_rows = _serialize_rows(rows)
            yield json.dumps({"event": "data", "columns": columns, "rows": serialized_rows}) + "\n"

            # Step 3: Summary — stream chunks via thread + queue
            llm = get_llm()
            summary_prompt = _build_summary_prompt(req.question, columns, rows)
            summary = ""

            chunk_queue: asyncio.Queue[str | None] = asyncio.Queue()
            loop = asyncio.get_running_loop()

            def _produce_summary() -> None:
                try:
                    if hasattr(llm, "stream"):
                        for raw in llm.stream(summary_prompt):
                            chunk = raw if isinstance(raw, str) else (
                                raw.content if hasattr(raw, "content") else str(raw)
                            )
                            if chunk:
                                loop.call_soon_threadsafe(chunk_queue.put_nowait, chunk)
                    else:
                        text = llm.invoke(summary_prompt)
                        loop.call_soon_threadsafe(chunk_queue.put_nowait, text)
                except Exception as exc:
                    loop.call_soon_threadsafe(chunk_queue.put_nowait, f"\n[Error: {exc}]")
                finally:
                    loop.call_soon_threadsafe(chunk_queue.put_nowait, None)

            t = threading.Thread(target=_produce_summary, daemon=True)
            t.start()

            while True:
                chunk = await chunk_queue.get()
                if chunk is None:
                    break
                summary += chunk
                yield json.dumps({"event": "summary_chunk", "chunk": chunk}) + "\n"

            summary = re.sub(r"<think>[\s\S]*?</think>", "", summary, flags=re.IGNORECASE).strip()

            # Step 4: Chart suggestion
            chart_type, chart_config, chart_title = await asyncio.to_thread(
                _suggest_chart, req.question, columns, rows
            )
            yield json.dumps({"event": "chart", "chart_type": chart_type, "chart_config": chart_config, "chart_title": chart_title}) + "\n"

            # Persist to conversation history
            conv_id = req.conversation_id
            if conv_id is None:
                conversation = await asyncio.to_thread(conv.create_conversation)
                conv_id = conversation["id"]
            await asyncio.to_thread(conv.auto_title, conv_id, req.question)
            await asyncio.to_thread(conv.add_message, conv_id, "user", req.question)

            full_result: dict = {
                "question": req.question,
                "sql": sql,
                "columns": columns,
                "rows": serialized_rows,
                "summary": summary,
                "chart_type": chart_type,
                "chart_config": chart_config,
                "chart_title": chart_title,
                "source": session_id or "sqlite_default",
                "llm_provider": llm.provider_name,
                "llm_model": llm.model,
            }
            await asyncio.to_thread(conv.add_message, conv_id, "agent", summary, full_result)

            yield json.dumps({"event": "done", **full_result, "conversation_id": conv_id}) + "\n"

        except PermissionError as exc:
            yield json.dumps({"event": "error", "detail": str(exc)}) + "\n"
        except Exception as exc:
            yield json.dumps({"event": "error", "detail": str(exc)}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")


# ------ Schema question suggestions ------

@app.get("/api/suggest")
@limiter.limit("5/minute")
async def suggest_questions(request: Request):
    """Generate interesting data exploration questions based on the active schema."""
    source_type = _active_source["type"]
    source_id = _active_source["id"]

    if source_type in ("postgres", "sqlite"):
        engine = readonly_engine
    else:
        from app.data_loader import get_engine_for_session
        engine = get_engine_for_session(source_id) or readonly_engine

    try:
        ddl = await asyncio.to_thread(get_schema_ddl, engine)
        llm = get_llm()

        prompt = f"""You are a data analyst helping users explore a new database. Based on this schema, suggest 8 specific and interesting analytical questions a business user might ask.

Schema:
{ddl}

Rules:
- Reference actual table and column names from the schema
- Mix different query types: rankings, trends, aggregations, distributions, comparisons
- Keep each question concise (under 65 characters)
- Return exactly 8 questions, one per line, no numbering, no bullet points

Questions:"""

        raw = await asyncio.to_thread(llm.invoke, prompt)
        raw = re.sub(r"<think>[\s\S]*?</think>", "", raw, flags=re.IGNORECASE).strip()

        questions = [
            line.strip().lstrip("0123456789.-) ")
            for line in raw.splitlines()
            if line.strip() and not line.strip().startswith("#")
        ][:8]

        return {"questions": questions}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


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

# Priority order for sorting OpenAI models in the UI
_OPENAI_MODEL_PRIORITY = [
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4-turbo",
    "gpt-4",
    "gpt-3.5-turbo",
]

# Models to exclude from the list (embeddings, audio, image, etc.)
_OPENAI_MODEL_EXCLUDE_PREFIXES = (
    "text-", "tts-", "whisper-", "dall-e", "davinci", "babbage",
    "curie", "ada", "embedding", "moderation", "o1-mini", "o1-preview",
)


def _sort_openai_models(models: list[dict]) -> list[dict]:
    """Sort models: known priority first, then alphabetical."""
    def key(m: dict) -> tuple:
        mid = m["id"]
        try:
            return (0, _OPENAI_MODEL_PRIORITY.index(mid))
        except ValueError:
            return (1, mid)
    return sorted(models, key=key)


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


@app.get("/api/openai/models/current")
async def get_openai_models_current():
    """Return the available GPT models using the already-configured OPENAI_API_KEY."""
    import httpx
    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key or api_key in ("", "sk-your-key-here"):
        raise HTTPException(status_code=404, detail="No OpenAI API key configured.")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=10.0,
            )
            if resp.status_code == 401:
                raise HTTPException(status_code=401, detail="Stored API key is invalid.")
            resp.raise_for_status()
            data = resp.json()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not reach OpenAI: {exc}")

    models = [
        {"id": m["id"], "name": m["id"]}
        for m in data.get("data", [])
        if m["id"].startswith("gpt-")
        and not any(m["id"].startswith(p) for p in _OPENAI_MODEL_EXCLUDE_PREFIXES)
    ]
    return {"valid": True, "models": _sort_openai_models(models)}


class OpenAIValidateRequest(BaseModel):
    api_key: str


@app.post("/api/openai/models")
async def get_openai_models_with_key(req: OpenAIValidateRequest):
    """Validate an OpenAI API key and return the available GPT models."""
    import httpx
    if not req.api_key.startswith("sk-"):
        raise HTTPException(status_code=422, detail="API key must start with 'sk-'.")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {req.api_key}"},
                timeout=10.0,
            )
            if resp.status_code == 401:
                raise HTTPException(status_code=401, detail="Invalid API key.")
            if resp.status_code == 429:
                raise HTTPException(status_code=429, detail="Rate limited. Try again in a moment.")
            resp.raise_for_status()
            data = resp.json()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not reach OpenAI: {exc}")

    # Filter to GPT chat/completion models only
    models = [
        {"id": m["id"], "name": m["id"]}
        for m in data.get("data", [])
        if m["id"].startswith("gpt-")
        and not any(m["id"].startswith(p) for p in _OPENAI_MODEL_EXCLUDE_PREFIXES)
    ]
    return {"valid": True, "models": _sort_openai_models(models)}
