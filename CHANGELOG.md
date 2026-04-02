# Changelog

All notable changes to Datagentra are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- **Streaming responses** — new `/api/ask/stream` endpoint yields NDJSON events progressively: SQL query appears as soon as it's generated, data rows once the query runs, the analysis summary streamed character by character (works with both Ollama and OpenAI via LangChain's `.stream()`), and the chart once the pipeline finishes
- **Rate limiting** — `/api/ask` and `/api/ask/stream` are limited to 10 requests/minute per IP; `/api/suggest` is limited to 5 requests/minute — implemented with `slowapi`
- **Smart query suggestions** — `/api/suggest` endpoint: the LLM reads the active schema DDL and returns 8 relevant question suggestions; the frontend shows them in the empty-state welcome screen with a "Generate from schema" refresh button
- **Export data as CSV** — download button on every data table result; client-side CSV generation with proper quote escaping, no server round-trip needed
- **Copy SQL** — one-click copy button on every SQL accordion, with 2-second "copied" visual feedback
- **SQL History panel** — third tab in the right sidebar listing every SQL query generated in the current conversation, each with a copy button
- **Chart PNG export** — download icon on every chart card; renders the chart at 2× pixel ratio using `html-to-image`, preserving the correct background in both light and dark mode by reading the `--card` CSS variable from `:root`
- **Export conversation to Markdown** — "Export" button in the chat header; generates a structured `.md` file with questions, SQL code blocks, analysis text, and data tables (first 10 rows per query)
- **`CONTRIBUTING.md`** — setup guide, test instructions, commit conventions, and a walkthrough for adding new chart types
- **Pydantic response model** (`AskResponse` + `ChartConfig`) for `/api/ask` — validates the response contract and improves the auto-generated OpenAPI docs
- **`test_conversations.py`** — 17 tests covering the full conversation lifecycle (create, list, get, delete, rename, messages, history, auto-title)
- **LLM mocks in correction tests** — all `apply_correction` tests now run without a real LLM; fixed `test_upload_fix_renames_column` in endpoint tests for the same reason

### Changed
- `_summarize()` in `agent.py` now delegates prompt construction to `_build_summary_prompt()`, which is also used by the streaming endpoint
- Row serialization extracted to `_serialize_rows()` to share logic between the standard and streaming pipelines
- `ChatInterface` streaming step indicator and cursor blink give real-time feedback during the pipeline run

### Fixed
- **Chart PNG export background** — `getComputedStyle(element).backgroundColor` returns `rgba(0,0,0,0)` for elements styled with Tailwind CSS variable classes (`bg-card`); fixed by reading `--card` from `getComputedStyle(document.documentElement)` and constructing an explicit `hsl(...)` background colour

---

## [0.1.0] — 2026-04-01

### Added
- Text-to-SQL agent pipeline with automatic retry on SQL error (up to 2 retries)
- Contextual conversation memory — last 6 messages injected as context for follow-up questions
- Persistent conversation history saved in SQLite (`conversations.db`)
- Automatic chart type selection: bar, line, area, pie, scatter, table, KPI card — chosen by the LLM based on the query and data shape
- CSV and SQLite file upload with automatic column type inference (INT, FLOAT, VARCHAR, DATE, BOOLEAN)
- Natural language schema corrections for uploaded CSV files (rename, drop, convert, fillna)
- OpenAI and Ollama LLM provider support with runtime switching via the Settings modal
- Read-only SQL enforcement at two independent layers: agent-level regex check and SQLAlchemy `before_cursor_execute` event hook
- Sample e-commerce SQLite database — 15 tables, ~500 users, ~3,500 orders spanning 2022–2024
- Docker Compose setup with health-check-based startup ordering
- Setup wizard for first-launch LLM provider configuration
- Light/dark theme with preference stored in `localStorage`
- Schema Explorer side panel (tables, columns, types, PKs, FKs)
- FastAPI backend with 14 REST endpoints
- React + TypeScript frontend with Tailwind CSS and Radix UI
- Full test suite: agent, database, data loader, endpoints, LLM provider (no API keys needed)
- MIT License
