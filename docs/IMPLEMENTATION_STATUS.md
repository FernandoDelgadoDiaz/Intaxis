# Estado de implementación · 21/09/2026

## Decisión de producto

- El producto pasa a llamarse **Agentic Pymes**.
- **Postres Experiencia** queda como primer negocio piloto real.
- El objetivo es construir un sistema operativo empresarial agentic reutilizable por otras PyMEs.

## Construido en este corte

- Estructura de aplicación Agentic Pymes.
- Adaptador Express → Netlify Functions.
- Configuración Netlify (`netlify.toml`).
- Autenticación por Magic Link de Supabase.
- RLS en todas las tablas públicas del núcleo.
- `Mi Negocio` con productos, insumos, recetas, movimientos de stock, capacidad, decisiones e hipótesis.
- Persistencia de conversaciones del Director mediante `agent_threads` y `agent_runs`.
- Concurrencia protegida: un solo run activo por negocio.
- Contexto estructurado de `Mi Negocio` inyectado antes de cada misión del Director.
- Especialista de Mercado, Audiencia y Crecimiento incorporado, con alcance local, nacional, latinoamericano e internacional.
- Interfaz inicial con dos superficies: Director y Mi Negocio.
- Alta de productos e insumos desde la interfaz.
- Exportación básica de informe a Excel y PowerPoint mantenida.

## Infraestructura asignada

- GitHub: repositorio histórico `FernandoDelgadoDiaz/Intaxis`, cuyo contenido funcional será reemplazado por Agentic Pymes.
- Supabase: proyecto histórico Intaxis `fubpzfpystsxmgpqjjol`, actualmente INACTIVE; el intento de restauración mediante la API devolvió `Project not found`, por lo que no se considera reutilizable hasta resolverlo.
- Netlify: configuración de despliegue incluida; la vinculación/renombre del sitio debe verificarse por separado.

## Riesgo heredado conocido

El historial Git de Intaxis tuvo un secreto Mapbox expuesto. Borrar los archivos actuales no borra el historial. Ese secreto no debe reutilizarse y debe permanecer revocado.

## Próximo corte recomendado

1. Resolver infraestructura Supabase dedicada para Agentic Pymes sin tocar NoVen ni Barberos.
2. Aplicar el esquema `Mi Negocio`.
3. Verificar autenticación + RLS end-to-end.
4. Recetas editables desde UI.
5. Costo calculado por receta y margen por producto.
6. Primer circuito real verificable: producto → receta → costo → stock → capacidad → recomendación.
7. Después: Radar de Mercado y campañas con hipótesis/resultado.
