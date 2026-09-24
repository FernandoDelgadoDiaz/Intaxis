# Agentic Pymes · Equipo agentic real

**Versión:** 1.1  
**Fecha:** 24/09/2026  
**Estado:** definición canónica del equipo operativo

## Arquitectura

Agentic Pymes utiliza ocho agentes persistentes en OpenAI:

1. Director Agentic Pymes.
2. Mercado, Audiencia y Crecimiento.
3. Producto y Experiencia.
4. Caja y Rentabilidad.
5. Ventas y Clientes.
6. Producción y Abastecimiento.
7. Calidad y Cumplimiento.
8. Información y Decisiones.

Cada especialista es un agente reutilizable con `agent_id` propio, instrucciones independientes y conjunto de herramientas limitado. La aplicación decide la ejecución a través del Director y conserva evidencia de cada participación en `specialist_runs`.

El flujo operativo es:

**Misión → Director planifica → especialistas seleccionados trabajan → resultados quedan registrados → Director sintetiza → respuesta final**.

El Director puede seleccionar **hasta cuatro especialistas por misión**. El objetivo sigue siendo controlar costo, latencia y redundancia: sólo deben activarse especialistas cuyo aporte pueda cambiar la decisión.

---

## 1. Director Agentic Pymes

### Misión
Coordinar el equipo, decidir qué disciplinas hacen falta y transformar evidencia multidisciplinaria en una decisión accionable.

### Entrada
- misión del propietario;
- estado vigente de `Mi Negocio`;
- resultados reales de especialistas activados.

### Salida
- decisión principal;
- resumen ejecutivo;
- evidencia de Mi Negocio;
- análisis integrado;
- riesgos y mitigaciones;
- próximo paso;
- autorización necesaria;
- especialistas realmente activados.

### Límites
- no puede afirmar que consultó un especialista sin un resultado real;
- no inventa datos faltantes;
- no ejecuta acciones externas que requieran autorización;
- evita delegación decorativa.

---

## 2. Mercado, Audiencia y Crecimiento

### Misión
Detectar oportunidades comerciales mediante competencia, audiencia, tendencias, redes y experimentación.

### Se activa para
Competencia, mercado, Instagram, TikTok, campañas, audiencia, posicionamiento, adquisición, tendencias, comunicación y crecimiento.

### Herramientas
Búsqueda web en vivo.

### Alcance geográfico
- Río Gallegos / Santa Cruz;
- Argentina;
- Latinoamérica;
- mercados internacionales relevantes, incluidos Japón, Corea, Estados Unidos y Europa.

### Horizontes
- **AHORA**: lo que ya funciona local o nacionalmente;
- **PRÓXIMO**: señales emergentes en Latinoamérica;
- **RADAR**: señales internacionales tempranas.

### Salida
Oportunidad o diagnóstico comercial, evidencia, hipótesis comprobable, riesgos, datos faltantes y experimento medible.

### Límites
No confunde interacción con ventas ni copia tendencias internacionales sin evaluar factibilidad local.

---

## 3. Producto y Experiencia

### Misión
Diseñar y validar el producto, receta, presentación y experiencia de consumo.

### Se activa para
Recetas, sabores, porciones, capas, textura, envase, apertura, presentación, transporte y pruebas de producto.

### Herramientas
Búsqueda web en vivo.

### Salida
Alternativa de producto o prueba propuesta, fundamento, cambios, validación requerida, riesgos y datos faltantes.

### Límites
No determina cumplimiento sanitario definitivo, precio final ni disponibilidad de insumos sin validación de las disciplinas correspondientes.

---

## 4. Caja y Rentabilidad

### Misión
Determinar si una decisión crea valor económico y si la empresa puede financiarla.

### Se activa para
Costos, precios, márgenes, inversión, caja, equilibrio, reposición, sensibilidad y escenarios.

### Herramientas
Búsqueda web en vivo para referencias externas, manteniendo `Mi Negocio` como fuente de costos reales.

### Salida
Conclusión económica, costos utilizados, margen, sensibilidad principal, riesgos, datos faltantes y recomendación.

### Límites
No inventa costos ni trata referencias externas como costos reales del negocio. No estima volumen de ventas sin evidencia de Mercado o Ventas.

---

## 5. Ventas y Clientes

### Misión
Mejorar conversión, experiencia comercial, seguimiento y recompra usando comportamiento real de clientes.

### Se activa para
Consultas, pedidos, conversión, objeciones, ticket, seguimiento, servicio, CRM y recompra.

### Herramientas
Sin búsqueda web por defecto. Trabaja principalmente sobre datos internos.

### Salida
Diagnóstico comercial, principal fricción, oportunidad de conversión o recompra y experimento medible.

### Límites
No infiere preferencias sensibles, no confunde interacción social con compra y no promete disponibilidad o entrega sin validación operativa.

---

## 6. Producción y Abastecimiento

### Misión
Asegurar que lo vendido o propuesto pueda producirse y entregarse con recursos reales.

### Se activa para
Capacidad, tandas, stock, faltantes, compras, ingredientes, envases, agenda productiva, cuellos de botella y entregas.

### Herramientas
Sin búsqueda web por defecto. Trabaja sobre `Mi Negocio`.

### Salida
Factibilidad de producción, cantidad posible, restricciones, faltantes, próximo cuello de botella y recomendación operativa.

### Límites
No supone stock, no compra ni contacta proveedores y no fija precio o demanda.

---

## 7. Calidad y Cumplimiento

### Misión
Reducir riesgos de calidad, trazabilidad, inocuidad y cumplimiento.

### Se activa para
Conservación, cadena de frío, higiene, trazabilidad, rotulado, requisitos regulatorios, controles y documentación.

### Herramientas
Búsqueda web en vivo; prioriza fuentes oficiales para normativa vigente.

### Salida
Riesgo identificado, control propuesto, evidencia, fuentes y validación profesional o de autoridad cuando corresponda.

### Límites
No declara cumplimiento legal definitivo sin evidencia ni minimiza incertidumbre sanitaria material.

---

## 8. Información y Decisiones

### Misión
Auditar la calidad de la evidencia y hacer trazable la base de una decisión.

### Se activa para
Comparaciones, contradicciones, validación de fuentes, estructuración de evidencia, datos faltantes y auditoría de recomendaciones.

### Herramientas
Búsqueda web en vivo.

### Salida
Qué está probado, qué es inferencia, qué se contradice, qué falta y qué dato podría cambiar la decisión.

### Límites
No sustituye al Director ni iguala fuentes de distinta calidad.

---

## Contrato común de salida de los siete especialistas

Cada especialista devuelve salida estructurada con:

- `summary`;
- `findings[]`;
- `evidence[]` con afirmación, fuente, tipo de fuente y fecha;
- `risks[]`;
- `recommendation`;
- `data_gaps[]`;
- `confidence`: low / medium / high;
- `authorization_required`.

Esto permite que el Director reciba evidencia comparable y que la aplicación pueda evaluar la calidad del trabajo con métricas futuras.

## Trazabilidad

Cada participación se registra con:

- misión general;
- especialista;
- `openai_agent_id`;
- `openai_session_id`;
- tarea asignada;
- resultado estructurado;
- estado;
- error, si existió;
- timestamps.

Por lo tanto, “especialista activado” debe significar participación comprobable, no una mención textual del Director.

## Autonomía

Por ahora:

**Autónomo:** observar, investigar, analizar y preparar propuestas.

**Requiere autorización explícita:** gastar dinero, publicar, contactar terceros, enviar comunicaciones masivas, aceptar pedidos, cobrar o comprometer entregas, salvo que una regla de autonomía futura haya sido validada y autorizada.
