"""Conversation persistence — stores chat history in a local SQLite database."""
from __future__ import annotations

import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_CONV_DB_PATH = os.getenv(
    "CONVERSATIONS_DB_PATH",
    str(Path(__file__).parent.parent.parent / "db" / "conversations.db"),
)


# ---------------------------------------------------------------------------
# Connection
# ---------------------------------------------------------------------------

def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(_CONV_DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

def init_db() -> None:
    """Create tables if they don't exist."""
    with _connect() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS conversations (
            id         TEXT PRIMARY KEY,
            title      TEXT NOT NULL DEFAULT 'Nueva conversación',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS messages (
            id              TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            type            TEXT NOT NULL,
            content         TEXT NOT NULL,
            response_json   TEXT,
            timestamp       TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_conv_updated  ON conversations(updated_at DESC);
        """)


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_conversation(title: str = "Nueva conversación") -> dict:
    now = _now()
    conv_id = str(uuid.uuid4())
    with _connect() as conn:
        conn.execute(
            "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (conv_id, title, now, now),
        )
    return {"id": conv_id, "title": title, "created_at": now, "updated_at": now, "message_count": 0}


def list_conversations() -> list[dict]:
    with _connect() as conn:
        rows = conn.execute("""
            SELECT c.id, c.title, c.created_at, c.updated_at,
                   COUNT(m.id) AS message_count
            FROM conversations c
            LEFT JOIN messages m ON m.conversation_id = c.id
            GROUP BY c.id
            ORDER BY c.updated_at DESC
        """).fetchall()
    return [dict(r) for r in rows]


def get_conversation(conv_id: str) -> dict | None:
    with _connect() as conn:
        conv = conn.execute(
            "SELECT * FROM conversations WHERE id = ?", (conv_id,)
        ).fetchone()
        if conv is None:
            return None
        msgs = conn.execute(
            "SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC",
            (conv_id,),
        ).fetchall()

    result = dict(conv)
    result["messages"] = []
    for m in msgs:
        msg = dict(m)
        if msg.get("response_json"):
            msg["response"] = json.loads(msg["response_json"])
        del msg["response_json"]
        result["messages"].append(msg)
    return result


def delete_conversation(conv_id: str) -> bool:
    with _connect() as conn:
        c = conn.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))
    return c.rowcount > 0


def rename_conversation(conv_id: str, title: str) -> bool:
    with _connect() as conn:
        c = conn.execute(
            "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?",
            (title, _now(), conv_id),
        )
    return c.rowcount > 0


def add_message(
    conv_id: str,
    msg_type: str,
    content: str,
    response: dict[str, Any] | None = None,
) -> str:
    msg_id = str(uuid.uuid4())
    response_json = json.dumps(response) if response else None
    with _connect() as conn:
        conn.execute(
            "INSERT INTO messages (id, conversation_id, type, content, response_json, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
            (msg_id, conv_id, msg_type, content, response_json, _now()),
        )
        conn.execute(
            "UPDATE conversations SET updated_at = ? WHERE id = ?",
            (_now(), conv_id),
        )
    return msg_id


def auto_title(conv_id: str, question: str) -> None:
    """Set title from first question if still the default placeholder."""
    title = question[:60].strip()
    if len(question) > 60:
        title += "…"
    with _connect() as conn:
        conn.execute(
            "UPDATE conversations SET title = ? WHERE id = ? AND title = 'Nueva conversación'",
            (title, conv_id),
        )
