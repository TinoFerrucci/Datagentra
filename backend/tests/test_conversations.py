"""Tests for conversation persistence (conversations.py)."""
from __future__ import annotations

import os
from unittest.mock import patch

import pytest

import app.conversations as conv_module


@pytest.fixture
def conv_db(tmp_path):
    """Isolated conversations DB for each test function."""
    db_path = str(tmp_path / "test_conversations.db")
    with patch.object(conv_module, "_CONV_DB_PATH", db_path):
        conv_module.init_db()
        yield conv_module


# ---------------------------------------------------------------------------
# create / list
# ---------------------------------------------------------------------------

def test_create_conversation_returns_id(conv_db):
    conv = conv_db.create_conversation()
    assert "id" in conv
    assert conv["title"] == "New conversation"
    assert conv["message_count"] == 0


def test_list_conversations_includes_created(conv_db):
    conv_db.create_conversation()
    conv_db.create_conversation()
    result = conv_db.list_conversations()
    assert len(result) >= 2


def test_list_conversations_ordered_by_updated_at(conv_db):
    c1 = conv_db.create_conversation()
    c2 = conv_db.create_conversation()
    result = conv_db.list_conversations()
    ids = [r["id"] for r in result]
    assert ids.index(c2["id"]) < ids.index(c1["id"])


# ---------------------------------------------------------------------------
# get
# ---------------------------------------------------------------------------

def test_get_conversation_not_found_returns_none(conv_db):
    assert conv_db.get_conversation("nonexistent-id-xyz") is None


def test_get_conversation_returns_messages(conv_db):
    conv = conv_db.create_conversation()
    conv_id = conv["id"]
    conv_db.add_message(conv_id, "user", "Hello")
    conv_db.add_message(conv_id, "agent", "Hi there")
    data = conv_db.get_conversation(conv_id)
    assert data is not None
    assert len(data["messages"]) == 2
    assert data["messages"][0]["type"] == "user"
    assert data["messages"][1]["type"] == "agent"


# ---------------------------------------------------------------------------
# delete / rename
# ---------------------------------------------------------------------------

def test_delete_existing_conversation(conv_db):
    conv = conv_db.create_conversation()
    assert conv_db.delete_conversation(conv["id"]) is True
    assert conv_db.get_conversation(conv["id"]) is None


def test_delete_nonexistent_conversation_returns_false(conv_db):
    assert conv_db.delete_conversation("no-such-id") is False


def test_rename_conversation(conv_db):
    conv = conv_db.create_conversation()
    assert conv_db.rename_conversation(conv["id"], "My Report") is True
    data = conv_db.get_conversation(conv["id"])
    assert data["title"] == "My Report"


def test_rename_nonexistent_conversation_returns_false(conv_db):
    assert conv_db.rename_conversation("no-such-id", "X") is False


# ---------------------------------------------------------------------------
# messages
# ---------------------------------------------------------------------------

def test_add_message_with_response_json(conv_db):
    conv = conv_db.create_conversation()
    conv_id = conv["id"]
    response_payload = {"sql": "SELECT 1", "chart_type": "bar"}
    conv_db.add_message(conv_id, "agent", "Summary text", response=response_payload)
    data = conv_db.get_conversation(conv_id)
    msg = data["messages"][0]
    assert msg["response"]["sql"] == "SELECT 1"
    assert msg["response"]["chart_type"] == "bar"
    assert "response_json" not in msg


def test_add_message_updates_conversation_updated_at(conv_db):
    conv = conv_db.create_conversation()
    conv_id = conv["id"]
    before = conv_db.get_conversation(conv_id)["updated_at"]
    import time; time.sleep(0.01)
    conv_db.add_message(conv_id, "user", "New question")
    after = conv_db.get_conversation(conv_id)["updated_at"]
    assert after >= before


# ---------------------------------------------------------------------------
# get_recent_history
# ---------------------------------------------------------------------------

def test_get_recent_history_chronological_order(conv_db):
    conv = conv_db.create_conversation()
    conv_id = conv["id"]
    conv_db.add_message(conv_id, "user", "Q1")
    conv_db.add_message(conv_id, "agent", "A1", response={"sql": "SELECT 1"})
    conv_db.add_message(conv_id, "user", "Q2")
    conv_db.add_message(conv_id, "agent", "A2", response={"sql": "SELECT 2"})
    history = conv_db.get_recent_history(conv_id)
    assert len(history) == 4
    assert history[0]["content"] == "Q1"
    assert history[-1]["content"] == "A2"


def test_get_recent_history_extracts_sql(conv_db):
    conv = conv_db.create_conversation()
    conv_id = conv["id"]
    conv_db.add_message(conv_id, "agent", "Summary", response={"sql": "SELECT * FROM t"})
    history = conv_db.get_recent_history(conv_id)
    assert history[0]["sql"] == "SELECT * FROM t"


def test_get_recent_history_respects_limit(conv_db):
    conv = conv_db.create_conversation()
    conv_id = conv["id"]
    for i in range(10):
        conv_db.add_message(conv_id, "user", f"Q{i}")
    history = conv_db.get_recent_history(conv_id, limit=4)
    assert len(history) == 4


def test_get_recent_history_empty_conversation(conv_db):
    conv = conv_db.create_conversation()
    history = conv_db.get_recent_history(conv["id"])
    assert history == []


# ---------------------------------------------------------------------------
# auto_title
# ---------------------------------------------------------------------------

def test_auto_title_sets_title_from_question(conv_db):
    conv = conv_db.create_conversation()
    conv_id = conv["id"]
    conv_db.auto_title(conv_id, "What are the top selling products?")
    data = conv_db.get_conversation(conv_id)
    assert data["title"] == "What are the top selling products?"


def test_auto_title_truncates_long_questions(conv_db):
    conv = conv_db.create_conversation()
    conv_id = conv["id"]
    long_question = "A" * 100
    conv_db.auto_title(conv_id, long_question)
    data = conv_db.get_conversation(conv_id)
    assert len(data["title"]) <= 61  # 60 chars + ellipsis


def test_auto_title_does_not_overwrite_custom_title(conv_db):
    conv = conv_db.create_conversation()
    conv_id = conv["id"]
    conv_db.rename_conversation(conv_id, "My Custom Title")
    conv_db.auto_title(conv_id, "Some new question")
    data = conv_db.get_conversation(conv_id)
    assert data["title"] == "My Custom Title"
