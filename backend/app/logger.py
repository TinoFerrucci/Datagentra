"""Centralized logging — logs/backend/app.log and logs/frontend/client.log, 7-day rotation."""
from __future__ import annotations

import logging
import os
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path

_LOG_ROOT = Path(__file__).resolve().parent.parent.parent / "logs"
_BACKEND_DIR = _LOG_ROOT / "backend"
_FRONTEND_DIR = _LOG_ROOT / "frontend"
_BACKEND_DIR.mkdir(parents=True, exist_ok=True)
_FRONTEND_DIR.mkdir(parents=True, exist_ok=True)

_LEVEL = getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO)
_FMT = logging.Formatter(
    "%(asctime)s | %(levelname)-8s | %(name)-18s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

# Shared rotating file handler for backend application logs
_backend_fh = TimedRotatingFileHandler(
    filename=str(_BACKEND_DIR / "app.log"),
    when="midnight",
    interval=1,
    backupCount=7,
    encoding="utf-8",
)
_backend_fh.suffix = "%Y-%m-%d"
_backend_fh.setFormatter(_FMT)

# Rotating file handler for frontend client logs (received via /api/logs)
_frontend_fh = TimedRotatingFileHandler(
    filename=str(_FRONTEND_DIR / "client.log"),
    when="midnight",
    interval=1,
    backupCount=7,
    encoding="utf-8",
)
_frontend_fh.suffix = "%Y-%m-%d"
_frontend_fh.setFormatter(_FMT)

# Bootstrap datagentra root logger
_root = logging.getLogger("datagentra")
_root.setLevel(_LEVEL)
_root.propagate = False
if not _root.handlers:
    _root.addHandler(_backend_fh)
    _ch = logging.StreamHandler()
    _ch.setFormatter(_FMT)
    _root.addHandler(_ch)

# Frontend logger writes only to its own file (no console spam)
_frontend_logger = logging.getLogger("datagentra.frontend")
_frontend_logger.setLevel(_LEVEL)
_frontend_logger.propagate = False
if not _frontend_logger.handlers:
    _frontend_logger.addHandler(_frontend_fh)


def get_logger(name: str) -> logging.Logger:
    """Return a child logger under the datagentra.{name} namespace."""
    return logging.getLogger(f"datagentra.{name}")


def get_frontend_logger() -> logging.Logger:
    return _frontend_logger


def attach_to_uvicorn() -> None:
    """Wire uvicorn's own loggers to our rotating file handler (call on startup)."""
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        lg = logging.getLogger(name)
        if not any(isinstance(h, TimedRotatingFileHandler) for h in lg.handlers):
            lg.addHandler(_backend_fh)
