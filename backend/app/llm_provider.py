"""LLM Provider factory — supports Ollama (local) and OpenAI (cloud)."""
from __future__ import annotations

import os
from typing import Protocol

from app.logger import get_logger

logger = get_logger("llm")


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

    def stream(self, prompt: str):
        """Yield text chunks as they are generated."""
        for chunk in self._llm.stream(prompt):
            yield chunk if isinstance(chunk, str) else str(chunk)


class OpenAIProvider:
    def __init__(self, api_key: str, model: str) -> None:
        from langchain_openai import ChatOpenAI

        self._llm = ChatOpenAI(api_key=api_key, model=model, temperature=0)
        self.model = model
        self.provider_name = "openai"

    def invoke(self, prompt: str) -> str:
        result = self._llm.invoke(prompt)
        return result.content if hasattr(result, "content") else str(result)

    def stream(self, prompt: str):
        """Yield text chunks as they are generated."""
        for chunk in self._llm.stream(prompt):
            content = chunk.content if hasattr(chunk, "content") else str(chunk)
            if content:
                yield content


def get_llm_provider() -> OllamaProvider | OpenAIProvider:
    """Factory: reads env vars and returns the configured LLM provider."""
    provider = os.getenv("LLM_PROVIDER", "ollama").lower()

    if provider == "openai":
        api_key = os.getenv("OPENAI_API_KEY", "")
        if not api_key:
            raise ValueError("OPENAI_API_KEY is not set in environment variables.")
        model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        logger.info("LLM initialized | provider=openai | model=%s", model)
        return OpenAIProvider(api_key=api_key, model=model)

    # Default: ollama
    base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    model = os.getenv("OLLAMA_MODEL", "qwen2.5:7b")
    logger.info("LLM initialized | provider=ollama | model=%s | base_url=%s", model, base_url)
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
    logger.info("LLM singleton reset")
    _llm_instance = None
