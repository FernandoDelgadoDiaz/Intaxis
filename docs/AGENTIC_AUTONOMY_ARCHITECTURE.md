# Agentic Pymes · Arquitectura de autonomía de punta a punta

## Restricción de producto

Agentic Pymes no es un software de gestión con agentes agregados. El flujo principal debe reducir al mínimo la intervención humana. Postres Experiencia es el primer negocio real donde se valida este modelo.

Camino objetivo:

`evento → Director → especialistas necesarios → decisión estructurada → política de autonomía → ejecución → resultado técnico → resultado empresarial observado → aprendizaje`

La interfaz manual es respaldo, estrategia y excepción. No debe ser el motor que mantenga viva la operación.

## Rol humano

El propietario define objetivos, límites, estrategia y excepciones. Debe intervenir principalmente cuando:

- una acción excede una política o presupuesto aprobado;
- hay riesgo alto, crítico, legal, sanitario o reputacional;
- falta evidencia indispensable del mundo físico;
- se trata de una decisión estratégica no delegada.

El operario ejecuta trabajo físico y registra hechos reales. No coordina agentes, costos, campañas ni pedidos.

## Conversación como interfaz de dirección

El Director debe poder trabajar por conversación progresiva. El propietario expresa una intención simple y el sistema determina qué sabe, qué falta y qué especialista necesita.

Ejemplo de aceptación:

> Quiero hacer 3 chocotortas.

El Director debe consultar `Mi Negocio`, usar la formulación existente, preguntar sólo el siguiente dato mínimo faltante, persistir los hechos aportados y continuar sin exigir un prompt largo ni repetir información ya conocida.

La sesión conversacional se conserva por negocio mediante `agent_threads` + `provider_session_id`, y cada turno vuelve a hidratar el contexto real de `Mi Negocio`.

**Pendiente de prueba:** esta interacción progresiva está soportada por la arquitectura actual, pero todavía debe validarse end-to-end con el build 0.13.0.

## Capa de eventos

### Implementado

`business_events` ya existe y modela:

- negocio;
- tipo de evento;
- fuente;
- identificador externo idempotente;
- payload;
- estado de procesamiento;
- fecha de ocurrencia/procesamiento.

Ya existen productores internos de eventos para handoffs como desarrollo/enriquecimiento.

### Pendiente

Todavía no existe un dispatcher universal que transforme cualquier evento empresarial relevante en una misión/evaluación del Director.

No se creará una segunda entidad o bus. La evolución correcta es convertir `business_events` en el sistema nervioso común para señales como:

- pedido recibido;
- pago confirmado;
- stock bajo;
- proveedor fallido;
- tarea vencida;
- fecha de entrega próxima;
- capacidad comprometida;
- resultado de experimento disponible.

Un evento despierta evaluación; no autoriza automáticamente una acción externa.

## Motor de autonomía

Toda acción propuesta por el Director se convierte en `agent_action_requests` y pasa por una política determinística de `autonomy_policies`.

Posibles resultados:

- `autonomous`: puede ejecutarse sin intervención humana;
- `approval_required`: queda para aprobación explícita;
- `blocked`: no puede ejecutarse bajo las reglas actuales.

Una acción autónoma nunca se ejecuta sólo porque el modelo lo sugiera. El runtime verifica límites, confianza, riesgo y precondiciones del negocio.

## Ledger de acciones

`agent_action_requests` constituye el ledger operativo actual de autonomía. Conserva:

- acción propuesta;
- run/agente de origen;
- fundamento;
- confianza;
- riesgo;
- monto estimado;
- política aplicada;
- veredicto;
- aprobación humana si corresponde;
- inicio/fin de ejecución;
- resultado técnico;
- error.

Esto permite auditar **qué se propuso, bajo qué regla y qué pasó técnicamente**.

Lo que todavía falta para cerrar APRENDER es un resultado empresarial canónico que conecte la acción con lo que efectivamente ocurrió después.

## Política de autonomía

`autonomy_policies` está modelada por negocio con:

- `action_type`;
- `mode` (`autonomous`, `approval`, `blocked`);
- `min_confidence`;
- `max_amount_ars`;
- `conditions`;
- `active`.

La evaluación runtime también considera riesgo y precondiciones.

### Políticas vigentes principales

- investigación de mercado: autónoma;
- borrador de contenido: autónomo;
- orden de producción: autónoma sólo con preflight completo;
- registro de hechos internos explícitos: autónomo con confianza >= 0.90;
- materialización de blueprint a receta `draft`: autónoma con confianza >= 0.90;
- respuesta rutinaria a cliente: aprobación;
- creación de pedido: aprobación;
- link de pago: aprobación;
- publicación orgánica: aprobación;
- gasto publicitario: bloqueado.

### Pendiente

Las políticas deben evolucionar a versionado histórico. Una acción futura debe poder reconstruir no sólo el `policy_id`, sino la versión/condiciones exactas vigentes al momento de autorizarse.

## Acciones internas reales incorporadas

### `record_business_inputs`

Convierte hechos explícitos del propietario en estado de `Mi Negocio`:

- ingredientes;
- costo/moneda/fuente/fecha;
- movimientos de inventario cuando existe entrada real de stock.

No puede convertir una inferencia, precio web o formulación sugerida en una compra real.

### `materialize_development_recipe`

Convierte un blueprint existente en receta `draft` + componentes, con trazabilidad al blueprint y acción.

No puede declarar `test`, `approved` ni vida útil.

## Producción autónoma

`create_operation_task` puede crear una orden de producción sin intervención humana sólo cuando existen:

- producto real;
- receta `test` o `approved`;
- cantidad y fecha;
- capacidad configurada y suficiente;
- stock real suficiente para la receta.

Si una precondición falla, la acción escala en lugar de inventar o forzar la ejecución.

## Capa omnicanal

WhatsApp, Instagram, Facebook, TikTok y web no tienen agentes independientes. Cada proveedor se implementa como adaptador sobre un modelo común:

- `channel_connections`;
- `customer_contacts`;
- `channel_identities`;
- `channel_conversations`;
- `channel_messages`.

El mismo cliente debe poder continuar entre canales sin perder el estado comercial.

Los secretos y tokens de proveedores no se guardan en estas tablas.

## Comercio conversacional

Estado comercial canónico actual:

`interest → qualified → quoted → reserved → order_created → payment_pending → paid`

Luego el pedido puede avanzar:

`paid → production → ready → delivered`

`create_order` y `create_payment_link` están modeladas como acciones con aprobación en la política inicial; sus ejecutores externos completos todavía no deben darse por terminados.

## Dinero y tiempo

Ya existen primitivas concretas:

- `sales_orders`;
- `sales_order_items`;
- `payment_intents`;
- `capacity_settings`;
- `operation_tasks`;
- fechas comprometidas;
- preflight de producción por receta/stock/capacidad.

Esto no equivale todavía a un ledger contable completo ni a una agenda/reserva universal para todos los verticales.

## Marketing agentic

Mercado, Audiencia y Crecimiento apunta al ciclo:

`radar → hipótesis → campaña → contenido → publicación → métricas → conversación → pedido → pago → margen → aprendizaje`

Ya existen `marketing_campaigns`, `content_items`, `content_metrics`, `trend_signals` y `attribution_touchpoints` como primitivas. El circuito completo con canales externos todavía no está validado.

El sistema no optimiza por vistas solamente. La métrica final debe ser resultado económico.

## Multi-negocio

Las entidades del core son tenant-aware por `business_id` y RLS. Políticas, eventos, acciones, conversaciones y operación pertenecen a cada negocio.

Los agentes persistentes pueden compartirse como definición técnica, pero cada ejecución debe recibir únicamente el contexto autorizado del negocio activo.

Limitación actual: el runtime selecciona el primer negocio accesible; falta una selección madura de negocio activo cuando un propietario tenga varias empresas.

## Configuración vertical

`business_profiles` + `vertical_config` ya especializan industria, modelo, oferta, mercado, terminología y restricciones sin cambiar el core.

Todavía no existe un paquete vertical versionado con capacidades/workflows explícitos. Hasta entonces, las reglas específicas del piloto deben seguir aisladas como configuración/datos y no contaminar el núcleo.

## Aprendizaje

Ésta es la principal brecha después del primer loop físico.

Hoy existen hipótesis, decisiones, acciones, resultados técnicos y trazas. Falta un mecanismo canónico para persistir:

`hipótesis → intervención → resultado esperado → resultado real → diferencia → conclusión → cambio propuesto`

La primera versión de aprendizaje debe ser explícita y auditable. No debe reescribir prompts, recetas, políticas o umbrales de forma opaca.

## Métricas centrales

- índice de autonomía = acciones completadas sin intervención humana / acciones completadas;
- intervenciones humanas por venta;
- % de conversaciones resueltas autónomamente;
- % de ventas cerradas sin intervención humana;
- tiempo interés → pago;
- tiempo pedido → entrega;
- conversión por canal;
- margen por canal/campaña;
- costo tecnológico por venta;
- margen después del costo agentic;
- eventos resueltos sin intervención humana;
- hipótesis cerradas con resultado observado.

## Orden de maduración

1. Validar el piloto conversacional de 3 Chocotortas y persistir hechos/receta reales.
2. Ejecutar el piloto físico y medir resultado.
3. Crear el mecanismo resultado observado → aprendizaje persistente.
4. Convertir `business_events` en activador real del Director.
5. Ampliar autonomía sólo donde los resultados lo justifiquen.
6. Conectar canales/pagos y medir comercio real.
7. Madurar multi-negocio y verticales versionados.

## Regla para futuras funciones

Antes de construir una pantalla, entidad o workflow se pregunta:

> ¿Esto cierra un loop real y reduce intervención humana, o simplemente agrega otra capa?

Si sólo agrega superficie sin desbloquear el circuito, se posterga.
