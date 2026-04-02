# Contributing to Datagentra

Thank you for your interest! This guide covers everything you need to contribute.

## Prerequisites

- Python 3.12+
- Node.js 20+ and npm
- [uv](https://docs.astral.sh/uv/) — Python package manager
- Git

## Development Setup

### 1. Fork and clone

```bash
git clone https://github.com/YOUR_USERNAME/Datagentra.git
cd Datagentra
```

### 2. Configure and start

```bash
chmod +x setup.sh
./setup.sh
```

The wizard creates `.env` files, seeds the sample database, and starts both servers.

To start servers manually:

```bash
# Backend (from /backend)
uv run uvicorn app.main:app --reload --port 8000

# Frontend (from /frontend, separate terminal)
npm install && npm run dev
```

## Running Tests

All tests run without a live LLM or database — no API keys required:

```bash
cd backend
uv run pytest tests/ -v
```

Run with coverage:

```bash
uv run pytest tests/ --cov=app --cov-report=term-missing
```

## Commit Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

| Prefix | When to use |
|--------|-------------|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `test:` | Adding or improving tests |
| `refactor:` | Code change that's neither a fix nor a feature |
| `chore:` | Build process or tooling |

Example: `feat: add PostgreSQL connection support`

## Pull Request Process

1. Create a branch from `main`: `git checkout -b feat/your-feature`
2. Make your changes and add or update tests
3. Run the test suite and confirm it passes
4. Open a PR against `main` with:
   - A clear title following commit conventions
   - A description of what changed and why
   - Screenshots or a short screen recording for UI changes

## How to Add a New Chart Type

1. Create `frontend/src/components/charts/YourChartComponent.tsx`
2. Register it in `frontend/src/components/charts/DynamicChart.tsx`
3. Add the type name to the prompt in `backend/app/agent.py` → `_suggest_chart()`
4. Add the type to the union in `frontend/src/hooks/useDatagentra.ts` → `AgentResponse.chart_type`

## Project Structure

```
Datagentra/
├── backend/
│   ├── app/
│   │   ├── agent.py          # Text-to-SQL pipeline (5 steps)
│   │   ├── database.py       # SQLAlchemy engines + schema introspection
│   │   ├── conversations.py  # Chat history persistence (SQLite)
│   │   ├── data_loader.py    # CSV / SQLite file upload
│   │   ├── llm_provider.py   # OpenAI / Ollama factory + streaming
│   │   └── main.py           # FastAPI endpoints
│   └── tests/                # Pytest test suite (65 tests, no real LLM needed)
├── frontend/
│   └── src/
│       ├── components/       # React components
│       │   └── charts/       # One file per chart type
│       └── hooks/            # Central state (useDatagentra)
├── db/                       # SQLite databases
├── docs/                     # Screenshots and documentation assets
└── setup.sh                  # Interactive setup wizard
```

## Questions

Open a GitHub issue if something is unclear or if you want to propose a significant change before starting work.
