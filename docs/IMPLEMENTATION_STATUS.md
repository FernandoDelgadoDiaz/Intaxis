# Agentic Pymes · Estado real de implementación

**Fecha de corte:** 23/09/2026  
**Build en `main`:** `0.13.1-ios-auth-abort`  
**Repositorio:** `FernandoDelgadoDiaz/Intaxis`  
**Producción:** `https://agenticpymes.netlify.app`  
**Supabase:** `fubpzfpystsxmgpqjjol`

Este documento es la **verdad operativa** de qué existe realmente, qué fue verificado, qué está bloqueado y qué todavía no debe darse por terminado. `PRODUCT_VISION.md` define hacia dónde vamos; este archivo define dónde estamos.

---

## 1. Estado ejecutivo

Agentic Pymes ya no es sólo una colección de prompts o pantallas. Hoy existen piezas reales del sistema operativo agentic:

- `Mi Negocio` como memoria estructurada;
- 1 Director + 7 especialistas persistentes;
- planificación y síntesis multiagente con trazabilidad;
- modelo reliability-first por función;
- Descubrimiento con evidencia externa y selección;
- desarrollo técnico automático de ofertas seleccionadas;
- enriquecimiento visual/humano con reanudación por etapas;
- promoción inmediata de oportunidades a ofertas en desarrollo;
- capa de eventos (`business_events`);
- ledger de acciones (`agent_action_requests`);
- políticas determinísticas de autonomía (`autonomy_policies`);
- primitivas de pedidos, pagos, canales, marketing, capacidad y tareas;
- persistencia de hechos reales aportados por el propietario;
- materialización de blueprints como recetas `draft`;
- filtro permanente de visión agentic incorporado al Director;
- instrumentación read-only del piloto con snapshots antes/después, aceptación por etapas y medición de costo/especialistas;
- verificación automática post-merge de que Netlify producción sirve el mismo `BUILD_VERSION` que `main`.

Lo que **todavía no está demostrado de punta a punta** es que todas estas piezas operen juntas de forma natural sobre un negocio físico real sin trabajo manual innecesario del propietario.

La prioridad actual es cerrar ese primer loop con **3 Chocotortas**.

---

## 2. Regla de producto vigente

Toda decisión nueva pasa por el filtro de `PRODUCT_VISION.md`:

- reducir coordinación/cálculo/seguimiento manual del propietario;
- cerrar un loop real antes de agregar otra capa;
- dejar estado o evidencia persistente;
- mantener el núcleo genérico;
- producir progreso verificable.

No se construyen nuevas superficies sólo porque sean técnicamente posibles.

---

## 3. Equipo agentic real

Existen 8 agentes persistentes:

1. Director Agentic Pymes.
2. Mercado, Audiencia y Crecimiento.
3. Producto y Experiencia.
4. Caja y Rentabilidad.
5. Ventas y Clientes.
6. Producción y Abastecimiento.
7. Calidad y Cumplimiento.
8. Información y Decisiones.

### Routing vigente de modelos

Política: `reliability-first-v1`.

- Director → `gpt-5.6-sol`, reasoning `high`.
- Mercado → `gpt-5.6-sol`, `high`.
- Producto → `gpt-5.6-sol`, `high`.
- Caja → `gpt-5.6-sol`, `high`.
- Calidad → `gpt-5.6-sol`, `high`.
- Información → `gpt-5.6-sol`, `high`.
- Producción → `gpt-5.6-terra`, `high`.
- Ventas → `gpt-5.6-terra`, `medium`.

Luna no participa actualmente como agente que emite decisiones materiales. El ahorro tecnológico se busca evitando llamadas/especialistas innecesarios, no degradando decisiones relevantes.

### Orquestación

El Director opera en dos fases:

- `PLAN`: elige sólo especialistas cuyo aporte puede cambiar la decisión;
- `SÍNTESIS`: integra únicamente resultados realmente ejecutados.

Los especialistas tienen salida JSON estructurada y cada participación queda trazada en `specialist_runs`.

---

## 4. Conversación del Director

### Construido

- Existe un `agent_thread` activo por negocio.
- Se conserva `provider_session_id`, por lo que la conversación puede continuar entre turnos.
- Antes de cada misión se vuelve a cargar el estado estructurado de `Mi Negocio`.
- El Director recibe contexto reciente de misiones completadas de forma acotada.
- Para pilotos se le exige usar formulaciones ya existentes, hacer cálculos y pedir sólo hechos faltantes.
- Los hechos reales nuevos pueden convertirse en acciones internas persistentes.

### Comportamiento esperado

El propietario debe poder comenzar con una frase mínima:

> Quiero hacer 3 chocotortas.

El Director debería responder progresivamente, por ejemplo identificando la formulación existente, preguntando qué insumos hay, luego qué precios se pagaron, guardando cada hecho y continuando hasta tener suficiente información.

### Pendiente de validación

La experiencia conversacional natural todavía **no fue probada end-to-end con el build 0.13.1**. Cada turno actualmente ejecuta planificación + especialistas necesarios + síntesis; hay que comprobar que el Director no convierta preguntas simples en informes innecesarios ni active especialistas caros sin necesidad.

La prueba correcta no será un prompt grande preparado. Será empezar sólo con:

> `Quiero hacer 3 chocotortas.`

---

## 5. Mi Negocio y persistencia operativa

El núcleo ya modela:

- negocios;
- productos;
- ingredientes;
- recetas y componentes;
- movimientos de inventario;
- capacidad;
- decisiones;
- hipótesis;
- conversaciones del Director;
- acciones y políticas;
- pedidos y pagos;
- clientes/canales;
- marketing/contenido/atribución;
- señales de tendencias;
- tareas operativas.

### Ingreso agentic de hechos reales · PR #37

Se agregaron dos acciones internas:

#### `record_business_inputs`

Puede convertir hechos explícitos del propietario en:

- `ingredients`;
- costo unitario/moneda/fuente/fecha;
- `inventory_movements` cuando realmente ingresó stock.

Tiene trazabilidad por `source_action_request_id` e idempotencia para evitar duplicados de una misma acción.

Política actual:

- modo `autonomous`;
- confianza mínima `0.90`;
- sólo hechos explícitos del propietario;
- sin efecto externo.

#### `materialize_development_recipe`

Convierte un blueprint real ya existente en:

- `recipes` con estado `draft`;
- `recipe_items` ligados a ingredientes;
- trazabilidad al blueprint y a la acción.

Nunca convierte automáticamente una receta en `test` o `approved`.

Política actual:

- modo `autonomous`;
- confianza mínima `0.90`;
- requiere blueprint real;
- sólo `draft`;
- sin efecto externo.

### Migración

`0018_agentic_fact_ingestion.sql` fue aplicada en Supabase producción y se verificaron las columnas/políticas correspondientes.

---

## 6. Eventos, acciones y autonomía

### Eventos

Existe `business_events` con:

- `business_id`;
- `event_type`;
- `source`;
- `external_id` para idempotencia;
- `payload`;
- estado de procesamiento;
- timestamps.

Ya se generan eventos internos, por ejemplo en handoffs de desarrollo/enriquecimiento.

**Pendiente:** todavía no existe un dispatcher universal donde cualquier evento relevante (`order.received`, `stock.low`, `payment.paid`, `delivery.overdue`, etc.) despierte automáticamente al Director. La capa existe; la activación empresarial general todavía no.

### Ledger de acciones

`agent_action_requests` conserva:

- acción propuesta;
- agente/run de origen;
- fundamento;
- confianza;
- riesgo;
- monto estimado;
- política aplicada;
- veredicto de política;
- autorización humana cuando corresponde;
- estado de ejecución;
- resultado técnico;
- error.

### Políticas

`autonomy_policies` modela por negocio:

- `action_type`;
- `mode`: `autonomous` / `approval` / `blocked`;
- confianza mínima;
- monto máximo;
- condiciones;
- estado activo.

El runtime evalúa de forma determinística riesgo, confianza, modo y límites antes de ejecutar.

Políticas vigentes verificadas:

- `market_research` → autónoma, min 0.70;
- `create_content_draft` → autónoma, min 0.75;
- `create_operation_task` → autónoma, min 0.85 + receta/stock/capacidad;
- `record_business_inputs` → autónoma, min 0.90;
- `materialize_development_recipe` → autónoma, min 0.90;
- `reply_customer_routine` → aprobación;
- `create_order` → aprobación;
- `create_payment_link` → aprobación;
- `publish_content` → aprobación;
- `paid_ad_spend` → bloqueada.

**Pendiente arquitectónico:** versionar políticas para poder reconstruir exactamente qué versión autorizó una acción histórica.

---

## 7. Descubrimiento, desarrollo y preparación del piloto

### PR #27 · controlador único de Descubrir

- Un único controlador integrado.
- Sin múltiples monkey-patches/interceptores paralelos.
- Lectura autenticada con RLS.
- Estados claros de loading/error/selección.
- Guard de CI contra regresión a múltiples controladores.

### PR #28 · desarrollo técnico automático

Después de confirmar candidatos:

**selección → Producto → Producción → Calidad → ficha técnica persistida**.

No requiere un segundo prompt del propietario.

### PR #29 · reliability-first

Se corrigió el routing de modelos para priorizar confiabilidad y se agregaron guards de CI.

### PR #30 / #31 · oferta enriquecida y experiencia humana

- estrategia visual fundamentada en evidencia;
- referencias de mercado;
- imagen aspiracional separada de foto real;
- instrucciones humanas separadas del detalle técnico;
- galería en Mi Negocio;
- foto real futura como `primary_media`;
- exportación enriquecida.

### PR #32 · selección → Mi Negocio

Una oportunidad seleccionada se convierte inmediatamente en oferta `draft` dentro del gemelo operativo, sin esperar receta/costo/calidad final.

### PR #33 · handoff backend automático

Al terminar desarrollo técnico se encola enriquecimiento sin depender de que el propietario vuelva a abrir Descubrir.

### PR #34 · reanudación por etapas

Un enrichment parcial reutiliza etapas ya persistidas y reintenta sólo lo faltante.

### PR #35 · semántica de evidencia

La UI y los prompts distinguen qué demuestra cada fuente:

- oferta local;
- referencia de formato;
- referencia visual;
- tendencia;
- precio observado;
- contexto competitivo/mercado.

También diferencia producto específico, página de comercio, categoría, artículo, etc., evitando presentar una fuente como evidencia de algo que no prueba.

### PR #36 · preparación agentic de piloto

Los agentes reciben la formulación de desarrollo ya existente y, para una cantidad pedida por el propietario:

- Producto escala la formulación;
- Producción cruza necesidades con compras/stock;
- Caja calcula economía sólo con datos reales;
- Calidad se activa cuando puede bloquear la prueba;
- el propietario aporta hechos, no cálculos.

### PR #37 · hechos reales + filtro de visión

- persistencia agentic de compras/stock/costos;
- materialización segura de recetas `draft`;
- filtro obligatorio de visión en `PRODUCT_VISION.md` y en el Director;
- build `0.13.0-agentic-fact-ingestion`.

### PR #39 · observabilidad y aceptación del piloto

Sin agregar nueva lógica empresarial se incorporó:

- `scripts/pilot-observability.mjs`: snapshot read-only de estado, acciones, runs, especialistas, uso/costo de IA, threads y políticas;
- `scripts/check-pilot-acceptance.mjs`: comparación before/after con aceptación por etapas `conversation → recipe → facts → trace`;
- self-test del checker dentro de `npm run check`;
- `docs/PILOT_ACCEPTANCE.md` con protocolo y criterios de fallo/éxito;
- `docs/EXTERNAL_AGENTIC_REFERENCES.md` con las lecciones verificadas de Café SofIA, Andon Café/Mona, Andon Market y Pion.

El PR #39 pasó syntax CI y Deploy Preview antes de fusionarse.

### PR #40 · verificación automática de producción

Se agregó una verificación post-merge/push a `main` que:

- deriva el `BUILD_VERSION` esperado directamente de `src/app.js`;
- espera a Netlify producción;
- consulta `/api/estado`;
- falla si producción no sirve el mismo build o no declara persistencia Supabase.

El PR #40 pasó syntax CI y Deploy Preview antes de fusionarse. El primer run post-merge verificó producción correctamente en el primer intento.

### PR #42 · recuperación de Auth en iOS

- se actualizó `@supabase/supabase-js` de `2.95.0` a `2.117.1`;
- se cambió el build a `0.13.1-ios-auth-abort`;
- syntax CI, chat transport smoke y Deploy Preview quedaron en verde;
- el verificador post-merge confirmó producción en el nuevo build;
- la apertura desde iPhone volvió a funcionar.

### Cambio de identidad pública de Netlify

El sitio productivo fue renombrado de `intaxis.netlify.app` a **`agenticpymes.netlify.app`**. El verificador de producción usa desde ahora el nuevo dominio como endpoint por defecto. El repositorio GitHub conserva por el momento el nombre técnico `Intaxis`.

---

## 8. Estado real del piloto Postres Experiencia

Supabase producción verificado en este corte:

- **3 productos**;
- **0 ingredientes persistidos**;
- **0 recetas persistidas**;
- **0 recipe_items**;
- **0 movimientos de inventario**;
- **0 acciones `record_business_inputs` ejecutadas**;
- **0 acciones `materialize_development_recipe` ejecutadas**.

Por lo tanto, el nuevo loop de ingreso agentic **está implementado e instrumentado, pero todavía no probado con la misión real**.

### Ofertas existentes

Las tres están en estado comercial `draft`, sin `sell_price`, con fase `needs_data` y blueprint de 6 unidades × 250 g:

- Chocotorta en lata transparente.
- Tiramisú clásico en lata transparente.
- Cheesecake frío de frutos rojos en envase transparente.

### Chocotorta · formulación de banco actual

Blueprint real:

- 378 g galletitas de chocolate;
- 525 g dulce de leche repostero;
- 525 g queso crema entero;
- 136,5 g leche;
- 10,5 g cacao amargo;
- rendimiento base: 6 unidades de 250 g.

Estado:

- `approval_status = review`;
- `development_status = needs_data`;
- no es receta comercial aprobada;
- no existe vida útil validada.

### Primer micro-piloto decidido

Objetivo físico: **3 unidades**.

Escalado matemático de la formulación de banco:

- 189 g galletitas;
- 262,5 g dulce de leche repostero;
- 262,5 g queso crema;
- 68,25 g/ml aprox. de leche;
- 5,25 g cacao;
- 3 envases.

Este escalado es una hipótesis de trabajo para validación física, no una aprobación comercial.

### Hechos reales ya aportados por el propietario, todavía NO persistidos en Mi Negocio

Estos datos se conservarán como checkpoint para la prueba conversacional, pero el sistema debe ingresarlos mediante `record_business_inputs` cuando se ejecute la misión real:

- Chocolinas: 500 g comprados por ARS 5.400.
- Queso crema: 580 g totales por ARS 6.080 netos.
- Dulce de leche repostero: 400 g por ARS 3.800 netos.
- Leche entera 1 L: referencia observada ARS 2.136; debe distinguirse referencia de compra real si corresponde.
- Envase transparente + tapa: USD 0,60 por unidad.
- Cacao: costo real todavía faltante.

La carne/“aguja” observada en el ticket no pertenece al negocio y debe ignorarse.

No se toma como costo final del producto ningún cálculo manual previo. Caja debe recalcular desde hechos persistidos y, luego del piloto, reemplazar consumos teóricos por consumos/mermas/rendimiento reales.

---

## 9. Calidad y medios visuales

### Calidad

La formulación técnica existe, pero la revisión de Calidad quedó incompleta porque el flujo histórico dependía de un `QUALITY_REVIEW_JSON` embebido en texto y luego un retry chocó con límite de uso/facturación de OpenAI.

No se debe declarar:

- vida útil;
- seguridad final;
- aprobación comercial;
- condiciones definitivas de conservación;

hasta que Calidad cierre con evidencia suficiente y/o intervención profesional cuando corresponda.

### Imágenes aspiracionales

Las imágenes aspiracionales fallaron por permiso/scope de API de imágenes (`api.model.images.request`). Esto es independiente del bloqueo de Calidad.

Una imagen aspiracional es sólo una hipótesis comercial visual. La foto real del propietario debe convertirse en `primary_media` cuando exista.

---

## 10. Multi-negocio y verticales

### Lo que existe

- Las entidades principales usan `business_id`.
- RLS aísla información por negocio/propietario.
- Las políticas, eventos, acciones, pedidos, pagos y datos operativos son tenant-aware.
- `business_profiles` contiene `industry`, `business_model`, `offer_mode`, `target_market`, `discovery_context`, `operational_context`, `terminology` y `vertical_config`.
- Ese perfil entra en el contexto de agentes y Descubrimiento.

### Lo que falta

- El runtime actual obtiene el primer negocio accesible (`limit(1)`); todavía no existe una selección madura de negocio activo para un propietario con varias empresas.
- `vertical_config` es flexible pero todavía no es un paquete versionado de capacidades/workflows/reglas por vertical.

Conclusión: la arquitectura es genérica y tenant-aware, pero la experiencia multi-negocio y los verticales versionados todavía no están cerrados.

---

## 11. Dinero y tiempo

Ya existen primitivas reales para:

- `sales_orders` con pipeline comercial/operativo;
- `sales_order_items`;
- `payment_intents`;
- `capacity_settings`;
- `operation_tasks` y fechas de entrega;
- preflight de producción contra receta, stock y capacidad;
- campañas, contenido y atribución.

Todavía no existe un ledger contable/caja completo ni un motor universal de agenda/reservas para todos los verticales. No deben presentarse esas capacidades como terminadas.

---

## 12. Aprendizaje

Ésta es la brecha arquitectónica más clara después de cerrar el piloto físico.

Hoy existen `business_hypotheses`, `business_decisions`, resultados técnicos de acciones y trazas, pero no existe todavía un mecanismo canónico que conecte de forma automática:

**supuesto → acción/intervención → resultado esperado → resultado observado → diferencia → aprendizaje → cambio propuesto**.

Ejemplo esperado para Chocotorta:

- merma supuesta: 5 %;
- merma real medida: X %;
- tiempo supuesto: Y;
- tiempo real: Z;
- costo teórico: A;
- costo real: B;
- consecuencia: proponer nueva versión de receta/costo/proceso.

El aprendizaje v1 debe ser explícito, trazable y auditable. No implica que el modelo reescriba prompts o políticas autónomamente.

---

## 13. Capa de eventos · estado real

La tabla y algunos productores de eventos existen. Falta convertirla en el sistema nervioso completo.

Objetivo posterior al primer loop físico:

**pedido / pago / stock / tarea / fecha / resultado → `business_event` → evaluación del Director → política → acción**.

No se construirá un segundo bus de eventos. Se evolucionará `business_events` existente.

La investigación de SofIA/Pion/Mona refuerza este patrón, pero no cambia la prioridad: primero se prueba el loop real y después se decide si el dispatcher es el bloqueo siguiente.

---

## 14. Estado de despliegue y pruebas

### Verificado

- PR #36 fusionado.
- PR #37 fusionado.
- PR #39 fusionado: observabilidad/aceptación del piloto + referencias externas documentadas.
- PR #40 fusionado: verificación automática post-merge de producción.
- PR #42 fusionado: corrección de arranque/Auth en iOS.
- `main` contiene build `0.13.1-ios-auth-abort`.
- Syntax CI de PR #39 en verde.
- Deploy Preview de PR #39 en verde.
- Syntax CI de PR #40 en verde.
- Deploy Preview de PR #40 en verde.
- Syntax CI y chat transport smoke de PR #42 en verde.
- Deploy Preview de PR #42 en verde.
- Migración 0018 aplicada en Supabase producción.
- Políticas nuevas verificadas en base real.
- Baseline del piloto verificado en Supabase: 3 productos y 0 ingredientes/recetas/recipe_items/movimientos/acciones nuevas antes de la misión.
- Netlify producción verificado automáticamente el 23/09/2026 con `build = 0.13.1-ios-auth-abort`, `disponible = true` y `persistencia = supabase`.
- El sitio productivo público es `https://agenticpymes.netlify.app`.
- Workflow post-merge `Agentic Pymes production build verify` quedó activo para futuras modificaciones relevantes de `main`.

### Todavía no verificado

- No se ejecutó la misión real `Quiero hacer 3 chocotortas.` con el build actual.
- Por lo tanto no se declara todavía aprobada la conversación progresiva, la persistencia agentic real ni el loop end-to-end.

---

## 15. Próxima prueba de aceptación

Antes de hablar con el Director se toma un snapshot read-only:

```bash
npm run pilot:snapshot -- --out=before.json
```

Luego, con API disponible:

1. abrir el Director;
2. escribir únicamente: **`Quiero hacer 3 chocotortas.`**;
3. no darle un prompt largo ni precargarle manualmente toda la información;
4. comprobar si el Director usa el blueprint ya conocido;
5. comprobar si pregunta progresivamente sólo los hechos faltantes;
6. responder con las compras/costos reales;
7. verificar que se ejecuten y persistan `record_business_inputs` y `materialize_development_recipe`;
8. comprobar que Producción determine suficiencia/faltantes y Caja calcule costo sin pedir cálculos al propietario;
9. verificar que Calidad no invente vida útil ni aprobación;
10. producir físicamente las 3 unidades y registrar pesos, merma, tiempos, cierre, transporte y foto real.

Después se toma el snapshot final:

```bash
npm run pilot:snapshot -- --out=after.json
```

Y se evalúa:

```bash
npm run pilot:accept -- --before=before.json --after=after.json --require=full
```

La aceptación automática revisa por etapas:

**conversation → recipe → facts → trace**

Además reporta cantidad de especialistas y costo tecnológico estimado para detectar sobre-orquestación. La naturalidad de la conversación —pregunta mínima, no pedir cálculos, no repetir información— sigue requiriendo observación humana porque no debe confundirse una respuesta larga y convincente con un loop agentic correcto.

### Criterio de éxito

El propietario expresa intención y hechos del mundo físico. **El sistema coordina, pregunta lo mínimo, calcula, persiste, propone y deja trazabilidad.**

Si el propietario tiene que trasladar datos entre pantallas, calcular proporciones/costos o decidir qué especialista llamar, el loop todavía no está cerrado.

---

## 16. Prioridad inmediata

No agregar OCR de tickets, nuevos agentes, nuevas pantallas, otro bus de eventos, watchdog de autonomía ni verticales adicionales antes de esta prueba, salvo que aparezca un bloqueo mínimo imprescindible para cerrarla.

Orden vigente:

1. validar conversación progresiva + persistencia real del piloto;
2. cerrar piloto físico con mediciones;
3. implementar resultado observado → aprendizaje persistente;
4. activar progresivamente el sistema desde `business_events`;
5. recién después ampliar automatizaciones/conectores y madurar multi-negocio/verticales.
