#!/usr/bin/env bash
# =============================================================================
# Datagentra — Setup Script
# Configures .env files and creates the local SQLite database
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

ask() {
    local varname="$1" prompt="$2" default="$3" input
    if [[ -n "$default" ]]; then
        read -rp "$(echo -e "${CYAN}${prompt}${NC} [${YELLOW}${default}${NC}]: ")" input
        input="${input:-$default}"
    else
        read -rp "$(echo -e "${CYAN}${prompt}${NC}: ")" input
    fi
    printf -v "$varname" '%s' "$input"
}


banner() {
    echo -e "${BOLD}"
    echo "╔══════════════════════════════════════════════════════╗"
    echo "║          Datagentra — Autonomous Data Analyst        ║"
    echo "║                    Setup Wizard                      ║"
    echo "╚══════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

section() {
    echo
    echo -e "${BOLD}${GREEN}▶ $1${NC}"
    echo "────────────────────────────────────────"
}

success() { echo -e "${GREEN}✓ $1${NC}"; }
warn()    { echo -e "${YELLOW}⚠ $1${NC}"; }
info()    { echo -e "${CYAN}ℹ $1${NC}"; }
error()   { echo -e "${RED}✗ $1${NC}" >&2; }

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

banner

# ── App config ────────────────────────────────────────────────────────────────
section "General configuration"
ask MAX_UPLOAD_SIZE_MB "Maximum upload file size (MB)" "50"
ask VITE_API_URL       "Backend URL (for the frontend)" "http://localhost:8000"

SQLITE_DB_PATH="${SCRIPT_DIR}/db/datagentra.db"

# ── Write backend/.env ────────────────────────────────────────────────────────
section "Writing .env files"

# Preserve existing OPENAI_API_KEY if already set
EXISTING_ENV="${SCRIPT_DIR}/backend/.env"
EXISTING_OPENAI_KEY=""
if [[ -f "$EXISTING_ENV" ]]; then
    EXISTING_OPENAI_KEY=$(grep -E '^OPENAI_API_KEY=' "$EXISTING_ENV" | cut -d'=' -f2- || true)
fi

cat > "${EXISTING_ENV}" <<EOF
# SQLite database
SQLITE_DB_PATH=${SQLITE_DB_PATH}

# LLM Provider — configured from the UI on first launch
LLM_PROVIDER=openai
OPENAI_API_KEY=${EXISTING_OPENAI_KEY}
OPENAI_MODEL=gpt-4o-mini
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b

# App config
MAX_UPLOAD_SIZE_MB=${MAX_UPLOAD_SIZE_MB}
EOF

success "backend/.env created"

cat > "${SCRIPT_DIR}/frontend/.env" <<EOF
VITE_API_URL=${VITE_API_URL}
EOF

success "frontend/.env created"

# ── Create SQLite database ────────────────────────────────────────────────────
section "Creating SQLite database"

if [[ -f "$SQLITE_DB_PATH" ]]; then
    warn "Database already exists at: ${SQLITE_DB_PATH}"
    ask RESEED "Recreate it? (this will delete all data) [y/N]" "N"
    if [[ "${RESEED,,}" == "y" ]]; then
        rm -f "$SQLITE_DB_PATH"
        info "Database deleted, recreating..."
    else
        success "Keeping existing database"
    fi
fi

if [[ ! -f "$SQLITE_DB_PATH" ]]; then
    # Try uv first, then python3
    SEED_SCRIPT="${SCRIPT_DIR}/db/seed_sqlite.py"
    if command -v uv &>/dev/null; then
        (cd "${SCRIPT_DIR}/backend" && SQLITE_DB_PATH="$SQLITE_DB_PATH" uv run python "${SEED_SCRIPT}")
    elif command -v python3 &>/dev/null; then
        SQLITE_DB_PATH="$SQLITE_DB_PATH" python3 "${SEED_SCRIPT}"
    else
        error "Neither 'uv' nor 'python3' found. Install Python 3.12+ to create the database."
        exit 1
    fi
    success "Database created: ${SQLITE_DB_PATH}"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
section "Setup complete"

echo
echo -e "${BOLD}Configuration saved:${NC}"
echo -e "  Database:  ${YELLOW}${SQLITE_DB_PATH}${NC}"
echo -e "  Frontend:  ${YELLOW}http://localhost:5173${NC}"
echo -e "  Backend:   ${YELLOW}http://localhost:8000${NC}"
echo -e "  LLM:       ${CYAN}configurable from the UI on first launch${NC}"
echo

# ── Check dependencies ────────────────────────────────────────────────────────
section "Checking dependencies"

if ! command -v uv &>/dev/null; then
    error "'uv' is not installed. Install it with: curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi
success "uv $(uv --version 2>&1 | head -1)"

if ! command -v npm &>/dev/null; then
    error "'npm' is not installed. Install Node.js from https://nodejs.org/"
    exit 1
fi
success "npm $(npm --version)"

# ── Install frontend deps if needed ───────────────────────────────────────────
if [[ ! -d "${SCRIPT_DIR}/frontend/node_modules" ]]; then
    info "Installing frontend dependencies (first time)..."
    (cd "${SCRIPT_DIR}/frontend" && npm install --silent)
    success "Frontend dependencies installed"
fi

# ── Launch ────────────────────────────────────────────────────────────────────
section "Starting the application"

# Kill any existing processes on these ports
for port in 8000 5173; do
    pid=$(lsof -ti tcp:"$port" 2>/dev/null || true)
    if [[ -n "$pid" ]]; then
        warn "Port $port in use (PID $pid) — stopping..."
        kill -9 $pid 2>/dev/null || true
        sleep 0.5
    fi
done

BACKEND_LOG="${SCRIPT_DIR}/backend.log"
FRONTEND_LOG="${SCRIPT_DIR}/frontend.log"

info "Starting backend  → logs in backend.log"
(cd "${SCRIPT_DIR}/backend" && uv run uvicorn app.main:app --port 8000) > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

info "Starting frontend → logs in frontend.log"
(cd "${SCRIPT_DIR}/frontend" && npm run dev) > "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

# Wait for backend to be ready
info "Waiting for backend to be ready..."
for i in $(seq 1 30); do
    if curl -sf http://localhost:8000/health &>/dev/null; then
        break
    fi
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        error "Backend failed to start. Check backend.log:"
        tail -20 "$BACKEND_LOG"
        kill "$FRONTEND_PID" 2>/dev/null || true
        exit 1
    fi
    sleep 1
done

if ! curl -sf http://localhost:8000/health &>/dev/null; then
    error "Backend did not respond in time. Check backend.log:"
    tail -20 "$BACKEND_LOG"
    kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
    exit 1
fi

success "Backend ready at http://localhost:8000"

# Wait for frontend to be ready
info "Waiting for frontend to be ready..."
for i in $(seq 1 30); do
    if curl -sf http://localhost:5173 &>/dev/null; then
        break
    fi
    if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
        error "Frontend failed to start. Check frontend.log:"
        tail -20 "$FRONTEND_LOG"
        break
    fi
    sleep 1
done

success "Frontend ready at http://localhost:5173"

echo
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║   Datagentra running at http://localhost:5173        ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo
echo -e "  Backend PID:  ${YELLOW}${BACKEND_PID}${NC}   (logs: backend.log)"
echo -e "  Frontend PID: ${YELLOW}${FRONTEND_PID}${NC}  (logs: frontend.log)"
echo
echo -e "  To stop: ${CYAN}kill ${BACKEND_PID} ${FRONTEND_PID}${NC}"
echo

# Keep script alive so Ctrl+C stops both processes
cleanup() {
    echo
    warn "Stopping services..."
    kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
    success "Services stopped."
}
trap cleanup EXIT INT TERM

wait "$BACKEND_PID" "$FRONTEND_PID"
