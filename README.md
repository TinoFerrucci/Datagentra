# Datagentra — Analista de Datos Autónomo

Convierte preguntas en lenguaje natural en SQL, gráficos y conclusiones. 100% local con Ollama o en la nube con OpenAI.

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
│                    FastAPI Backend                          │
│   :8000                                                     │
│   ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐ │
│   │  agent.py   │  │ data_loader  │  │   llm_provider    │ │
│   │ Text→SQL    │  │ CSV / SQLite │  │ Ollama | OpenAI   │ │
│   └──────┬──────┘  └──────────────┘  └─────────┬─────────┘ │
│          │                                      │           │
└──────────┼──────────────────────────────────────┼───────────┘
           │                                      │
           ▼                                      ▼
┌────────────────────┐              ┌─────────────────────────┐
│   PostgreSQL :5432 │              │   Ollama :11434         │
│   E-commerce data  │              │   qwen2.5:7b (local)   │
└────────────────────┘              └─────────────────────────┘
```

## Requisitos Previos

- Docker y Docker Compose v2
- (Opcional) Python 3.12+ y `uv` para desarrollo local
- (Opcional) Node.js 20+ para desarrollo local del frontend
- (Opcional) API Key de OpenAI para modo cloud

## Inicio Rápido — Setup Automático (recomendado)

El script `setup.sh` configura los `.env` interactivamente y al terminar muestra exactamente qué comandos ejecutar. Si no ingresás nada, usa los valores por defecto.

```bash
# 1. Clonar el repo
git clone <repo-url>
cd Datagentra

# 2. Ejecutar el wizard
chmod +x setup.sh
./setup.sh
```

El script te preguntará:
- **Proveedor LLM** — Ollama (local) u OpenAI (cloud)
- **Modelo** — por defecto `qwen2.5:7b` para Ollama o `gpt-4o-mini` para OpenAI
- **Credenciales de base de datos** — usuario, contraseña y nombre de BD (todos con defaults)

Al finalizar genera `backend/.env` y `frontend/.env` y muestra la guía de inicio paso a paso según tu configuración.

### Guía de inicio post-setup (Ollama)

```bash
# 1. Dar permisos de Docker a tu usuario (solo la primera vez)
sudo usermod -aG docker $USER
newgrp docker

# 2. Levantar servicios (construye imágenes la primera vez)
docker compose --profile ollama up --build

# 3. Descargar el modelo (~4GB, solo la primera vez)
docker compose --profile ollama run --rm ollama-pull

# 4. Abrir http://localhost:5173
```

### Guía de inicio post-setup (OpenAI)

```bash
sudo usermod -aG docker $USER && newgrp docker
docker compose up --build
# Abrir http://localhost:5173
```

## Inicio Rápido — Manual

### Opción Ollama (local, sin costo)

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

docker compose --profile ollama up --build
docker compose --profile ollama run --rm ollama-pull  # primera vez

# http://localhost:5173
```

### Opción OpenAI (cloud)

```bash
cp backend/.env.example backend/.env
# Editar backend/.env: LLM_PROVIDER=openai, OPENAI_API_KEY=sk-...
cp frontend/.env.example frontend/.env

docker compose up --build
# http://localhost:5173
```

## Variables de Entorno

### `backend/.env`

| Variable | Descripción | Valores | Default |
|---|---|---|---|
| `DATABASE_URL` | URL de conexión a PostgreSQL | postgresql://... | postgresql://datagentra:datagentra_pass@db:5432/datagentra |
| `LLM_PROVIDER` | Proveedor LLM | `ollama` / `openai` | `ollama` |
| `OLLAMA_BASE_URL` | URL del servidor Ollama | http://... | http://ollama:11434 |
| `OLLAMA_MODEL` | Modelo Ollama | qwen2.5:7b, llama3.2, etc. | `qwen2.5:7b` |
| `OPENAI_API_KEY` | API Key de OpenAI | sk-... | (vacío) |
| `OPENAI_MODEL` | Modelo OpenAI | gpt-4o, gpt-4o-mini | `gpt-4o-mini` |
| `MAX_UPLOAD_SIZE_MB` | Tamaño máximo de archivos | número | `50` |

### `frontend/.env`

| Variable | Descripción | Default |
|---|---|---|
| `VITE_API_URL` | URL del backend | `http://localhost:8000` |

## Modos de LLM

### Ollama (Local, sin costo)

Modelos recomendados:
- `qwen2.5:7b` — Buen balance velocidad/calidad para SQL
- `llama3.2:3b` — Más rápido, menor calidad
- `codellama:7b` — Especializado en código/SQL

### OpenAI (Cloud)

Modelos recomendados:
- `gpt-4o-mini` — Económico, excelente para SQL
- `gpt-4o` — Máxima calidad

## Ejecutar Tests

```bash
cd backend
pip install uv && uv sync

# Tests unitarios (sin API Key)
uv run pytest -m "not integration" -v

# Con cobertura
uv run pytest --cov=app --cov-report=term-missing -v

# Tests de integración (requiere OPENAI_API_KEY en backend/.env)
uv run pytest -m integration -v
```

## Estructura del Proyecto

```
Datagentra/
├── docker-compose.yml
├── db/init.sql              # Schema + seed E-commerce
├── backend/
│   ├── app/
│   │   ├── main.py          # Endpoints FastAPI
│   │   ├── agent.py         # Pipeline Text-to-SQL
│   │   ├── database.py      # Engines + DDL
│   │   ├── data_loader.py   # CSV/SQLite loader
│   │   └── llm_provider.py  # Factory Ollama/OpenAI
│   └── tests/
└── frontend/
    └── src/
        ├── App.tsx
        ├── hooks/useDatagentra.ts
        └── components/
```

## Solución de Problemas

- **DB no conecta** → `docker compose logs db` / verificar credenciales
- **Ollama sin modelo** → `docker compose --profile ollama run ollama-pull`
- **CORS error** → Verificar `VITE_API_URL=http://localhost:8000`
- **Tests fallan** → Usar `uv run pytest -m "not integration" -v`

## Licencia

MIT