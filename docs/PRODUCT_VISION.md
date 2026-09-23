# Agentic Pymes · Visión de producto

**Versión:** 1.2  
**Fecha:** 22/09/2026  
**Estado:** fuente rectora de producto en el repositorio

## Decisión central

Agentic Pymes será un sistema operativo empresarial agentic para pequeñas empresas. La plataforma debe ayudar a observar el negocio, detectar oportunidades o problemas, analizar, decidir, ejecutar dentro de permisos, medir resultados y aprender.

El usuario no administra una colección de agentes. Ve el estado de su empresa, oportunidades, decisiones, alertas, propuestas, acciones y resultados. Los especialistas trabajan detrás y comparten una misma memoria estructurada.

La meta no es acumular pantallas, agentes, prompts o capas técnicas. La meta es una empresa agentic de punta a punta en la que el propietario aporte hechos, objetivos, límites y autorizaciones, mientras el sistema coordina el trabajo profesional, ejecuta lo permitido, mide y aprende.

## Jerarquía de verdad

Para evitar que visión, documentos y código se contradigan:

1. **`docs/PRODUCT_VISION.md`** define la visión, los principios y las decisiones de producto que no deben rediscutirse en cada PR.
2. **`docs/IMPLEMENTATION_STATUS.md`** es la verdad operativa de qué está realmente construido, probado, bloqueado o pendiente en este momento.
3. **Código + migraciones aplicadas + estado verificado de Supabase** son la evidencia técnica final. Si un documento contradice la implementación real, el documento debe corregirse; nunca se declara una capacidad por existir sólo en prosa o UI.
4. Los demás documentos son especificaciones de apoyo y no pueden contradecir estas fuentes.

## Primer negocio piloto

**Postres Experiencia** es el primer negocio real usado para validar la plataforma. Es un emprendimiento de postres individuales en Río Gallegos, Santa Cruz, con producción inicial pequeña, capital limitado y reinversión progresiva.

La presentación transparente tipo lata, las capas visibles y la apertura forman parte de la experiencia de producto.

Las tres ofertas seleccionadas y promovidas a `Mi Negocio` son:

1. **Chocotorta en lata transparente** — prioridad para el primer piloto físico.
2. **Tiramisú clásico en lata transparente**.
3. **Cheesecake frío de frutos rojos en envase transparente**.

Postres Experiencia funciona como banco de pruebas. Ninguna capacidad empresarial se considera implementada por existir en una pantalla, prompt o agente: debe completar un ciclo real verificable y dejar evidencia persistente.

## Circuito rector

**OBSERVAR → DETECTAR → ANALIZAR → DECIDIR → ACTUAR → MEDIR → APRENDER**

El circuito no debe depender de que el propietario abra una pantalla. La evolución objetivo es que los hechos del negocio generen eventos y que esos eventos puedan activar al Director cuando corresponda.

## Ciclo de vida empresarial canónico

El núcleo debe poder representar, independientemente del rubro:

**oportunidad → oferta → producto/servicio → pedido o compromiso → operación/producción → entrega → pago → resultado observado → aprendizaje**

Cada vertical especializa este ciclo sin reemplazarlo.

## Filtro obligatorio de decisiones

Toda decisión de producto, arquitectura, operación o automatización debe pasar por este filtro antes de implementarse:

1. **¿Acerca al sistema a una empresa agentic de punta a punta?** Debe reducir dependencia de coordinación, cálculo o seguimiento manual del propietario.
2. **¿Cierra o fortalece un ciclo real?** Debe mejorar al menos una transición del circuito rector y dejar estado o evidencia persistente.
3. **¿Resuelve un bloqueo real o sólo agrega otra capa?** Si no desbloquea operación, confiabilidad, medición o aprendizaje, se posterga.
4. **¿El trabajo lo debería hacer el sistema?** Si el propietario está calculando, copiando, persiguiendo especialistas o reingresando datos que el sistema ya conoce, existe una brecha agentic que debe corregirse.
5. **¿Es reutilizable o está justificado como adaptación del piloto?** El núcleo permanece genérico; lo específico de Postres debe quedar como configuración, datos o adaptador claramente aislado.
6. **¿Produce progreso verificable ahora?** Se prioriza cerrar el primer circuito real sobre ampliar superficie funcional.

Regla de desempate: **cerrar un loop existente tiene prioridad sobre crear una nueva capa**. Una excepción sólo se acepta cuando esa capa nueva es el bloqueo mínimo necesario para cerrar el loop y queda explícitamente justificada.

Este filtro es permanente. El propietario no debe tener que recordarlo en cada conversación o decisión.

## Interacción con el propietario

El propietario debe poder expresar una intención en lenguaje normal, por ejemplo:

> Quiero hacer 3 chocotortas.

El Director debe:

- consultar `Mi Negocio` antes de preguntar;
- reutilizar recetas, formulaciones, compras, stock, costos y decisiones ya conocidos;
- detectar el siguiente dato mínimo que falta;
- preguntar de forma conversacional sólo ese dato o un grupo pequeño de datos relacionados;
- hacer internamente proporciones, costos, faltantes, márgenes y demás cálculos;
- persistir los hechos reales aportados por el propietario cuando exista una acción interna segura para hacerlo;
- continuar desde el estado anterior sin obligar a repetir información;
- activar especialistas sólo cuando su aporte pueda cambiar materialmente la decisión.

El propietario no debe necesitar conocer nombres de agentes, tablas, workflows ni prompts largos para operar la empresa.

## Superficies humanas

- **Propietario / dirección:** experiencia principalmente desktop para estrategia, decisiones, análisis, políticas, excepciones y visión global.
- **Operación física:** experiencia principalmente mobile para ejecutar tareas, registrar hechos del mundo real, evidencias, cantidades, fotos, tiempos y excepciones.

Esto no impide acceso responsive en ambas superficies; define la prioridad de diseño.

## Mi Negocio

`Mi Negocio` es la fuente operativa compartida. Debe representar, como mínimo:

- productos y servicios;
- recetas/versiones o definición operativa equivalente;
- insumos, recursos y proveedores;
- costos y vigencia;
- stock y movimientos cuando corresponda;
- capacidad y agenda;
- producción/operación;
- pedidos y compromisos;
- clientes;
- ventas;
- marketing y campañas;
- caja y pagos;
- decisiones;
- hipótesis y experimentos;
- autorizaciones, acciones y auditoría;
- resultados observados y aprendizaje.

La memoria del negocio no puede depender sólo del historial conversacional.

Un hecho real aportado por el propietario que sea relevante para operar —por ejemplo una compra, un precio pagado, stock disponible, capacidad medida o una foto real— debe poder convertirse en estado persistente sin obligarlo a volver a cargarlo manualmente.

## Equipo agentic

### Director

Coordina especialistas, contrasta conclusiones, usa el estado real de `Mi Negocio`, propone decisiones y controla el ciclo completo. También aplica el filtro obligatorio de visión antes de delegar o proponer trabajo.

### Mercado, Audiencia y Crecimiento

Responsable de competencia, audiencia, tendencias, posicionamiento, campañas, experimentación, atribución y crecimiento.

Investiga por capas:

1. mercado local;
2. Argentina;
3. Latinoamérica;
4. mercados internacionales relevantes cuando aporten señales útiles.

Trabaja con tres horizontes:

- **AHORA:** señales aplicables al mercado actual;
- **PRÓXIMO:** señales que empiezan a crecer y merecen experimento;
- **RADAR:** tendencias tempranas.

Una tendencia global nunca se copia automáticamente. Debe traducirse a demanda local, abastecimiento, costo, capacidad, margen, complejidad, riesgo y posibilidad de prueba pequeña.

### Producto y Experiencia

Definición del producto/servicio, versiones, experiencia, presentación, pruebas y documentación.

### Caja y Rentabilidad

Costo completo, precio, margen, equilibrio, caja, reposición y escenarios.

### Ventas y Clientes

Consultas, pedidos, conversión, servicio, seguimiento y recompra.

### Producción y Abastecimiento

Capacidad, tandas/procesos, recursos, stock, compras, agenda y entregas.

### Calidad y Cumplimiento

Controles, trazabilidad, documentación y derivación a profesionales o autoridades cuando corresponda.

### Información y Decisiones

Evidencia, contradicciones, trazabilidad, fuentes y síntesis ejecutiva.

Un especialista existe por función empresarial, no por canal. WhatsApp, Instagram, TikTok, web u otros proveedores son adaptadores de entrada/salida y no equipos independientes.

## Eventos

El modelo objetivo es:

**hecho empresarial → evento → Director → especialistas necesarios → decisión → política → acción → resultado → medición → aprendizaje**

Los eventos deben representar cambios reales como pedido recibido, pago confirmado, stock bajo, tarea vencida, entrega próxima, proveedor fallido o finalización de una intervención.

La capa de eventos debe ser genérica e idempotente. Un evento no autoriza por sí solo una acción externa: sólo activa evaluación.

## Autonomía

Toda acción material debe pasar por una política determinística. Las políticas se aplican por negocio y pueden considerar, entre otras cosas:

- tipo de acción;
- modo (`autonomous`, `approval`, `blocked`);
- confianza mínima;
- monto máximo;
- riesgo;
- precondiciones y contexto.

Registrar hechos internos explícitos aportados por el propietario puede automatizarse cuando no crea un compromiso externo y queda trazabilidad de origen. Una formulación de desarrollo puede materializarse como receta `draft`, pero eso no la convierte en receta aprobada ni autoriza producción comercial.

Hasta que exista una regla probada y autorizada, requieren aprobación explícita las acciones con compromiso externo, entre ellas gastar dinero, publicar, contactar terceros, aceptar pedidos, cobrar o prometer entregas.

La autonomía debe ser gradual, reversible, auditable y medible. La evolución futura debe incluir versionado de políticas para poder reconstruir por qué una acción fue autorizada bajo una regla vigente en un momento determinado.

## Ledger de acciones y decisiones

El sistema debe conservar el recorrido:

**acción propuesta → política evaluada → autónoma / aprobación / bloqueo → ejecución → resultado técnico → resultado empresarial observado**

No alcanza con guardar la respuesta del modelo. Cada acción debe poder auditarse y vincularse con la decisión, la política aplicada y su resultado.

## Aprendizaje

`APRENDER` no significa que un modelo se reescriba solo ni que modifique políticas de forma opaca.

En la primera etapa, aprender significa persistir de manera estructurada:

- hipótesis o supuesto previo;
- intervención realizada;
- resultado esperado;
- resultado real observado;
- diferencia;
- conclusión;
- cambio propuesto sobre receta, costo, stock, proceso, capacidad, campaña, umbral o política;
- evidencia que justifica ese cambio.

Ejemplo: si una receta suponía 5 % de merma y el piloto real mide 9 %, el sistema debe conservar esa diferencia y usarla para proponer la siguiente versión o experimento. Los cambios materiales siguen pasando por las políticas/autorizaciones correspondientes.

## Configuración vertical

El núcleo es genérico. `business_profiles` y `vertical_config` especializan una PyME mediante contexto, terminología, restricciones y capacidades del rubro sin reescribir el core.

La evolución esperada es que estas configuraciones puedan versionarse y expresar capacidades/requisitos verticales de forma explícita. Hasta entonces, una configuración vertical no debe convertirse en lógica hardcodeada de Postres dentro del núcleo.

## Multi-negocio / tenant

Cada negocio posee su propio `business_id`, memoria, políticas, acciones, eventos, conversaciones, datos operativos y contexto. Los agentes persistentes pueden ser compartidos como definición técnica, pero cada ejecución debe recibir únicamente el contexto autorizado del negocio activo.

El aislamiento entre negocios es una condición arquitectónica, no una feature opcional.

## Dinero y tiempo

Dinero y tiempo son restricciones de primer nivel.

El núcleo debe poder representar:

- precio, costo, margen y caja;
- pedidos, pagos y estados de cobro;
- fechas comprometidas;
- capacidad;
- agenda/reservas cuando aplique;
- vencimientos y tareas;
- tiempos reales de proceso y entrega.

Un agente no debe comprometer dinero ni tiempo que el sistema no pueda verificar.

## Campañas intencionadas

No se publica por calendario. Cada campaña debe tener objetivo empresarial, hipótesis, audiencia, propuesta creativa, presupuesto/límite, capacidad operativa disponible, criterio de éxito, atribución y aprendizaje posterior.

Las vistas o el engagement no equivalen a éxito comercial. La métrica final es resultado económico sostenible.

## Principio de producto

El sistema debe evolucionar desde:

**Usuario → Director → especialistas → análisis**

hacia:

**Empresa → datos/eventos → Director → especialistas → decisión → política → acción → resultado → aprendizaje**

## Reutilización para otras PyMEs

El núcleo debe desacoplarse de Postres Experiencia. Postres es la primera instancia, no la identidad técnica de la plataforma.

El objetivo es permitir que otro emprendimiento cargue su propia empresa —productos o servicios, costos, recursos, capacidad, clientes y operación— y reciba el mismo ciclo agentic sin tener que configurar o administrar agentes individualmente.

## Prioridad de construcción

1. Cerrar el primer circuito real completo y verificable usando `Mi Negocio` como memoria operativa.
2. Eliminar trabajo manual del propietario que el equipo agentic ya puede resolver o persistir.
3. Conectar resultados observados con aprendizaje persistente.
4. Convertir la capa de eventos existente en activación real del sistema cuando el negocio cambie.
5. Ampliar autonomía sólo con políticas, precondiciones y evidencia.
6. Acciones externas controladas y conectores.
7. Generalización/maduración de verticales y multi-negocio.

## Regla de gobierno

Este documento es la fuente rectora de producto dentro del repositorio. Todo cambio sustancial debe modificar versión, fecha, decisión y motivo. Investigaciones o conversaciones no cambian la visión hasta quedar incorporadas aquí.

**Motivo de versión 1.2:** consolidar como decisiones rectoras la interacción conversacional progresiva del Director, la activación futura por eventos, el ciclo empresarial canónico, el lugar explícito del aprendizaje, el modelo multi-negocio/vertical y la jerarquía de verdad entre visión, estado real y código.