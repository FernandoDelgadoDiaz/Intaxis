# Agentic Pymes · núcleo genérico para cualquier PyME

## Regla de arquitectura

Postres Experiencia es el primer negocio real que valida Agentic Pymes, pero **no define el núcleo del producto**.

Toda capacidad nueva debe pasar esta prueba:

> ¿Puede reutilizarse en otra PyME de otro rubro mediante configuración, terminología y reglas verticales, sin reescribir el core?

Si la respuesta es no, la lógica específica debe vivir como configuración vertical y no como parte del núcleo.

## Núcleo transversal

El core debe razonar sobre conceptos reutilizables:

- negocio y perfil;
- oferta (producto, servicio o mixto);
- clientes e identidades;
- conversaciones y canales;
- oportunidades y evidencia;
- pedidos/compromisos comerciales;
- pagos;
- recursos, componentes e inventario cuando correspondan;
- capacidad;
- proceso operativo;
- tareas;
- campañas y contenido;
- políticas de autonomía;
- acciones, aprobaciones y resultados;
- decisiones, hipótesis y aprendizaje.

## Perfil vertical

`business_profiles` especializa cada PyME sin cambiar el core:

- `industry`: rubro;
- `business_model`: cómo crea y captura valor;
- `offer_mode`: producto, servicio o mixto;
- `target_market`: mercados objetivo;
- `discovery_context`: qué investigar y qué señales importan;
- `operational_context`: restricciones y forma de operar;
- `terminology`: vocabulario visible del rubro;
- `vertical_config`: requisitos específicos.

Ejemplos de configuración vertical:

- gastronomía: receta, conservación, inocuidad, merma;
- barbería: agenda, duración, profesional, silla disponible;
- taller: repuestos, horas, diagnóstico, entrega;
- consultora: proyecto, horas, entregables, facturación;
- retail: variantes, stock, reposición, entrega.

## Descubrimiento

`Descubrir` es un módulo transversal. El flujo es siempre:

**perfil de la PyME → investigación externa → evidencia → candidatos → comparación → decisión humana estratégica → definición operativa → experimento → resultado → aprendizaje**.

Lo que cambia por rubro son los criterios. Para alimentos pueden importar sabor, presentación y conservación; para servicios, experiencia, capacidad de prestación, duración, recursos y riesgo operativo.

## Regla para agentes

Los agentes reciben el perfil de la PyME dentro de Mi Negocio y deben adaptar vocabulario, criterios y recomendaciones a ese perfil. No deben asumir que toda empresa vende productos físicos ni que toda operación usa recetas, inventario o producción.

## Postres Experiencia

La configuración del piloto se conserva separada del core. Su finalidad es probar Agentic Pymes en condiciones reales y generar evidencia para mejorar la plataforma reusable.
