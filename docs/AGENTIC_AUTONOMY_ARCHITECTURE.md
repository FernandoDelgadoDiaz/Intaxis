# Agentic Pymes · Arquitectura de autonomía de punta a punta

## Restricción de producto

Agentic Pymes no es un software de gestión con agentes agregados. El flujo principal debe reducir al mínimo la intervención humana. Postres Experiencia es el primer negocio real donde se valida este modelo.

La interfaz manual es respaldo y excepción. El camino normal es:

`evento → Director → especialistas necesarios → decisión estructurada → política de autonomía → ejecución → resultado → medición → aprendizaje`

## Rol humano

El propietario define límites, estrategia y excepciones. Debe intervenir sólo cuando:

- una acción excede una política o presupuesto aprobado;
- hay riesgo alto, crítico, legal, sanitario o reputacional;
- falta evidencia indispensable;
- se trata de una decisión estratégica no delegada.

El operario ejecuta trabajo físico. No coordina agentes, costos, campañas ni pedidos.

## Motor de autonomía

Toda acción propuesta por el Director se convierte en `agent_action_requests` y pasa por una política determinística de `autonomy_policies`.

Posibles resultados:

- `autonomous`: puede ejecutarse sin intervención humana;
- `approval_required`: queda en una bandeja mínima de excepciones;
- `blocked`: no puede ejecutarse bajo las reglas actuales.

Una acción autónoma nunca se ejecuta sólo porque el modelo lo sugiera. El código verifica límites, confianza, riesgo y precondiciones del negocio.

### Primera acción autónoma real

`create_operation_task` puede crear una orden de producción sin intervención humana sólo cuando existen:

- producto real;
- receta test/approved;
- cantidad y fecha;
- capacidad configurada y suficiente;
- stock real suficiente para la receta.

Si una precondición falla, la acción escala en lugar de inventar o forzar la ejecución.

`create_content_draft` también puede crear borradores orgánicos sin efecto externo. Publicar sigue separado de crear el borrador.

## Capa omnicanal

WhatsApp, Instagram, Facebook, TikTok y web no tendrán agentes independientes. Cada proveedor se implementará como un adaptador sobre un modelo común:

- `channel_connections`
- `customer_contacts`
- `channel_identities`
- `channel_conversations`
- `channel_messages`

El mismo cliente puede comenzar en un canal y continuar en otro sin perder su historial comercial.

Los secretos y tokens de proveedores no se almacenan en estas tablas. Se gestionarán mediante secretos seguros del runtime/proveedor.

## Comercio conversacional

El estado comercial canónico es:

`interest → qualified → quoted → reserved → order_created → payment_pending → paid`

Luego el pedido avanza:

`paid → production → ready → delivered`

El especialista Ventas y Clientes deberá poder, dentro de políticas autorizadas:

1. detectar intención;
2. responder preguntas rutinarias;
3. consultar catálogo, precio, capacidad y stock;
4. acordar cantidad, fecha y modalidad;
5. crear pedido;
6. generar medio de pago;
7. verificar pago por webhook;
8. disparar producción y entrega;
9. ejecutar seguimiento y recompra.

## Marketing agentic

Mercado, Audiencia y Crecimiento opera el ciclo:

`radar → hipótesis → campaña → contenido → publicación → métricas → conversación → pedido → pago → margen → aprendizaje`

Cada pieza se vincula con campaña, hipótesis, canal y resultado. `content_metrics` registra atención y `attribution_touchpoints` conecta esa atención con conversaciones, pedidos y ventas.

El sistema no optimiza por vistas solamente. La métrica final es resultado económico.

## Radar de tendencias

`trend_signals` mantiene señales en tres horizontes:

- `now`: aplicable ahora;
- `next`: creciendo y merece experimento;
- `radar`: señal temprana internacional o de competencia.

Fuentes previstas: competencia local, Argentina, Latinoamérica y mercados internacionales relevantes. Una tendencia no se copia: se convierte en una hipótesis y se valida contra conversión, capacidad y margen propios.

## Políticas iniciales

Las políticas comienzan conservadoras y se amplían con evidencia:

- investigación de mercado: autónoma;
- borradores de contenido: autónomos;
- orden de producción: autónoma sólo con preflight operativo completo;
- respuesta rutinaria al cliente: requiere aprobación hasta validar playbook y conectores;
- creación de pedido: requiere aprobación inicialmente;
- link de pago: requiere aprobación inicialmente;
- publicación orgánica: requiere aprobación inicialmente;
- gasto publicitario: bloqueado hasta que exista presupuesto explícito.

La meta no es mantener estas restricciones para siempre. La meta es ampliar autonomía donde los datos demuestren que es seguro y rentable.

## Métricas centrales

- índice de autonomía = acciones completadas sin intervención humana / acciones completadas;
- intervenciones humanas por venta;
- % de conversaciones resueltas autónomamente;
- % de ventas cerradas sin intervención humana;
- tiempo interés → pago;
- conversión por canal;
- margen por canal;
- margen por publicación/campaña;
- costo tecnológico por venta;
- margen después del costo agentic.

## Orden de conectores

1. WhatsApp Business: canal transaccional inicial.
2. Instagram: descubrimiento, mensajes, comentarios, contenido y métricas.
3. Facebook/Messenger: misma capa Meta, adquisición y conversación.
4. TikTok: descubrimiento, contenido, métricas y las capacidades oficiales de mensajería que estén disponibles para la cuenta/app.
5. Proveedor de pagos: creación y verificación de cobro.

No se usará scraping frágil como sustituto permanente de APIs oficiales.

## Regla para futuras funciones

Antes de construir una pantalla o flujo se pregunta:

> ¿Esto reduce intervención humana o simplemente transfiere otra tarea al propietario?

Si la respuesta es lo segundo, no pertenece al camino principal del producto.
