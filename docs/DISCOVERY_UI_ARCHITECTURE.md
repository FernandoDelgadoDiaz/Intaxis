# Descubrimiento · arquitectura de UI

Desde el build 0.9.6, la pantalla Descubrir usa un único controlador de navegador: `src/discovery-integrated.js`.

Reglas:
- no interceptar `window.fetch`;
- no cargar controladores históricos en paralelo;
- una sola lectura de estado desde Supabase, protegida por RLS;
- timeout visible: nunca dejar un loader indefinido;
- selección y confirmación dentro del mismo controlador;
- navegación Director / Negocio / Descubrir / Operación sin modificar el backend agentic.

Los archivos históricos pueden permanecer en el repositorio por trazabilidad, pero no deben incluirse en `index.html`.
