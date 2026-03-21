"""Tests for the LLM provider factory."""
from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

import pytest

from app.llm_provider import get_llm_provider, reset_llm


def test_factory_returns_ollama_by_default():
    reset_llm()
    with patch.dict(os.environ, {"LLM_PROVIDER": "ollama", "OLLAMA_MODEL": "qwen2.5:7b"}):
        with patch("langchain_ollama.OllamaLLM", return_value=MagicMock()), \
             patch("langchain_community.llms.Ollama", return_value=MagicMock()):
            provider = get_llm_provider()
            assert provider.provider_name == "ollama"
            assert provider.model == "qwen2.5:7b"


def test_factory_returns_openai_when_configured():
    reset_llm()
    with patch.dict(os.environ, {
        "LLM_PROVIDER": "openai",
        "OPENAI_API_KEY": "sk-test-key",
        "OPENAI_MODEL": "gpt-4o-mini",
    }):
        with patch("langchain_openai.ChatOpenAI") as mock_openai:
            mock_openai.return_value = MagicMock()
            provider = get_llm_provider()
            assert provider.provider_name == "openai"
            assert provider.model == "gpt-4o-mini"


def test_openai_raises_without_api_key():
    reset_llm()
    env = {"LLM_PROVIDER": "openai", "OPENAI_API_KEY": ""}
    with patch.dict(os.environ, env):
        with pytest.raises(ValueError, match="OPENAI_API_KEY"):
            get_llm_provider()


def test_ollama_invoke_returns_string():
    reset_llm()
    mock_inner = MagicMock()
    mock_inner.invoke.return_value = "SELECT 1"
    with patch.dict(os.environ, {"LLM_PROVIDER": "ollama"}):
        # Patch both possible import paths
        with patch("langchain_ollama.OllamaLLM", return_value=mock_inner), \
             patch("langchain_community.llms.Ollama", return_value=mock_inner):
            provider = get_llm_provider()
            result = provider.invoke("test prompt")
            assert isinstance(result, str)
            assert result == "SELECT 1"


def test_openai_invoke_returns_content_string():
    reset_llm()
    mock_message = MagicMock()
    mock_message.content = "SELECT 2"
    mock_inner = MagicMock()
    mock_inner.invoke.return_value = mock_message
    with patch.dict(os.environ, {"LLM_PROVIDER": "openai", "OPENAI_API_KEY": "sk-x"}):
        with patch("langchain_openai.ChatOpenAI", return_value=mock_inner):
            provider = get_llm_provider()
            result = provider.invoke("test prompt")
            assert result == "SELECT 2"
