# Improvements / ideas pendientes

Cosas que quiero hacer, en ningun orden particular. Algunas son faciles, otras las dejo para cuando tenga mas tiempo.

---

## Backend

- **Cache de sugerencias** — el endpoint `/api/suggest` hace una llamada al LLM cada vez que se abre la app. Con cachear el resultado por schema_hash durante N minutos ya se nota la diferencia.

- **Limite de filas configurable** — hay queries que devuelven miles de filas y el frontend se cuelga intentando renderizarlo todo. Quiero anadir un `MAX_ROWS` en el .env y que el agente lo meta en el prompt ("limit results to X rows unless the user asks for more").

- **`/api/ask` no streaming** — ahora mismo esta ahi pero basicamente es redundante con el streaming. Plantearse si eliminarlo o dejarlo como "modo compatibilidad".

- **CI GitHub Actions** — tengo los tests pero no hay workflow. Quiero al menos un `pytest` en PR + `ruff` para linting. No es urgente pero queda feo sin ello en un repo publico.

- **Autenticacion basica** — si alguien lo despliega en un servidor publico, ahora mismo no hay nada que proteja la API. Un token en header o incluso HTTP Basic ya seria algo.

- **Persistir conexiones externas** — las conexiones PostgreSQL/MySQL se pierden al reiniciar el backend. Guardarlas en conversations.db o en un fichero aparte para que sobrevivan reinicios.

---

## Frontend

- **Tests con Vitest** — no hay ni un test de frontend. Lo minimo seria cubrir `useDatagentra.ts` y el parsing del stream NDJSON.

- **Paginacion en la tabla** — `TableComponent.tsx` renderiza todas las filas. Con 500+ filas es un problema. Anadir paginacion simple (anterior/siguiente, N filas por pagina).

- **Zoom/fullscreen en charts** — a veces quiero ver el grafico mas grande sin exportarlo. Un modal fullscreen con el chart redimensionado seria util.

- **Atajos de teclado** — `Ctrl+Enter` para enviar la pregunta ya funciona, pero me gustaria `Ctrl+K` para nueva conversacion, `Ctrl+/` para abrir el schema explorer. Pequeno detalle pero lo uso mucho.

- **Editar pregunta** — una vez enviada no hay forma de editar y reenviar. Tener un boton de editar en el mensaje de usuario ahorraria tiempo.

- **Ordenar columnas en tabla** — click en cabecera para ordenar ascendente/descendente. Lo espera cualquiera que venga de Excel.

- **Resaltar SQL diferente por intento** — cuando hay retries, el SQL final es distinto al del primer intento. Estaria bien mostrarlo de alguna forma (badge "corregido" o algo).

- **Limpiar componentes deprecated** — `DatabaseConnectModal.tsx` y `DataSourcePanel.tsx` ya no se usan. Eliminarlos del arbol.

---

## UX / diseno

- **Onboarding mas corto** — el wizard esta bien. Probar con un "quick start" de un solo paso y dejarlo todo por defecto (Ollama en local si esta disponible, sino pedir la key de OpenAI).

- **Mobile** — no esta roto pero tampoco esta pensado para movil. El layout sidebar+chat colapsa mal en pantallas pequenas.

- **Mensajes de error mas claros** — cuando el LLM no devuelve SQL valido o falla la conexion, el error que ve el usuario es tecnico. Quiero mensajes en lenguaje normal.

- **Historial de conversaciones buscable** — si tienes 30+ conversaciones, encontrar una es incomodo. Un input de busqueda encima de la lista del sidebar.

---

## Ideas mas grandes (para cuando haya tiempo)

- **Multiples datasources activos** — ahora solo hay uno activo a la vez. Podria ser interesante hacer JOINs entre un CSV subido y la DB por defecto.

- **Compartir conversacion** — exportar como link o como HTML renderizado para compartir con alguien sin que tenga que montar la app.

- **Plugin VSCode** — basicamente el mismo frontend pero dentro del IDE. Para devs que quieren hacer queries sobre sus bases de desarrollo sin salir del editor.

- **Memoria a largo plazo** — ahora el contexto son las ultimas 6 preguntas de la conversacion. Algo tipo "recuerda que en esta DB los usuarios inactivos tienen status=0" que persista entre conversaciones.
