# Descubrimiento de Producto · Especificación funcional

## Propósito
Antes de cargar recetas o producir, Agentic Pymes debe investigar el mercado y proponer qué conviene validar. La investigación debe combinar evidencia nacional e internacional, señales de tendencia, presentación, interacción, afinidad con Argentina y restricciones operativas.

## Secuencia
INVESTIGAR → COMPARAR → PROPONER 3 CANDIDATOS → DECISIÓN ESTRATÉGICA DEL PROPIETARIO → FICHA TÉCNICA → COSTEO → PILOTO → PRODUCCIÓN → VENTA → MEDICIÓN.

## Regla de evidencia
Ningún ranking puede presentarse como hecho. El orden es una hipótesis de aceptación comercial y debe conservar fuentes, fecha observada, mercado y confianza. No se inventan métricas de interacción, ventas de competidores, precios ni disponibilidad.

## Salida para propietario
La interfaz del propietario es desktop-first y debe priorizar lectura ejecutiva:
- resumen corto;
- Top 3 visual con imágenes;
- cuadro comparativo;
- evidencia y fuentes;
- exportación Excel;
- selección estratégica de hasta tres candidatos;
- después de la selección: receta, instrucciones, conservación, alérgenos y packaging.

## Excel
El workbook de descubrimiento contiene:
1. Resumen.
2. Comparativo.
3. Evidencia.
4. Imágenes (IMAGE() cuando existe URL HTTPS, más enlace de respaldo).
5. Ficha técnica.

## Roles de interfaz
### Propietario
Desktop-first. Analiza, compara, revisa evidencia, exporta y toma decisiones excepcionales/estratégicas.

### Operario
Mobile-first. No participa del análisis de mercado. Recibe únicamente instrucciones de ejecución, receta, checklist, incidencias y cierre de tarea.

## Datos
- `product_discovery_runs`: investigación y resumen ejecutivo.
- `product_discovery_candidates`: candidatos y señales comparativas.
- `product_discovery_evidence`: fuentes, métricas, imágenes y claims trazables.
- `product_discovery_blueprints`: ficha técnica posterior a selección.

## Estado actual
La estructura y la interfaz no generan datos ficticios. Si todavía no existe una investigación real, el módulo muestra estado vacío y prepara una misión para el Director.
