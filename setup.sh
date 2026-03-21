#!/usr/bin/env bash
# =============================================================================
# Datagentra — Setup Script
# Configura .env y crea la base de datos SQLite local
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

ask_secret() {
    local varname="$1" prompt="$2" input
    read -rsp "$(echo -e "${CYAN}${prompt}${NC}: ")" input
    echo
    printf -v "$varname" '%s' "$input"
}

banner() {
    echo -e "${BOLD}"
    echo "╔══════════════════════════════════════════════════════╗"
    echo "║        Datagentra — Analista de Datos Autónomo       ║"
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

# ── LLM Provider ──────────────────────────────────────────────────────────────
section "LLM Provider"
echo "  1) OpenAI  — cloud, requiere API Key (recomendado)"
echo "  2) Ollama  — local, sin costo"
echo

ask LLM_CHOICE "Elige proveedor [1/2]" "1"

if [[ "$LLM_CHOICE" == "2" ]]; then
    LLM_PROVIDER="ollama"
    ask OLLAMA_MODEL "Modelo Ollama" "qwen2.5:7b"
    OPENAI_API_KEY=""
    OPENAI_MODEL="gpt-4o-mini"
    if curl -sf http://localhost:11434/api/tags &>/dev/null; then
        OLLAMA_BASE_URL="http://localhost:11434"
        success "Ollama detectado en http://localhost:11434"
    else
        OLLAMA_BASE_URL="http://localhost:11434"
        warn "No se detectó Ollama corriendo. Asegurate de tenerlo iniciado antes de usar la app."
    fi
else
    LLM_PROVIDER="openai"
    ask_secret OPENAI_API_KEY "OpenAI API Key (sk-...)"
    if [[ -z "$OPENAI_API_KEY" ]]; then
        error "La API Key no puede estar vacía para el modo OpenAI."
        exit 1
    fi
    ask OPENAI_MODEL "Modelo OpenAI" "gpt-4o-mini"
    OLLAMA_BASE_URL="http://localhost:11434"
    OLLAMA_MODEL="qwen2.5:7b"
fi

# ── App config ────────────────────────────────────────────────────────────────
section "Configuración general"
ask MAX_UPLOAD_SIZE_MB "Tamaño máximo de archivos subidos (MB)" "50"
ask VITE_API_URL       "URL del backend (para el frontend)"    "http://localhost:8000"

SQLITE_DB_PATH="${SCRIPT_DIR}/db/datagentra.db"

# ── Write backend/.env ────────────────────────────────────────────────────────
section "Escribiendo archivos .env"

cat > "${SCRIPT_DIR}/backend/.env" <<EOF
# SQLite database
SQLITE_DB_PATH=${SQLITE_DB_PATH}

# LLM Provider: openai | ollama
LLM_PROVIDER=${LLM_PROVIDER}

# OpenAI config (used when LLM_PROVIDER=openai)
OPENAI_API_KEY=${OPENAI_API_KEY}
OPENAI_MODEL=${OPENAI_MODEL}

# Ollama config (used when LLM_PROVIDER=ollama)
OLLAMA_BASE_URL=${OLLAMA_BASE_URL}
OLLAMA_MODEL=${OLLAMA_MODEL}

# App config
MAX_UPLOAD_SIZE_MB=${MAX_UPLOAD_SIZE_MB}
EOF

success "backend/.env generado"

cat > "${SCRIPT_DIR}/frontend/.env" <<EOF
VITE_API_URL=${VITE_API_URL}
EOF

success "frontend/.env generado"

# ── Create SQLite database ────────────────────────────────────────────────────
section "Creando base de datos SQLite"

if [[ -f "$SQLITE_DB_PATH" ]]; then
    warn "La base de datos ya existe en: ${SQLITE_DB_PATH}"
    ask RESEED "¿Recrearla? (borrará todos los datos) [s/N]" "N"
    if [[ "${RESEED,,}" == "s" ]]; then
        rm -f "$SQLITE_DB_PATH"
        info "Base de datos eliminada, recreando..."
    else
        success "Se mantendrá la base de datos existente"
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
        error "No se encontró 'uv' ni 'python3'. Instala Python 3.12+ para crear la base de datos."
        exit 1
    fi
    success "Base de datos creada: ${SQLITE_DB_PATH}"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
section "Setup completado"

echo
echo -e "${BOLD}Configuración guardada:${NC}"
echo -e "  LLM Provider:  ${YELLOW}${LLM_PROVIDER}${NC}"
if [[ "$LLM_PROVIDER" == "ollama" ]]; then
    echo -e "  Modelo:        ${YELLOW}${OLLAMA_MODEL}${NC}"
else
    echo -e "  Modelo:        ${YELLOW}${OPENAI_MODEL}${NC}"
fi
echo -e "  Base de datos: ${YELLOW}${SQLITE_DB_PATH}${NC}"
echo -e "  Frontend:      ${YELLOW}http://localhost:5173${NC}"
echo -e "  Backend:       ${YELLOW}http://localhost:8000${NC}"
echo

# ── Check dependencies ────────────────────────────────────────────────────────
section "Verificando dependencias"

if ! command -v uv &>/dev/null; then
    error "'uv' no está instalado. Instálalo con: curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi
success "uv $(uv --version 2>&1 | head -1)"

if ! command -v npm &>/dev/null; then
    error "'npm' no está instalado. Instala Node.js desde https://nodejs.org/"
    exit 1
fi
success "npm $(npm --version)"

# ── Install frontend deps if needed ───────────────────────────────────────────
if [[ ! -d "${SCRIPT_DIR}/frontend/node_modules" ]]; then
    info "Instalando dependencias del frontend (primera vez)..."
    (cd "${SCRIPT_DIR}/frontend" && npm install --silent)
    success "Dependencias del frontend instaladas"
fi

# ── Launch ────────────────────────────────────────────────────────────────────
section "Iniciando la aplicación"

# Kill any existing processes on these ports
for port in 8000 5173; do
    pid=$(lsof -ti tcp:"$port" 2>/dev/null || true)
    if [[ -n "$pid" ]]; then
        warn "Puerto $port ocupado (PID $pid) — cerrando..."
        kill -9 $pid 2>/dev/null || true
        sleep 0.5
    fi
done

BACKEND_LOG="${SCRIPT_DIR}/backend.log"
FRONTEND_LOG="${SCRIPT_DIR}/frontend.log"

info "Iniciando backend  → logs en backend.log"
(cd "${SCRIPT_DIR}/backend" && uv run uvicorn app.main:app --port 8000) > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

info "Iniciando frontend → logs en frontend.log"
(cd "${SCRIPT_DIR}/frontend" && npm run dev) > "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

# Wait for backend to be ready
info "Esperando que el backend esté listo..."
for i in $(seq 1 30); do
    if curl -sf http://localhost:8000/health &>/dev/null; then
        break
    fi
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        error "El backend falló al iniciar. Revisá backend.log:"
        tail -20 "$BACKEND_LOG"
        kill "$FRONTEND_PID" 2>/dev/null || true
        exit 1
    fi
    sleep 1
done

if ! curl -sf http://localhost:8000/health &>/dev/null; then
    error "El backend no respondió a tiempo. Revisá backend.log:"
    tail -20 "$BACKEND_LOG"
    kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
    exit 1
fi

success "Backend listo en http://localhost:8000"

# Wait for frontend to be ready
info "Esperando que el frontend esté listo..."
for i in $(seq 1 30); do
    if curl -sf http://localhost:5173 &>/dev/null; then
        break
    fi
    if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
        error "El frontend falló al iniciar. Revisá frontend.log:"
        tail -20 "$FRONTEND_LOG"
        break
    fi
    sleep 1
done

success "Frontend listo en http://localhost:5173"

echo
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║   Datagentra corriendo en http://localhost:5173      ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo
echo -e "  Backend PID:  ${YELLOW}${BACKEND_PID}${NC}   (logs: backend.log)"
echo -e "  Frontend PID: ${YELLOW}${FRONTEND_PID}${NC}  (logs: frontend.log)"
echo
echo -e "  Para detener: ${CYAN}kill ${BACKEND_PID} ${FRONTEND_PID}${NC}"
echo

# Keep script alive so Ctrl+C stops both processes
cleanup() {
    echo
    warn "Deteniendo servicios..."
    kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
    success "Servicios detenidos."
}
trap cleanup EXIT INT TERM

wait "$BACKEND_PID" "$FRONTEND_PID"
