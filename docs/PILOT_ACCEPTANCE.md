# Agentic Pymes · Aceptación del primer loop real

**Fecha:** 23/09/2026  
**Piloto:** Postres Experiencia  
**Producto:** Chocotorta en lata transparente  
**Objetivo:** medir el primer circuito real sin agregar nuevas capas de producto.

## Regla de prueba

La prueba comienza únicamente con:

> Quiero hacer 3 chocotortas.

No se usa un prompt estructurado ni se prepara manualmente el contexto para ayudar al sistema. El Director debe consultar `Mi Negocio`, reutilizar lo que ya sabe, pedir sólo el siguiente hecho físico que falte, hacer cálculos internamente y persistir los hechos reales cuando exista una acción segura para hacerlo.

La aceptación no se decide por si la respuesta “suena bien”. Se decide por evidencia persistente antes/después.

## Estado verificado antes de la prueba

Consulta directa a Supabase producción el 23/09/2026:

- productos: **3**;
- ingredientes: **0**;
- recetas: **0**;
- componentes de receta: **0**;
- movimientos de inventario: **0**;
- acciones `record_business_inputs`: **0**;
- acciones `materialize_development_recipe`: **0**.

Producto objetivo verificado:

- `product_id`: `4d71037b-1854-4b33-97c6-5292b627563a`;
- nombre: `Chocotorta en lata transparente`;
- estado: `draft`;
- porción: `250 g`;
- `blueprint_id`: `21cfb607-3f81-40c1-b097-a41e68a912c4`;
- rendimiento del blueprint: `6`;
- aprobación del blueprint: `review`;
- desarrollo: `needs_data`.

La migración 0018 también fue verificada en producción: `inventory_movements.source_action_request_id`, `recipes.source_action_request_id` y `recipes.source_blueprint_id` existen.

Políticas relevantes verificadas:

- `record_business_inputs` → `autonomous`, confianza mínima 0.90, sólo hecho explícito del propietario, sin efecto externo;
- `materialize_development_recipe` → `autonomous`, confianza mínima 0.90, blueprint existente, sólo `draft`, sin efecto externo;
- `create_operation_task` → `autonomous` sólo con receta + stock + capacidad;
- `create_order`, `create_payment_link` y `publish_content` → requieren aprobación;
- `paid_ad_spend` → bloqueada, monto máximo 0.

## Instrumentación agregada

### `scripts/pilot-observability.mjs`

Genera un snapshot de sólo lectura con:

- negocio y producto objetivo;
- conteos de productos, ingredientes, recetas, componentes, inventario, acciones, runs, especialistas y uso de IA;
- receta de Chocotorta y trazabilidad al blueprint;
- acciones `record_business_inputs` y `materialize_development_recipe`;
- `agent_runs` relacionados con el piloto;
- especialistas usados;
- `ai_usage_events` y costo tecnológico estimado;
- thread activo;
- políticas de autonomía.

No modifica Supabase.

Autenticación soportada:

1. preferida para prueba manual: `SUPABASE_PUBLISHABLE_KEY` + `SUPABASE_ACCESS_TOKEN` del usuario autenticado, respetando RLS;
2. alternativamente `SUPABASE_SERVICE_ROLE_KEY` en un entorno seguro y efímero.

Nunca se deben guardar tokens o claves en el repositorio.

Ejemplo:

```bash
node scripts/pilot-observability.mjs --out=before.json
```

Después de la interacción:

```bash
node scripts/pilot-observability.mjs --out=after.json
```

### `scripts/check-pilot-acceptance.mjs`

Compara `before.json` y `after.json` y evalúa el piloto por etapas.

#### Etapa 1 · conversación

Debe existir un nuevo `agent_run` completado originado por la intención “Quiero hacer 3 chocotortas”, continuar con un único thread activo y no dejar acciones relevantes fallidas/bloqueadas.

#### Etapa 2 · receta

Debe aparecer una receta `draft` trazada al blueprint real de Chocotorta y contener al menos los cinco componentes previstos. Materializar no equivale a aprobar comercialmente la receta.

#### Etapa 3 · hechos físicos

Después de que el propietario responda preguntas del Director con compras, precios o stock reales, debe existir al menos una acción `record_business_inputs` completada. Si el hecho declara ingreso físico de stock (`quantity_added > 0`), debe existir un movimiento de inventario.

#### Etapa 4 · trazabilidad/costo

El run debe dejar `ai_usage_events`. Cuando el proveedor entregue uso disponible, debe existir costo estimado. La cantidad de especialistas se reporta para detectar sobre-orquestación; más de tres especialistas en el run se marca como advertencia, no como fallo automático.

Ejemplos:

```bash
node scripts/check-pilot-acceptance.mjs --before=before.json --after=after.json --require=conversation
node scripts/check-pilot-acceptance.mjs --before=before.json --after=after.json --require=recipe
node scripts/check-pilot-acceptance.mjs --before=before.json --after=after.json --require=facts
node scripts/check-pilot-acceptance.mjs --before=before.json --after=after.json --require=full
```

El checker incluye un self-test sintético para CI:

```bash
node scripts/check-pilot-acceptance.mjs --self-test
```

## Verificación de producción

Antes de ejecutar el piloto real debe verificarse que producción responde el build esperado, no sólo que `main` contiene ese código.

El endpoint existente es:

```text
GET /api/estado
```

El script nuevo:

```bash
node scripts/verify-production-build.mjs
```

espera actualmente:

```text
0.13.0-agentic-fact-ingestion
```

También comprueba que la API se declare disponible y con persistencia Supabase.

No se agrega esta llamada de red al `npm run check` para evitar que CI dependa de disponibilidad externa. Es una verificación manual obligatoria inmediatamente antes de la prueba real.

## Qué no mide automáticamente

Hay conductas que requieren observar la conversación:

- si el Director pregunta realmente un dato mínimo o entrega un informe innecesario;
- si pide al propietario hacer cálculos;
- si repite un dato ya persistido;
- si llama especialistas que no cambian materialmente la decisión.

El snapshot permite medir runs, especialistas y costo, pero la naturalidad de la interacción sigue siendo un criterio humano del test.

## Criterio de fallo agentic

El piloto falla aunque el texto del Director sea correcto si ocurre cualquiera de estos casos:

- el propietario debe reingresar manualmente en otra pantalla un hecho que ya dijo en conversación;
- el sistema calcula en texto pero no deja persistencia cuando corresponde;
- una receta aparece “aprobada” sin validación física/calidad;
- un hecho inferido o un precio web se convierte en compra/stock real;
- una acción externa ocurre sin la política/autorización correspondiente;
- el sistema pierde continuidad y vuelve a preguntar datos que ya tiene.

## Criterio de éxito de esta preparación

Esta rama no intenta cerrar el loop por sí sola. Su objetivo es que, cuando el piloto se ejecute, podamos responder con evidencia:

1. qué existía antes;
2. qué creó o cambió el Director;
3. qué especialistas usó;
4. cuánto costó tecnológicamente;
5. qué quedó persistido;
6. qué etapa del loop pasó o falló.

La prioridad de producto permanece sin cambios: primero cerrar y medir el loop real; después decidir la siguiente implementación.