# Arquitectura · Agentic Pymes 0.2

## Identidad

Agentic Pymes es la plataforma. Postres Experiencia es el primer negocio piloto y sirve como banco de pruebas real.

## Aislamiento lógico

La aplicación no comparte tablas ni datos con NoVen, Foodia, Barberos u otros productos. La infraestructura heredada de Intaxis se reutiliza únicamente después de reemplazar sus datos y código funcionales.

## Flujo

Usuario autenticado → interfaz Agentic Pymes → Netlify Function / Express → Supabase con JWT del usuario + RLS → Director OpenAI → persistencia de sesión y resultado.

## Mi Negocio

La fuente operativa compartida comienza con:

- businesses
- products
- ingredients
- recipes / recipe_items
- inventory_movements
- capacity_settings
- business_decisions
- business_hypotheses
- agent_threads / agent_runs

Los pedidos, clientes, campañas, ventas, producción y caja se agregarán en cortes verticales posteriores, conectados a este núcleo.

## Principio multiempresa

El modelo de datos usa `business_id` como límite de negocio. Postres Experiencia no debe quedar hardcodeado como identidad de plataforma; es solamente la primera instancia operativa.

## Seguridad

- No se usa `service_role` en la aplicación.
- Las consultas del servidor conservan el JWT del usuario y quedan sometidas a RLS.
- Todas las tablas públicas tienen RLS habilitado.
- `anon` no tiene acceso a los datos de negocio.
- Publicar, gastar dinero o contactar terceros permanece fuera de autonomía hasta autorización explícita.
- Los secretos históricos de Intaxis no se reutilizan.
