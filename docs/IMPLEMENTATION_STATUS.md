# Estado de implementación · 21/09/2026

## Decisión de producto

- El producto se llama **Agentic Pymes**.
- **Postres Experiencia** queda como primer negocio piloto real.
- El objetivo es construir un sistema operativo empresarial agentic reutilizable por otras PyMEs.
- El usuario no gestiona una colección de agentes: el Director coordina especialistas detrás de la interfaz.

## Construido en el núcleo 0.2

- Estructura de aplicación Agentic Pymes.
- Adaptador Express → Netlify Functions.
- Configuración Netlify (`netlify.toml`).
- Autenticación por Magic Link de Supabase.
- RLS en todas las tablas públicas del núcleo.
- `Mi Negocio` con productos, insumos, recetas, movimientos de stock, capacidad, decisiones e hipótesis.
- Persistencia de conversaciones del Director mediante `agent_threads` y `agent_runs`.
- Concurrencia protegida: un solo run del Director activo por negocio.
- Contexto estructurado de `Mi Negocio` inyectado antes de cada misión.
- Interfaz inicial con dos superficies: Director y Mi Negocio.
- Alta de productos e insumos desde la interfaz.
- Exportación básica de informe a Excel y PowerPoint.

## Construido en el núcleo 0.3 · equipo agentic real

- Ocho configuraciones persistentes de OpenAI Agents: **1 Director + 7 especialistas**.
- Los siete especialistas dejaron de ser sólo roles descriptos dentro del prompt del Director.
- Cada especialista posee:
  - nombre e identidad propia;
  - misión y límites propios;
  - criterio de activación;
  - herramientas permitidas;
  - salida JSON estructurada común;
  - `agent_id` persistente de OpenAI.
- Especialistas implementados:
  1. Mercado, Audiencia y Crecimiento.
  2. Producto y Experiencia.
  3. Caja y Rentabilidad.
  4. Ventas y Clientes.
  5. Producción y Abastecimiento.
  6. Calidad y Cumplimiento.
  7. Información y Decisiones.
- El Director trabaja en dos etapas reales:
  1. **PLAN:** elige qué especialistas pueden cambiar materialmente la decisión y asigna una tarea concreta a cada uno.
  2. **SÍNTESIS:** recibe los resultados reales y produce la decisión final.
- Máximo de tres especialistas ejecutándose en paralelo.
- Nueva tabla `specialist_runs` para registrar cada participación con agente, sesión, tarea, resultado, estado, error y timestamps.
- `agent_runs` conserva el plan de delegación y cantidad de especialistas activados.
- Un especialista que falla queda registrado como fallido y el Director recibe explícitamente esa carencia de evidencia; no se simula su aporte.
- Endpoint autenticado `/api/team` para inspeccionar la composición lógica del equipo sin exponer IDs internos del proveedor.
- Definición canónica detallada en `docs/AGENT_TEAM.md`.

## Contrato de salida de especialistas

Todos los especialistas responden con:

- `summary`;
- `findings[]`;
- `evidence[]` con claim, source, source_type y date;
- `risks[]`;
- `recommendation`;
- `data_gaps[]`;
- `confidence`;
- `authorization_required`.

Esto permite trazabilidad, comparación y futuras evaluaciones de desempeño por especialidad.

## Infraestructura asignada

- GitHub: repositorio histórico `FernandoDelgadoDiaz/Intaxis`, cuyo árbol funcional actual fue reemplazado por Agentic Pymes.
- Supabase: proyecto histórico Intaxis `fubpzfpystsxmgpqjjol`, actualmente INACTIVE; el intento de restauración mediante la API devolvió `Project not found`, por lo que **las migraciones 0001/0002/0003 todavía no están aplicadas allí**.
- Netlify: configuración de despliegue incluida; la vinculación/renombre del sitio debe verificarse por separado.

## Estado real de validación

El equipo de ocho agentes está implementado en código, pero **todavía no se considera operativo en producción** hasta:

1. disponer de un Supabase activo para Agentic Pymes;
2. aplicar `0001_mi_negocio.sql`, `0002_real_specialist_agents.sql` y `0003_agent_run_orchestration.sql`;
3. configurar `OPENAI_API_KEY`, `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` en Netlify;
4. ejecutar una misión real y comprobar que el Director activa al menos dos especialistas;
5. verificar en `specialist_runs` que cada participación tenga `openai_agent_id`, `openai_session_id`, tarea y resultado real;
6. comprobar que la síntesis final mencione exclusivamente a los especialistas realmente ejecutados.

Según la regla de producto, recién después de esa prueba end-to-end diremos que el equipo agentic está operativo.

## Riesgo heredado conocido

El historial Git de Intaxis tuvo un secreto Mapbox expuesto. Borrar los archivos actuales no borra el historial. Ese secreto no debe reutilizarse y debe permanecer revocado.

## Próximo corte recomendado

1. Resolver infraestructura Supabase dedicada para Agentic Pymes sin tocar NoVen ni Barberos.
2. Aplicar las tres migraciones actuales.
3. Verificar autenticación + RLS end-to-end.
4. Ejecutar y auditar la primera misión multiagente real.
5. Completar recetas editables desde UI.
6. Costo calculado por receta y margen por producto.
7. Completar el primer circuito real verificable: producto → receta → costo → stock → capacidad → análisis multiagente → decisión.
8. Después: Radar de Mercado y campañas con hipótesis/resultado.
