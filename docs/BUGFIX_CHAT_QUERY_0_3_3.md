# Bugfix 0.3.3 · Director chat transport

Fecha: 22/09/2026

## Síntoma

El Director mostraba correctamente la misión escrita por el usuario, pero el backend respondía `Escribí una misión para el Director.` y no se creaban filas en `agent_runs`.

## Diagnóstico

El build `0.3.2-chat-query` estaba efectivamente desplegado. La query de respaldo podía llegar, pero el middleware dependía de `req.path === '/api/chat'`. Netlify puede reescribir la ruta antes de que Express la evalúe, por lo que esa condición podía impedir reconstruir el body.

## Corrección

El middleware ya no depende de `req.path`. Para cualquier POST que incluya `?mensaje=` y llegue con body vacío, reconstruye `req.body = { mensaje }`.

## Verificación

El endpoint `/api/estado` debe informar `0.3.3-chat-query-direct`. Después, una misión válida debe crear al menos una fila en `agent_runs` antes de cualquier llamada a OpenAI.
