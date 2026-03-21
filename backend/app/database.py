"""Database engines and DDL helpers.

Two engines are exposed:
- readonly_engine  : for AI-generated SQL — only SELECT allowed
- readwrite_engine : for user file uploads (creating session tables)
"""
from __future__ import annotations

import os
from typing import Generator

from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

_SQLITE_DB_PATH = os.getenv("SQLITE_DB_PATH", "../db/datagentra.db")
_DATABASE_URL = os.getenv("DATABASE_URL") or f"sqlite:///{_SQLITE_DB_PATH}"

# ---------------------------------------------------------------------------
# Engine factory helpers
# ---------------------------------------------------------------------------

def _make_engine(url: str, **kwargs) -> Engine:
    connect_args = {}
    if url.startswith("sqlite"):
        connect_args["check_same_thread"] = False
    return create_engine(url, connect_args=connect_args, **kwargs)


def _make_readonly_engine(url: str) -> Engine:
    """Create an engine that rejects any write statement at the application layer."""
    engine = _make_engine(url)

    FORBIDDEN = frozenset(
        ["insert", "update", "delete", "drop", "create", "alter", "truncate", "grant", "revoke"]
    )

    @event.listens_for(engine, "before_cursor_execute")
    def _block_writes(conn, cursor, statement, parameters, context, executemany):
        first_token = statement.strip().split()[0].lower() if statement.strip() else ""
        if first_token in FORBIDDEN:
            raise PermissionError(
                f"Write operation '{first_token.upper()}' is not allowed on the read-only engine."
            )

    return engine


# ---------------------------------------------------------------------------
# Public engines
# ---------------------------------------------------------------------------

readonly_engine: Engine = _make_readonly_engine(_DATABASE_URL)
readwrite_engine: Engine = _make_engine(_DATABASE_URL)

ReadOnlySession = sessionmaker(bind=readonly_engine, autocommit=False, autoflush=False)
ReadWriteSession = sessionmaker(bind=readwrite_engine, autocommit=False, autoflush=False)


def get_readonly_session() -> Generator[Session, None, None]:
    db = ReadOnlySession()
    try:
        yield db
    finally:
        db.close()


def get_readwrite_session() -> Generator[Session, None, None]:
    db = ReadWriteSession()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# DDL / schema introspection
# ---------------------------------------------------------------------------

def get_schema_ddl(engine: Engine | None = None, schema: str | None = None) -> str:
    """Return a DDL-style description of all tables in the database."""
    if engine is None:
        engine = readonly_engine

    from sqlalchemy import inspect as sa_inspect

    inspector = sa_inspect(engine)
    table_names = inspector.get_table_names(schema=schema)
    lines: list[str] = []

    for table in table_names:
        columns = inspector.get_columns(table, schema=schema)
        fks = inspector.get_foreign_keys(table, schema=schema)
        pk_info = inspector.get_pk_constraint(table, schema=schema)
        pk_cols = set(pk_info.get("constrained_columns", []))

        col_defs = []
        for col in columns:
            col_type = str(col["type"])
            nullable = "" if col.get("nullable", True) else " NOT NULL"
            pk_marker = " PK" if col["name"] in pk_cols else ""
            col_defs.append(f"  {col['name']} {col_type}{nullable}{pk_marker}")

        for fk in fks:
            for local_col, ref_col in zip(fk["constrained_columns"], fk["referred_columns"]):
                col_defs.append(
                    f"  -- FK: {local_col} -> {fk['referred_table']}.{ref_col}"
                )

        lines.append(f"TABLE {table} (\n" + ",\n".join(col_defs) + "\n)")

    return "\n\n".join(lines)


def get_schema_info(engine: Engine | None = None) -> dict:
    """Return structured schema info: tables with columns, types, sample values."""
    if engine is None:
        engine = readonly_engine

    from sqlalchemy import inspect as sa_inspect

    inspector = sa_inspect(engine)
    table_names = inspector.get_table_names()
    tables = {}

    with engine.connect() as conn:
        for table in table_names:
            columns_meta = inspector.get_columns(table)
            columns = []
            for col in columns_meta:
                col_info = {
                    "name": col["name"],
                    "type": str(col["type"]),
                    "nullable": col.get("nullable", True),
                }
                columns.append(col_info)

            # Row count
            try:
                count_result = conn.execute(text(f'SELECT COUNT(*) FROM "{table}"'))
                row_count = count_result.scalar() or 0
            except Exception:
                row_count = 0

            tables[table] = {
                "columns": columns,
                "row_count": row_count,
            }

    return tables


def reinitialize_engines(database_url: str) -> None:
    """Re-create engines with a new URL (used for uploaded SQLite databases)."""
    global readonly_engine, readwrite_engine, ReadOnlySession, ReadWriteSession
    readonly_engine = _make_readonly_engine(database_url)
    readwrite_engine = _make_engine(database_url)
    ReadOnlySession = sessionmaker(bind=readonly_engine, autocommit=False, autoflush=False)
    ReadWriteSession = sessionmaker(bind=readwrite_engine, autocommit=False, autoflush=False)
