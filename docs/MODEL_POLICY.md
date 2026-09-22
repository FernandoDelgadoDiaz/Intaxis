# Agentic Pymes · Política de modelos

## Principio

La confiabilidad de una decisión empresarial prevalece sobre el ahorro marginal de tokens. El costo tecnológico se optimiza evitando trabajo innecesario, reutilizando contexto, estructurando datos y aplicando controles determinísticos; no degradando deliberadamente el modelo cuando una respuesta puede modificar una decisión de negocio.

## Routing por responsabilidad

- Director: `gpt-5.6-sol`, reasoning `high`.
- Mercado, Audiencia y Crecimiento: `gpt-5.6-sol`, reasoning `high`.
- Producto y Experiencia: `gpt-5.6-sol`, reasoning `high`.
- Caja y Rentabilidad: `gpt-5.6-sol`, reasoning `high`.
- Calidad y Cumplimiento: `gpt-5.6-sol`, reasoning `high`.
- Información y Decisiones: `gpt-5.6-sol`, reasoning `high`.
- Producción y Abastecimiento: `gpt-5.6-terra`, reasoning `high`, apoyado por preflight y cálculos determinísticos cuando la acción afecta stock/capacidad.
- Ventas y Clientes: `gpt-5.6-terra`, reasoning `medium`; dinero, descuentos, pagos, disponibilidad y compromisos se validan contra políticas y datos estructurados.

Luna no se usa como agente que emita decisiones materiales. Puede reservarse para clasificación, extracción, normalización o trabajo rutinario de alto volumen cuyo resultado sea luego validado por reglas determinísticas o por un agente superior.

## Controles de confiabilidad

El modelo más capaz no reemplaza la evidencia. Toda decisión material debe combinar, según corresponda:

1. datos reales de Mi Negocio;
2. fuentes externas trazables y fechadas;
3. salida estructurada del especialista;
4. separación explícita entre hecho, inferencia y dato faltante;
5. validación determinística para montos, stock, capacidad, identidad, estado de pedidos y políticas;
6. escalamiento humano cuando la evidencia sea insuficiente o el riesgo exceda la política;
7. trazabilidad en `specialist_runs`, `agent_runs`, `agent_action_requests` y `ai_usage_events`.

## Regla para terceros

La configuración productiva de Agentic Pymes debe ser apropiada para una PyME que no conoce internamente los modelos. El usuario no debería tener que elegir un modelo para obtener una decisión confiable. La plataforma es responsable de enrutar la tarea al nivel de capacidad adecuado y registrar qué modelo participó.

## Evolución

Esta política es versionada. Cuando OpenAI publique un modelo claramente superior o más adecuado para una clase de tarea, se evalúa con pruebas reproducibles antes de reemplazar el routing productivo. El cambio debe conservar trazabilidad, costo estimado y regresión funcional.