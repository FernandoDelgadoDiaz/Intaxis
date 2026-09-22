# Agentic Pymes

Agentic Pymes es un sistema operativo empresarial agentic para pequeñas empresas. Su primer negocio piloto real es **Postres Experiencia**, que se utiliza para validar cada capacidad con operación y resultados verificables.

## Objetivo del corte 0.2

Primer corte real de `Mi Negocio`:

- autenticación con Supabase;
- memoria persistente del negocio;
- productos, ingredientes, recetas y stock auditable;
- capacidad productiva;
- decisiones e hipótesis;
- sesiones y ejecuciones del Director persistidas;
- arquitectura compatible con Netlify Functions;
- RLS en todas las tablas expuestas.

## Identidad del producto

- **Plataforma:** Agentic Pymes.
- **Primer negocio piloto:** Postres Experiencia.
- **Principio de interfaz:** el usuario gestiona su empresa, no una colección de agentes.
- **Principio de validación:** una capacidad no se considera implementada por existir en pantalla o instrucciones; debe completar un ciclo real verificable y dejar evidencia persistente.

## Variables de entorno

Copiar `.env.example` a `.env` y completar con las credenciales del proyecto Supabase asignado a Agentic Pymes y la API key de OpenAI.

## Supabase

Aplicar `supabase/migrations/0001_mi_negocio.sql` únicamente sobre la infraestructura dedicada a Agentic Pymes.

## Local

```bash
npm install
npm run dev
```

## Seguridad de la reutilización de Intaxis

El contenido funcional de Intaxis se reemplaza por Agentic Pymes. El historial Git anterior puede seguir conteniendo commits heredados y no debe considerarse parte del producto Agentic Pymes. Cualquier secreto histórico de Intaxis debe permanecer revocado y no reutilizarse.
