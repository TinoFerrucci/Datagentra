<p align="center">
  <img src="frontend/statics/datagentra.png" alt="Datagentra" width="420"/>
</p>

<p align="center">
  Convierte preguntas en lenguaje natural en SQL, gráficos y conclusiones.<br/>
  100% local con Ollama o en la nube con OpenAI. Sin Docker para la base de datos — todo corre localmente con SQLite.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.12+-blue?logo=python" alt="Python 3.12+"/>
  <img src="https://img.shields.io/badge/FastAPI-0.115+-green?logo=fastapi" alt="FastAPI"/>
  <img src="https://img.shields.io/badge/React-18.3-61DAFB?logo=react" alt="React 18"/>
  <img src="https://img.shields.io/badge/TypeScript-5.6-blue?logo=typescript" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/LLM-OpenAI%20%7C%20Ollama-orange" alt="LLM"/>
  <img src="https://img.shields.io/badge/License-MIT-lightgrey" alt="MIT"/>
</p>

---

## ¿Qué es Datagentra?

Datagentra es un **analista de datos autónomo** que vive en tu máquina. Le hacés una pregunta en español (o inglés) y él:

1. Entiende tu pregunta y lee el esquema de la base de datos activa
2. Genera la consulta SQL correspondiente usando un LLM
3. Ejecuta el SQL de forma segura (solo lectura)
4. Analiza los resultados y escribe un resumen con observaciones clave
5. Sugiere el tipo de gráfico más adecuado y lo renderiza automáticamente

Todo en una sola interfaz de chat. Sin escribir SQL, sin abrir un cliente de base de datos, sin exportar CSVs.

---

## Características

- **Text-to-SQL con reintentos** — si el SQL falla, el agente analiza el error y regenera la consulta automáticamente (hasta 2 reintentos)
- **Memoria contextual por conversación** — el agente recuerda las últimas 6 preguntas y respuestas dentro de una misma conversación, lo que permite preguntas de seguimiento naturales ("¿y de esos, cuántos son del exterior?")
- **Historial persistente** — cada conversación se guarda en SQLite; podés crear, renombrar, cambiar y eliminar conversaciones desde el sidebar
- **Gráficos automáticos** — bar, line, area, pie o KPI card según el tipo de datos que devuelve la consulta
- **Carga de archivos** — subí un CSV o un archivo SQLite y consultalo directamente con lenguaje natural
- **Correcciones en lenguaje natural** — antes de confirmar un CSV, podés pedirle al sistema cosas como "renombrá la columna `fecha` a `date`" o "eliminá la columna `id_interno`"
- **Proveedor LLM configurable** — OpenAI (cloud, recomendado) u Ollama (local, sin costo y sin enviar datos a terceros)
- **Schema Explorer** — panel lateral con la estructura completa de la base activa: tablas, columnas, tipos, PKs, FKs y relaciones
- **Tema claro/oscuro** — con preferencia guardada en `localStorage`
- **Ejecución segura** — el motor de solo lectura bloquea cualquier operación de escritura (`INSERT`, `UPDATE`, `DELETE`, `DROP`, etc.) tanto a nivel de SQLAlchemy como antes de ejecutar

---

## Screenshots

> _Agregá capturas de pantalla aquí para mostrar la interfaz en acción._

<!-- Ejemplo:
| Tema claro | Tema oscuro |
|---|---|
| ![Light](docs/screenshots/light.png) | ![Dark](docs/screenshots/dark.png) |

![Chat con gráfico](docs/screenshots/chat-chart.png)
![Schema Explorer](docs/screenshots/schema.png)
-->

---

## Cómo funciona el pipeline

Cuando hacés una pregunta, el backend ejecuta un pipeline de 5 pasos:

```
Pregunta del usuario
        │
        ▼
 ┌──────────────────────────────────────────────────────────┐
 │ 1. Generación de SQL                                      │
 │    El LLM recibe: esquema DDL + historial de la           │
 │    conversación + tu pregunta → genera una consulta SQL  │
 └──────────────────┬───────────────────────────────────────┘
                    │
                    ▼
 ┌──────────────────────────────────────────────────────────┐
 │ 2. Ejecución con reintentos                               │
 │    Ejecuta el SQL sobre el engine de solo lectura.        │
 │    Si falla, el LLM analiza el error y corrige el SQL.   │
 │    Máximo 2 reintentos automáticos.                       │
 └──────────────────┬───────────────────────────────────────┘
                    │
                    ▼
 ┌──────────────────────────────────────────────────────────┐
 │ 3. Resumen                                                │
 │    El LLM analiza las filas devueltas y escribe un        │
 │    párrafo con las conclusiones y métricas más relevantes │
 └──────────────────┬───────────────────────────────────────┘
                    │
                    ▼
 ┌──────────────────────────────────────────────────────────┐
 │ 4. Sugerencia de gráfico                                  │
 │    El LLM elige el tipo de gráfico más adecuado           │
 │    (bar / line / area / pie / metric) y los ejes         │
 └──────────────────┬───────────────────────────────────────┘
                    │
                    ▼
 ┌──────────────────────────────────────────────────────────┐
 │ 5. Respuesta final                                        │
 │    SQL + datos + resumen + gráfico → guardado en         │
 │    conversations.db → renderizado en el chat             │
 └──────────────────────────────────────────────────────────┘
```

---

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
└─────────┼───────────────────────┬──────────────────────────┘
          │                       │
          ▼                       ▼
┌──────────────────────┐  ┌────────────────────────┐
│ db/datagentra.db     │  │  OpenAI API  /          │
│ E-commerce SQLite    │  │  Ollama :11434 (local)  │
│ db/conversations.db  │  └────────────────────────┘
│ Historial de chats   │
└──────────────────────┘
```

### Stack tecnológico

| Capa | Tecnología | Versión |
|---|---|---|
| Backend API | FastAPI + Uvicorn | 0.115+ |
| ORM | SQLAlchemy | 2.0+ |
| LLM | LangChain (OpenAI / Ollama) | 0.3+ |
| Procesamiento CSV | Pandas | 2.2+ |
| Frontend | React + TypeScript + Vite | 18.3 / 5.6 / 5.4 |
| Estilos | Tailwind CSS + Radix UI | 3.4 |
| Gráficos | Recharts | 2.13 |
| Base de datos | SQLite | — |
| Gestor de deps Python | uv | latest |

---

## Requisitos Previos

Necesitás tener instalado lo siguiente antes de correr el setup:

### 1. Python 3.12+

Descargá desde **https://www.python.org/downloads/**

Verificá la instalación:
```bash
python3 --version   # debe mostrar 3.12 o superior
```

### 2. uv (gestor de paquetes Python)

`uv` es el gestor de dependencias ultrarrápido de Astral que usa este proyecto. Reemplaza a `pip` + `venv`.

Documentación oficial: **https://docs.astral.sh/uv/**

```bash
# Linux / macOS
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows (PowerShell)
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

Verificá la instalación:
```bash
uv --version
```

### 3. Node.js 20+ (incluye npm)

Descargá desde **https://nodejs.org/en/download** — elegí la versión LTS (recomendada).

`npm` viene incluido con Node.js. También podés usar **nvm** para gestionar versiones: https://github.com/nvm-sh/nvm

Verificá la instalación:
```bash
node --version   # debe mostrar v20 o superior
npm --version
```

### 4. LLM — elegí uno:

#### Opción A: OpenAI (recomendado para mejor calidad)
Necesitás una API Key de OpenAI. Creala en: **https://platform.openai.com/api-keys**

#### Opción B: Ollama (local, sin costo, sin enviar datos)
Descargá e instalá Ollama desde: **https://ollama.com/download**

```bash
# Luego descargá un modelo de lenguaje (ej. qwen2.5:7b — ~4.7 GB)
ollama pull qwen2.5:7b
```

---

## Inicio Rápido (Local)

```bash
git clone <repo-url>
cd Datagentra
chmod +x setup.sh
./setup.sh
```

El script `setup.sh` hace todo de forma automática:

| Paso | Qué hace |
|---|---|
| 1 | Te pregunta el tamaño máximo de archivos y la URL del backend |
| 2 | Crea `backend/.env` y `frontend/.env` con esa configuración |
| 3 | Crea la base de datos SQLite con datos de e-commerce de muestra |
| 4 | Instala las dependencias del frontend (solo la primera vez) |
| 5 | Verifica que `uv` y `npm` estén disponibles |
| 6 | Levanta el backend (puerto 8000) y el frontend (puerto 5173) |
| 7 | Espera a que ambos servicios estén listos y muestra la URL |

Una vez corriendo, abrí **http://localhost:5173** en tu browser.

> Presioná `Ctrl+C` en la terminal para detener ambos servicios.

---

## Opción Docker

> Esta es la forma más simple de levantar Datagentra sin instalar Python ni Node.js en tu máquina.

### Requisitos para Docker

- **Docker Desktop**: https://www.docker.com/products/docker-desktop/
- **Docker Compose** (incluido en Docker Desktop)

Verificá:
```bash
docker --version
docker compose version
```

### Setup inicial (solo la primera vez)

**1. Creá el archivo de configuración del backend:**

```bash
cp backend/.env.example backend/.env
```

Abrí `backend/.env` y completá tu configuración:

```env
# Si usás OpenAI:
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-tu-clave-aqui
OPENAI_MODEL=gpt-4o-mini

# Si usás Ollama local (ver nota al pie):
# LLM_PROVIDER=ollama
# OLLAMA_BASE_URL=http://host.docker.internal:11434
# OLLAMA_MODEL=qwen2.5:7b
```

**2. Creá el archivo de configuración del frontend:**

```bash
cp frontend/.env.example frontend/.env
```

El archivo ya tiene el valor correcto (`VITE_API_URL=http://localhost:8000`) — no necesitás cambiarlo.

### Levantar con Docker Compose

```bash
docker compose up --build
```

Docker va a:
1. Construir la imagen del backend (Python 3.12 + dependencias)
2. Construir la imagen del frontend (Node 20 + npm install)
3. Correr `db-init`: semillar la base de datos SQLite si no existe
4. Esperar a que el backend esté saludable (health check en `/health`)
5. Levantar el frontend cuando el backend esté listo

Una vez que veas los logs del frontend, abrí **http://localhost:5173**.

### Comandos útiles

```bash
# Levantar en background (modo detached)
docker compose up --build -d

# Ver logs en tiempo real
docker compose logs -f

# Ver logs de un servicio específico
docker compose logs -f backend
docker compose logs -f frontend

# Detener todos los servicios
docker compose down

# Detener y borrar volúmenes (bases de datos incluidas)
docker compose down -v

# Reconstruir solo el backend
docker compose build backend

# Ver estado de los contenedores
docker compose ps
```

### Servicios y puertos

| Servicio | Contenedor | Puerto | Descripción |
|---|---|---|---|
| `db-init` | `datagentra_db_init` | — | Corre una sola vez y semilla la DB |
| `backend` | `datagentra_backend` | `8000` | API FastAPI |
| `frontend` | `datagentra_frontend` | `5173` | App React |

### Ollama con Docker

Si usás Ollama instalado en tu máquina host (no en Docker), necesitás que escuche en todas las interfaces:

```bash
# Linux (systemd)
sudo systemctl edit ollama
# Agregar:
# [Service]
# Environment="OLLAMA_HOST=0.0.0.0"

sudo systemctl daemon-reload && sudo systemctl restart ollama
```

Luego en `backend/.env` usá:
```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

> `host.docker.internal` es el hostname especial de Docker para referirse a la máquina host desde dentro de un contenedor.

---

## Configuración inicial (wizard)

Al abrir la app por primera vez en el browser, un wizard guía la configuración del proveedor LLM:

### OpenAI
1. Seleccioná **OpenAI**
2. Ingresá tu API Key (`sk-...`)
3. Clic en **Validate key & list models** — valida la key contra la API real de OpenAI y lista los modelos disponibles en tu cuenta
4. Elegí el modelo y guardá

### Ollama (local)
1. Seleccioná **Ollama**
2. El wizard detecta automáticamente los modelos instalados en `localhost:11434`
3. Elegí el modelo y guardá

Una vez configurado, podés cambiar proveedor o modelo en cualquier momento desde el ícono ⚙️ en la barra lateral.

### Cambiar configuración (SettingsModal)
- Abrí con el ícono ⚙️ (esquina inferior izquierda del sidebar)
- Al abrir, la lista de modelos **se carga automáticamente** con la key ya guardada — no es necesario re-ingresarla
- Dejá el campo API Key **vacío** para mantener la key actual; completalo solo si querés cambiarla
- Seleccioná el modelo deseado y guardá

---

## Fuentes de datos

### Base de datos por defecto (e-commerce)

Al iniciar, Datagentra usa una base de datos SQLite de e-commerce con datos de muestra generados automáticamente. Incluye:
- **15 tablas**: productos, categorías, usuarios, órdenes, items, pagos, envíos, reviews, etc.
- **~500 usuarios**, **~3500 órdenes**, **~7000 items** con variedad temporal (2022–2024)
- Diseñada para queries analíticos complejos: agregaciones, JOINs múltiples, tendencias

### Subir tu propia fuente de datos

Hacé clic en el ícono de base de datos en el panel derecho o arrastrá un archivo:

**CSV** (`.csv`)
- El sistema infiere los tipos de columna automáticamente (INT, FLOAT, VARCHAR, DATE, BOOLEAN)
- Mostrá estadísticas: % de nulos, min/max, media, valores más frecuentes
- Preview de las primeras 10 filas
- Podés corregir el schema en lenguaje natural antes de confirmar:
  - `"renombrá la columna fecha_venta a date"`
  - `"eliminá la columna id_interno"`
  - `"convertí la columna precio a float"`

**SQLite** (`.db`, `.sqlite`)
- Sube tu propia base de datos SQLite y consultala directamente

Una vez confirmado el source, el agente usa esa tabla/base para responder tus preguntas.

---

## Conversaciones

Cada vez que hacés una pregunta, el backend guarda automáticamente:
- El mensaje del usuario
- La respuesta completa del agente (SQL, datos, resumen, configuración de gráfico)

Todo se persiste en `db/conversations.db` (SQLite local).

**Memoria contextual:** dentro de una misma conversación, el agente recuerda las últimas 6 preguntas y respuestas. Esto permite hacer preguntas de seguimiento sin repetir contexto:

```
Q: "¿Cuáles son los 10 productos más vendidos?"
A: (tabla con top 10 + gráfico de barras)

Q: "¿Y de esos, cuántos tienen rating mayor a 4?"
A: (el agente entiende que "esos" = los 10 de antes)
```

### Funciones desde la UI

| Acción | Cómo |
|---|---|
| Nueva conversación | Botón `+` en el sidebar o pantalla de bienvenida |
| Cambiar conversación | Clic en el nombre en el sidebar |
| Renombrar | Doble clic sobre el nombre, o ícono ✏️ |
| Eliminar | Ícono 🗑️ al hacer hover |
| Título automático | Se asigna automáticamente desde la primera pregunta |

---

## Variables de Entorno

### `backend/.env`

| Variable | Descripción | Default |
|---|---|---|
| `SQLITE_DB_PATH` | Path a la base de datos e-commerce | `../db/datagentra.db` |
| `CONVERSATIONS_DB_PATH` | Path al historial de conversaciones | `../db/conversations.db` |
| `LLM_PROVIDER` | Proveedor LLM (`openai` \| `ollama`) | `openai` |
| `OPENAI_API_KEY` | API Key de OpenAI | — |
| `OPENAI_MODEL` | Modelo OpenAI | `gpt-4o-mini` |
| `OLLAMA_BASE_URL` | URL del servidor Ollama | `http://localhost:11434` |
| `OLLAMA_MODEL` | Modelo Ollama | `qwen2.5:7b` |
| `MAX_UPLOAD_SIZE_MB` | Tamaño máximo de archivos | `50` |

### `frontend/.env`

| Variable | Descripción | Default |
|---|---|---|
| `VITE_API_URL` | URL del backend | `http://localhost:8000` |

---

## API Endpoints principales

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/health` | Health check (usado por Docker y setup) |
| `POST` | `/api/ask` | Pipeline completo: pregunta → SQL → datos → gráfico |
| `GET` | `/api/schema` | Esquema del source activo |
| `GET` | `/api/llm-info` | Proveedor y modelo actualmente configurado |
| `GET` | `/api/setup/status` | Estado de configuración del LLM |
| `POST` | `/api/setup` | Guardar proveedor/modelo/key en `.env` |
| `GET` | `/api/openai/models/current` | Listar modelos GPT usando la key ya guardada |
| `POST` | `/api/openai/models` | Validar nueva API key y listar modelos |
| `GET` | `/api/ollama/models` | Listar modelos Ollama disponibles |
| `POST` | `/api/upload` | Subir CSV o SQLite |
| `POST` | `/api/upload/fix` | Aplicar corrección en lenguaje natural al CSV |
| `POST` | `/api/upload/confirm` | Confirmar source subido como activo |
| `GET` | `/api/conversations` | Listar conversaciones |
| `GET` | `/api/conversations/{id}` | Obtener conversación con mensajes |
| `DELETE` | `/api/conversations/{id}` | Eliminar conversación |
| `PATCH` | `/api/conversations/{id}` | Renombrar conversación |

---

## Ejecutar Tests

```bash
cd backend
UV_PROJECT_ENVIRONMENT=.venv_local uv run pytest tests/ -v
```

> El `.venv` creado por Docker tiene permisos de root. Usar `UV_PROJECT_ENVIRONMENT=.venv_local` crea un venv local sin conflictos de permisos.

Para correr solo un subconjunto de tests:
```bash
# Tests unitarios únicamente (excluye tests de integración que requieren API keys reales)
UV_PROJECT_ENVIRONMENT=.venv_local uv run pytest tests/ -v -m "not integration"
```

---

## Estructura del Proyecto

```
Datagentra/
├── setup.sh                    # Wizard de configuración + launcher
├── docker-compose.yml          # Backend + frontend + db-init
├── db/
│   ├── seed_sqlite.py          # Crea datagentra.db con datos de muestra
│   ├── datagentra.db           # E-commerce: 15 tablas, ~500 users, ~3500 órdenes
│   └── conversations.db        # Historial de conversaciones (auto-creado)
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml          # Dependencias Python (uv)
│   ├── .env.example            # Template de configuración
│   └── app/
│       ├── __init__.py         # Carga .env al inicio
│       ├── main.py             # Endpoints FastAPI
│       ├── agent.py            # Pipeline Text-to-SQL (5 pasos)
│       ├── database.py         # Engines SQLite + DDL helpers + read-only enforcement
│       ├── conversations.py    # CRUD historial de conversaciones
│       ├── data_loader.py      # CSV/SQLite loader + correcciones NLP
│       └── llm_provider.py     # Factory Ollama/OpenAI
│   └── tests/                  # Suite de tests (pytest)
└── frontend/
    ├── Dockerfile
    ├── package.json            # Dependencias Node
    ├── .env.example            # Template de configuración
    ├── statics/
    │   ├── logo.png            # Logotipo (fondo transparente)
    │   └── datagentra.png      # Imagotipo logo + texto (fondo transparente)
    └── src/
        ├── App.tsx             # Layout: sidebar + chat + schema. Tema en localStorage
        ├── hooks/
        │   └── useDatagentra.ts    # Hook central: estado + llamadas a la API
        └── components/
            ├── ChatInterface.tsx       # Chat UI con mensajes, gráficos y SQL
            ├── SchemaExplorer.tsx      # Navegación visual del esquema activo
            ├── DataSourcePanel.tsx     # Upload + preview + corrección
            ├── SetupWizard.tsx         # Wizard de configuración de LLM
            ├── SettingsModal.tsx       # Modal de configuración post-setup
            └── charts/
                ├── DynamicChart.tsx         # Router de gráficos
                ├── BarChartComponent.tsx
                ├── LineChartComponent.tsx
                ├── PieChartComponent.tsx
                └── KPICard.tsx              # Métrica individual
```

---

## Modos de LLM

### OpenAI (recomendado para calidad)

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

Modelos recomendados por caso de uso:

| Modelo | Calidad SQL | Costo | Caso de uso |
|---|---|---|---|
| `gpt-4o` | ⭐⭐⭐⭐⭐ | Alto | Queries complejos, múltiples JOINs |
| `gpt-4o-mini` | ⭐⭐⭐⭐ | Bajo | Uso general, buen balance |
| `gpt-3.5-turbo` | ⭐⭐⭐ | Muy bajo | Queries simples |

### Ollama (local, sin costo, sin enviar datos)

```bash
# Instalar Ollama: https://ollama.com/download
ollama pull qwen2.5:7b    # ~4.7 GB — recomendado para SQL
ollama pull codellama:7b  # ~3.8 GB — alternativa
ollama pull llama3.2:3b   # ~2.0 GB — más liviano
```

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b
```

Modelos recomendados para Text-to-SQL con Ollama:

| Modelo | Tamaño | Calidad SQL | RAM mínima |
|---|---|---|---|
| `qwen2.5:7b` | ~4.7 GB | ⭐⭐⭐⭐ | 8 GB |
| `codellama:7b` | ~3.8 GB | ⭐⭐⭐⭐ | 8 GB |
| `llama3.2:3b` | ~2.0 GB | ⭐⭐⭐ | 4 GB |

---

## Identidad Visual

<p align="center">
  <img src="frontend/statics/logo.png" alt="Logo Datagentra" width="120"/>
</p>

El tema de color de la interfaz está basado en los colores del logo:

| Color | Hex | Uso |
|---|---|---|
| Azul marino profundo | `#0A436D` | Texto principal (tema claro), fondo de tarjetas (tema oscuro) |
| Teal vibrante | `#00768C` | Primario — botones, selecciones activas, anillos de foco |
| Verde brillante | `#00FF8C` | Acento — estados activos e interacciones destacadas |
| Fondo oscuro | `#05243C` | Fondo principal del tema oscuro |
| Fondo card oscuro | `#0D2F4F` | Cards en tema oscuro |

La preferencia de tema (claro/oscuro) se persiste automáticamente en `localStorage`.

---

## Solución de Problemas

| Problema | Solución |
|---|---|
| `model 'X' not found` | El `.env` no se cargó. Reiniciá el backend |
| `Connection refused` en Ollama | Ollama solo escucha en `127.0.0.1`. Ver sección Ollama con Docker |
| `Permission denied` en `.venv` | Usar `UV_PROJECT_ENVIRONMENT=.venv_local uv run ...` |
| `CORS error` en el browser | Verificar que `VITE_API_URL=http://localhost:8000` esté correcto |
| Modal no carga modelos | Verificar que el backend esté corriendo y la key esté guardada en `.env` |
| Docker: `db-init` falla | Revisá que `./db/seed_sqlite.py` exista y sea legible |
| Docker: frontend no conecta al backend | `VITE_API_URL` debe ser `http://localhost:8000` (acceso desde el browser del host) |
| Puerto 8000 o 5173 ocupado (local) | `setup.sh` los libera automáticamente; en Docker forzá `docker compose down` primero |
| CSV con columnas mal inferidas | Usá el campo de corrección en lenguaje natural antes de confirmar el source |

### Ver logs en local
```bash
tail -f backend.log   # logs del backend
tail -f frontend.log  # logs del frontend
```

### Verificar que el backend responde
```bash
curl http://localhost:8000/health
# Respuesta esperada: {"status":"ok"}
```

---

## Licencia

MIT

---

<p align="center">
  <img src="frontend/statics/logo.png" alt="Datagentra" width="60"/>
</p>
