"""LLM Provider factory — supports Ollama (local) and OpenAI (cloud)."""
from __future__ import annotations

import os
from typing import Protocol


class LLMProvider(Protocol):
    def invoke(self, prompt: str) -> str: ...


class OllamaProvider:
    def __init__(self, base_url: str, model: str) -> None:
        try:
            from langchain_ollama import OllamaLLM
            self._llm = OllamaLLM(base_url=base_url, model=model)
        except ImportError:
            from langchain_community.llms import Ollama  # type: ignore[attr-defined]
            self._llm = Ollama(base_url=base_url, model=model)
        self.model = model
        self.provider_name = "ollama"

    def invoke(self, prompt: str) -> str:
        result = self._llm.invoke(prompt)
        return result if isinstance(result, str) else str(result)


class OpenAIProvider:
    def __init__(self, api_key: str, model: str) -> None:
        from langchain_openai import ChatOpenAI

        self._llm = ChatOpenAI(api_key=api_key, model=model, temperature=0)
        self.model = model
        self.provider_name = "openai"

    def invoke(self, prompt: str) -> str:
        result = self._llm.invoke(prompt)
        return result.content if hasattr(result, "content") else str(result)


def get_llm_provider() -> OllamaProvider | OpenAIProvider:
    """Factory: reads env vars and returns the configured LLM provider."""
    provider = os.getenv("LLM_PROVIDER", "ollama").lower()

    if provider == "openai":
        api_key = os.getenv("OPENAI_API_KEY", "")
        if not api_key:
            raise ValueError("OPENAI_API_KEY is not set in environment variables.")
        model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        return OpenAIProvider(api_key=api_key, model=model)

    # Default: ollama
    base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    model = os.getenv("OLLAMA_MODEL", "qwen2.5:7b")
    return OllamaProvider(base_url=base_url, model=model)


# Singleton instance (initialized lazily)
_llm_instance: OllamaProvider | OpenAIProvider | None = None


def get_llm() -> OllamaProvider | OpenAIProvider:
    global _llm_instance
    if _llm_instance is None:
        _llm_instance = get_llm_provider()
    return _llm_instance


def reset_llm() -> None:
    """Reset the singleton (useful for testing)."""
    global _llm_instance
    _llm_instance = None
