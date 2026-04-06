# Improvements / ideas pendientes

Cosas que quiero hacer, en ningún orden particular. Algunas son fáciles, otras las dejo para cuando tenga más tiempo.

---

## Backend

- **PostgreSQL y MySQL** — ahora mismo todo asume SQLite. El engine ya es SQLAlchemy así que no debería ser tan difícil, pero hay que probar bien los DDL helpers y el readonly enforcement con otros dialectos.

- **Caché de sugerencias** — el endpoint `/api/suggest` hace una llamada al LLM cada vez que se abre la app. Con cachear el resultado por schema_hash durante N minutos ya se nota la diferencia.

- **Límite de filas configurable** — hay queries que devuelven miles de filas y el frontend se cuelga intentando renderizarlo todo. Quiero añadir un `MAX_ROWS` en el .env y que el agente lo meta en el prompt ("limit results to X rows unless the user asks for more").

- **Soporte Excel (.xlsx)** — el CSV loader funciona bien, añadir pandas `read_excel` no es mucho trabajo y viene bien para usuarios de negocio.

- **`/api/ask` no streaming** — ahora mismo está ahí pero básicamente es redundante con el streaming. Plantearse si eliminarlo o dejarlo como "modo compatibilidad".

- **CI GitHub Actions** — tengo los tests pero no hay workflow. Quiero al menos un `pytest` en PR + `ruff` para linting. No es urgente pero queda feo sin ello en un repo público.

- **Autenticación básica** — si alguien lo despliega en un servidor público, ahora mismo no hay nada que proteja la API. Un token en header o incluso HTTP Basic ya sería algo.

---

## Frontend

- **Tests con Vitest** — no hay ni un test de frontend. Lo mínimo sería cubrir `useDatagentra.ts` y el parsing del stream NDJSON.

- **Paginación en la tabla** — `TableComponent.tsx` renderiza todas las filas. Con 500+ filas es un problema. Añadir paginación simple (anterior/siguiente, N filas por página).

- **Zoom/fullscreen en charts** — a veces quiero ver el gráfico más grande sin exportarlo. Un modal fullscreen con el chart redimensionado sería útil.

- **Atajos de teclado** — `Ctrl+Enter` para enviar la pregunta ya funciona, pero me gustaría `Ctrl+K` para nueva conversación, `Ctrl+/` para abrir el schema explorer. Pequeño detalle pero lo uso mucho.

- **Editar pregunta** — una vez enviada no hay forma de editar y reenviar. Tener un botón de editar en el mensaje de usuario ahorraría tiempo.

- **Ordenar columnas en tabla** — click en cabecera para ordenar ascendente/descendente. Lo espera cualquiera que venga de Excel.

- **Resaltar SQL diferente por intento** — cuando hay retries, el SQL final es distinto al del primer intento. Estaría bien mostrarlo de alguna forma (badge "corregido" o algo).

---

## UX / diseño

- **Onboarding más corto** — el wizard está bien. Probar con un "quick start" de un solo paso y dejarlo todo por defecto (Ollama en local si está disponible, sino pedir la key de OpenAI).

- **Mobile** — no está roto pero tampoco está pensado para móvil. El layout sidebar+chat colapsa mal en pantallas pequeñas.

- **Mensajes de error más claros** — cuando el LLM no devuelve SQL válido o falla la conexión, el error que ve el usuario es técnico. Quiero mensajes en lenguaje normal.

- **Historial de conversaciones buscable** — si tienes 30+ conversaciones, encontrar una es incómodo. Un input de búsqueda encima de la lista del sidebar.

---

## Ideas más grandes (para cuando haya tiempo)

- **Múltiples datasources activos** — ahora solo hay uno activo a la vez. Podría ser interesante hacer JOINs entre un CSV subido y la DB por defecto.

- **Compartir conversación** — exportar como link o como HTML renderizado para compartir con alguien sin que tenga que montar la app.

- **Plugin VSCode** — básicamente el mismo frontend pero dentro del IDE. Para devs que quieren hacer queries sobre sus bases de desarrollo sin salir del editor.

- **Memoria a largo plazo** — ahora el contexto son las últimas 6 preguntas de la conversación. Algo tipo "recuerda que en esta DB los usuarios inactivos tienen status=0" que persista entre conversaciones.
