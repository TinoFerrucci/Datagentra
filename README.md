# Datagentra — Analista de Datos Autónomo

Convierte preguntas en lenguaje natural en SQL, gráficos y conclusiones. 100% local con Ollama o en la nube con OpenAI. Sin Docker para la base de datos — todo corre localmente con SQLite.

## Características

- **Text-to-SQL** — genera SQL a partir de lenguaje natural, con hasta 2 reintentos automáticos en caso de error
- **Historial de conversaciones** — cada conversación se guarda localmente en SQLite; podés crear, cambiar, renombrar y eliminar conversaciones desde el sidebar
- **Gráficos automáticos** — bar, line, area, pie o KPI según el tipo de datos
- **Carga de archivos** — sube CSV o SQLite y consultá directamente tus propios datos
- **Correcciones en lenguaje natural** — describí cómo modificar columnas del CSV antes de confirmar el source
- **Proveedor LLM configurable** — OpenAI (cloud) u Ollama (local, sin costo)
- **Schema explorer** — navegación visual del esquema activo en el panel derecho

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│   React + Vite + TypeScript + Tailwind + Recharts           │
│   :5173                                                     │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP (CORS)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI Backend :8000                     │
│   ┌────────────┐ ┌─────────────┐ ┌──────────────────────┐   │
│   │  agent.py  │ │data_loader  │ │  conversations.py    │   │
│   │ Text→SQL   │ │CSV / SQLite │ │  Historial en SQLite │   │
│   └─────┬──────┘ └─────────────┘ └──────────────────────┘   │
│         │                   llm_provider.py                  │
└─────────┼───────────────────────┬─────────────────────────────┘
          │                       │
          ▼                       ▼
┌──────────────────────┐  ┌────────────────────────┐
│ db/datagentra.db     │  │  OpenAI API  /          │
│ E-commerce SQLite    │  │  Ollama :11434 (local)  │
│ db/conversations.db  │  └────────────────────────┘
│ Historial de chats   │
└──────────────────────┘
```

## Requisitos Previos

- Python 3.12+ y `uv` (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
- Node.js 20+
- OpenAI API Key **o** Ollama instalado localmente

## Inicio Rápido

```bash
git clone <repo-url>
cd Datagentra
chmod +x setup.sh
./setup.sh
```

El script `setup.sh` hace todo automáticamente:
1. Te pregunta el proveedor LLM y credenciales
2. Crea la base de datos SQLite con datos de e-commerce de muestra
3. Instala dependencias del frontend
4. **Levanta el backend y el frontend** (Ctrl+C para detener ambos)

Una vez corriendo, abrí **http://localhost:5173**.

## Lo que pregunta el setup

| Pregunta | Default |
|---|---|
| Proveedor LLM (OpenAI / Ollama) | OpenAI |
| API Key (si OpenAI) | — |
| Modelo | `gpt-4o-mini` / `qwen2.5:7b` |
| Tamaño máximo de archivos (MB) | 50 |
| URL del backend | http://localhost:8000 |

## Conversaciones

Cada vez que hacés una pregunta, el backend guarda automáticamente:
- El mensaje del usuario
- La respuesta completa del agente (SQL, datos, resumen, config de gráfico)

Todo se persiste en `db/conversations.db` (SQLite local).

### Funciones desde la UI

| Acción | Cómo |
|---|---|
| Nueva conversación | Botón `+` en el sidebar o `Nueva` en el header |
| Cambiar conversación | Clic en el nombre en el sidebar |
| Renombrar | Doble clic sobre el nombre, o ícono ✏️ |
| Eliminar | Ícono 🗑️ al hacer hover |
| Título automático | Se asigna desde la primera pregunta |

## Variables de Entorno

### `backend/.env`

| Variable | Descripción | Default |
|---|---|---|
| `SQLITE_DB_PATH` | Path a la base de datos e-commerce | `../db/datagentra.db` |
| `CONVERSATIONS_DB_PATH` | Path al historial de conversaciones | `../db/conversations.db` |
| `LLM_PROVIDER` | Proveedor LLM | `openai` |
| `OPENAI_API_KEY` | API Key de OpenAI | — |
| `OPENAI_MODEL` | Modelo OpenAI | `gpt-4o-mini` |
| `OLLAMA_BASE_URL` | URL del servidor Ollama | `http://localhost:11434` |
| `OLLAMA_MODEL` | Modelo Ollama | `qwen2.5:7b` |
| `MAX_UPLOAD_SIZE_MB` | Tamaño máximo de archivos | `50` |

### `frontend/.env`

| Variable | Descripción | Default |
|---|---|---|
| `VITE_API_URL` | URL del backend | `http://localhost:8000` |

## Ejecutar Tests

```bash
cd backend
UV_PROJECT_ENVIRONMENT=.venv_local uv run pytest tests/ -v
```

> El `.venv` creado por Docker tiene permisos de root. Usar `UV_PROJECT_ENVIRONMENT=.venv_local` crea un venv propio sin conflictos.

## Estructura del Proyecto

```
Datagentra/
├── setup.sh                    # Wizard de configuración + launcher
├── docker-compose.yml          # Backend + frontend (opcional)
├── db/
│   ├── seed_sqlite.py          # Crea datagentra.db con datos de muestra
│   ├── datagentra.db           # E-commerce: 40 productos, 50 users, 120 órdenes
│   └── conversations.db        # Historial de conversaciones (auto-creado)
├── backend/
│   ├── app/
│   │   ├── __init__.py         # Carga .env al inicio
│   │   ├── main.py             # Endpoints FastAPI
│   │   ├── agent.py            # Pipeline Text-to-SQL
│   │   ├── database.py         # Engines SQLite + DDL helpers
│   │   ├── conversations.py    # CRUD historial de conversaciones
│   │   ├── data_loader.py      # CSV/SQLite loader
│   │   └── llm_provider.py     # Factory Ollama/OpenAI
│   └── tests/                  # 47 tests unitarios
└── frontend/
    └── src/
        ├── App.tsx             # Layout: sidebar conversations + chat + schema
        ├── hooks/useDatagentra.ts
        └── components/
```

## Modos de LLM

### OpenAI (recomendado para calidad)

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

### Ollama (local, sin costo)

```bash
# Instalar Ollama
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5:7b
```

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b
```

Modelos recomendados para SQL: `qwen2.5:7b`, `codellama:7b`, `llama3.2:3b`

## Opción Docker (solo app, sin DB externa)

```bash
docker compose up --build
```

Levanta backend + frontend en contenedores. La base de datos SQLite se monta desde `./db/`.

## Solución de Problemas

| Problema | Solución |
|---|---|
| `model 'X' not found` | El `.env` no se cargó. Reiniciá el backend |
| `Connection refused` en Ollama | Ollama solo escucha en `127.0.0.1`. Ver abajo |
| `Permission denied` en `.venv` | Usar `UV_PROJECT_ENVIRONMENT=.venv_local uv run ...` |
| Tests con CORS | Verificar `VITE_API_URL=http://localhost:8000` |

### Ollama accesible desde Docker

Por defecto Ollama solo escucha en `127.0.0.1:11434`. Para acceso desde contenedores:

```bash
sudo systemctl edit ollama
# Agregar:
# [Service]
# Environment="OLLAMA_HOST=0.0.0.0"

sudo systemctl daemon-reload && sudo systemctl restart ollama
```

## Licencia

MIT
