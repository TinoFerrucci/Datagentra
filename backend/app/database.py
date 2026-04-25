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

from app.logger import get_logger

logger = get_logger("database")

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
            logger.error("Write blocked on read-only engine | op=%s | url=%s", first_token.upper(), url)
            raise PermissionError(
                f"Write operation '{first_token.upper()}' is not allowed on the read-only engine."
            )

    logger.debug("Read-only engine created | url=%s", url)
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

            # Foreign keys
            fk_meta = inspector.get_foreign_keys(table)
            fk_map: dict[str, dict] = {}
            for fk in fk_meta:
                for local_col, ref_col in zip(fk["constrained_columns"], fk["referred_columns"]):
                    fk_map[local_col] = {"ref_table": fk["referred_table"], "ref_column": ref_col}

            # Mark PK columns
            pk_cols = set(inspector.get_pk_constraint(table).get("constrained_columns", []))
            for col in columns:
                col["is_pk"] = col["name"] in pk_cols
                if col["name"] in fk_map:
                    col["fk"] = fk_map[col["name"]]

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


# ---------------------------------------------------------------------------
# External database connections (PostgreSQL / MySQL)
# ---------------------------------------------------------------------------

_external_connections: dict[str, dict] = {}


def build_db_url(db_type: str, host: str, port: int, database: str, user: str, password: str) -> str:
    if db_type == "postgres":
        return f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{database}"
    if db_type == "mysql":
        return f"mysql+pymysql://{user}:{password}@{host}:{port}/{database}"
    raise ValueError(f"Unsupported db_type: {db_type}")


def register_external_connection(conn_id: str, db_type: str, host: str, port: int,
                                  database: str, user: str, password: str, name: str) -> dict:
    url = build_db_url(db_type, host, port, database, user, password)
    engine = _make_readonly_engine(url)

    from sqlalchemy import inspect as sa_inspect
    inspector = sa_inspect(engine)
    tables = inspector.get_table_names()
    table_count = len(tables)

    conn_data = {
        "id": conn_id,
        "type": db_type,
        "host": host,
        "port": port,
        "database": database,
        "user": user,
        "password": password,
        "name": name or f"{db_type}://{host}:{port}/{database}",
        "table_count": table_count,
        "engine": engine,
    }
    _external_connections[conn_id] = conn_data
    logger.info("External DB registered | id=%s | type=%s | host=%s | db=%s | tables=%d",
                conn_id, db_type, host, database, table_count)
    return {
        "id": conn_id,
        "type": db_type,
        "name": conn_data["name"],
        "host": host,
        "port": port,
        "database": database,
        "table_count": table_count,
    }


def get_external_engine(conn_id: str) -> Engine | None:
    conn = _external_connections.get(conn_id)
    return conn["engine"] if conn else None


def list_external_connections() -> list[dict]:
    results = []
    for conn_id, conn in _external_connections.items():
        results.append({
            "id": conn_id,
            "type": conn["type"],
            "name": conn["name"],
            "host": conn["host"],
            "port": conn["port"],
            "database": conn["database"],
            "table_count": conn["table_count"],
        })
    return results


def remove_external_connection(conn_id: str) -> bool:
    conn = _external_connections.pop(conn_id, None)
    if conn and "engine" in conn:
        conn["engine"].dispose()
    return conn is not None
