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
- Cada especialista posee nombre, misión, límites, criterio de activación, herramientas permitidas, salida JSON estructurada y `agent_id` persistente cuando el runtime lo inicializa.
- Especialistas implementados:
  1. Mercado, Audiencia y Crecimiento.
  2. Producto y Experiencia.
  3. Caja y Rentabilidad.
  4. Ventas y Clientes.
  5. Producción y Abastecimiento.
  6. Calidad y Cumplimiento.
  7. Información y Decisiones.
- El Director trabaja en dos etapas: **PLAN** y **SÍNTESIS**.
- Máximo de tres especialistas ejecutándose en paralelo.
- `specialist_runs` registra cada participación con agente, sesión, tarea, resultado, estado, error y timestamps.
- `agent_runs` conserva el plan de delegación y cantidad de especialistas activados.
- Un especialista que falla queda registrado como fallido; no se simula su aporte.
- Endpoint autenticado `/api/team` para inspeccionar la composición lógica del equipo sin exponer IDs internos del proveedor.
- Definición canónica detallada en `docs/AGENT_TEAM.md`.

## Supabase · estado real

Proyecto reutilizado exclusivamente para Agentic Pymes:

- antiguo nombre: `Intaxis`;
- project ref: `fubpzfpystsxmgpqjjol`;
- estado verificado el 21/09/2026: `ACTIVE_HEALTHY`;
- no se modificó NoVen, Barberos ni ningún otro proyecto.

Reconversión ejecutada:

1. `reset_intaxis_for_agentic_pymes` — elimina el esquema público heredado de taxis y sus políticas de Storage.
2. `clear_intaxis_auth_users` — elimina los tres usuarios heredados de Intaxis.
3. `agentic_pymes_0001_mi_negocio` — crea el núcleo empresarial.
4. `agentic_pymes_0002_real_specialist_agents` — agrega trazabilidad de especialistas.
5. `agentic_pymes_0003_agent_run_orchestration` — agrega plan de delegación y contador de especialistas.
6. `agentic_pymes_0004_fk_indexes` — agrega índices compuestos recomendados por Supabase Advisor.

Validación posterior:

- 12 tablas públicas;
- RLS habilitado en 12/12;
- 12 políticas públicas;
- 0 políticas heredadas en Storage;
- 0 usuarios heredados;
- 2 buckets y 7 objetos físicos antiguos continúan en Storage, sin políticas de acceso. Supabase bloquea su borrado SQL y exige usar Storage API; quedan como limpieza física pendiente.

El aviso de seguridad de Supabase sobre exposición GraphQL a usuarios autenticados es esperado: las tablas están otorgadas a `authenticated` pero cada fila está protegida por RLS. No existe acceso para `anon` según el esquema aplicado.

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

## Estado real de validación end-to-end

La base Supabase ya está preparada, pero **el equipo todavía no se declara operativo en producción** hasta completar:

1. configurar en Netlify `OPENAI_API_KEY`, `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`;
2. iniciar sesión por Magic Link y crear `Postres Experiencia` como primer `business`;
3. ejecutar una misión real y comprobar que el Director activa al menos dos especialistas;
4. verificar en `specialist_runs` que cada participación tenga `openai_agent_id`, `openai_session_id`, tarea y resultado real;
5. comprobar que la síntesis final mencione exclusivamente a los especialistas realmente ejecutados.

Según la regla de producto, recién después de esa prueba end-to-end diremos que el equipo agentic está operativo.

## Riesgo heredado conocido

El historial Git de Intaxis tuvo un secreto Mapbox expuesto. Borrar los archivos actuales no borra el historial. Ese secreto no debe reutilizarse y debe permanecer revocado.

## Próximo corte

1. Configurar variables de entorno de Netlify.
2. Verificar autenticación + RLS end-to-end.
3. Crear Postres Experiencia como negocio piloto.
4. Ejecutar y auditar la primera misión multiagente real.
5. Completar recetas editables desde UI.
6. Calcular costo real por receta y margen por producto.
7. Completar el primer circuito: producto → receta → costo → stock → capacidad → análisis multiagente → decisión.
8. Después: Radar de Mercado y campañas con hipótesis/resultado.
