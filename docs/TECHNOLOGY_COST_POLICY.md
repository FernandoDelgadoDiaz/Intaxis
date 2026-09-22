# Agentic Pymes · Política de costo tecnológico

## Principio

La tecnología no es gratis ni debe quedar escondida fuera de la economía del negocio. Cada ejecución agentic consume recursos y, cuando ese consumo puede atribuirse, forma parte del costo empresarial que debe proteger el margen.

La regla operativa es: **usar el modelo de menor costo que mantenga la calidad necesaria para la tarea**. El Director reserva el modelo de mayor capacidad para coordinación y síntesis compleja; especialistas estructurados usan modelos más económicos.

## Política de modelos v1

| Rol | Modelo base | Motivo |
| --- | --- | --- |
| Director | gpt-6-astra | Coordinación, planificación y síntesis multidisciplinaria |
| Mercado, Audiencia y Crecimiento | gpt-5.6-terra | Investigación y análisis con equilibrio calidad/costo |
| Producto y Experiencia | gpt-5.6-terra | Análisis profesional no rutinario |
| Caja y Rentabilidad | gpt-5.6-terra | Razonamiento económico y sensibilidad |
| Ventas y Clientes | gpt-5.6-luna | Trabajo estructurado y repetible |
| Producción y Abastecimiento | gpt-5.6-luna | Cálculo operativo sobre datos estructurados |
| Calidad y Cumplimiento | gpt-5.6-terra | Riesgo y fuentes vigentes requieren mayor análisis |
| Información y Decisiones | gpt-5.6-terra | Auditoría de evidencia y contradicciones |

Esta política es versionada. Una mejora de calidad o una reducción de precio puede justificar cambiar el modelo sin alterar la identidad del agente.

## Qué medimos

Cada llamada de modelo intenta registrar en `ai_usage_events`:

- misión y fase: plan del Director, especialista o síntesis;
- agente/rol y modelo utilizado;
- sesión y turno de OpenAI;
- tokens de entrada;
- tokens de entrada en caché;
- tokens de salida;
- tokens de razonamiento;
- tokens totales;
- costo estimado de modelo en USD;
- versión de la tabla de precios usada.

OpenAI documenta que `usage` es best-effort, puede ser `null` y puede cambiar con la contabilización posterior. Por eso `usage_available` y `usage_complete` distinguen costo medido de costo desconocido. Ausencia de usage nunca significa costo cero.

## Qué incluye el costo estimado

`estimated_model_cost_usd` calcula solamente tokens del modelo con la tabla de precios versionada de Agentic Pymes. Los tokens de razonamiento ya están incluidos en los tokens de salida y no se cuentan dos veces. Los tokens de entrada en caché ya están incluidos en la entrada y se separan para aplicar su tarifa correspondiente.

El valor **no es la factura final** y, hasta que exista telemetría específica, excluye:

- llamadas a web search u otras herramientas;
- escrituras de caché;
- sandbox/computer use;
- servicios de terceros;
- Netlify, Supabase, dominio y otros costos de infraestructura;
- impuestos y recargos regionales;
- ajustes de precio por contexto largo.

## Cómo entra la tecnología al costo del producto

No todo consumo tecnológico debe cargarse directamente a una chocotorta o a otro producto. Se clasifica primero:

1. **Directo a producto**: análisis ejecutado exclusivamente para definir/producir una referencia concreta. Puede atribuirse a ese producto.
2. **Directo a lote**: ejecución necesaria para un lote específico. Se divide por unidades efectivamente producidas del lote.
3. **Directo a pedido**: costo ocasionado por un pedido concreto. Se atribuye a ese pedido.
4. **Operativo compartido**: Director, planificación general, administración o tareas que benefician a varios productos. Se distribuye mediante una regla explícita del período.
5. **Investigación y crecimiento**: investigación de mercado, tendencias o campañas exploratorias. Se registra como gasto comercial/innovación hasta que exista una regla de atribución aprobada.

Nunca se distribuye automáticamente un costo compartido entre productos sin dejar registrada la regla.

## Moneda

La API se mide en USD. Si el costo del producto se calcula en ARS, la conversión debe guardar:

- tipo de cambio utilizado;
- fuente;
- fecha/hora;
- monto original USD;
- monto convertido ARS.

No se debe recalcular silenciosamente el histórico con un tipo de cambio posterior.

## Próxima evolución

Cuando existan lotes, pedidos y ventas reales, `technology_cost_class` deberá vincularse con `product_id`, `batch_id` u `order_id`. Caja y Rentabilidad podrá entonces mostrar:

- costo tecnológico por unidad;
- costo agentic por pedido;
- costo agentic como porcentaje de ventas;
- ahorro por routing de modelos;
- margen antes y después de tecnología;
- retorno económico de cada automatización.
