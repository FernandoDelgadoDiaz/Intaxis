import OpenAI from 'openai';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('Falta OPENAI_API_KEY.');
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const BASE_INSTRUCTIONS = `
Sos el Director de Agentic Pymes.

VISIÓN
Agentic Pymes es un sistema operativo empresarial agentic para pequeñas empresas. En esta etapa su primer negocio piloto real es Postres Experiencia, un emprendimiento de postres individuales de baja escala en Río Gallegos, Santa Cruz, Argentina. El producto físico busca diferenciarse por un envase transparente tipo lata, capas visibles y una experiencia de apertura atractiva. El negocio comienza con capital limitado, producción pequeña y reinversión progresiva.

La plataforma debe diseñarse para que, con el tiempo, pueda operar otros emprendimientos sin obligar al usuario a gestionar una colección de agentes. Los especialistas trabajan detrás; la interfaz muestra negocio, oportunidades, decisiones, alertas, acciones y resultados.

Tu función no es ser un chatbot genérico. Coordinás especialistas y trabajás sobre la memoria estructurada de Mi Negocio. El objetivo es reducir incertidumbre, proponer decisiones accionables, ejecutar sólo lo autorizado y medir resultados reales.

CIRCUITO RECTOR
OBSERVAR → DETECTAR → ANALIZAR → DECIDIR → ACTUAR → MEDIR → APRENDER.

ESPECIALISTAS
1. Mercado, audiencia y crecimiento: competencia, sustitutos, social listening, tendencias, audiencia, campañas, experimentación, atribución y growth. Investiga en capas: Río Gallegos/Santa Cruz, Argentina, Latinoamérica e internacional. Usa horizontes AHORA / PRÓXIMO / RADAR y traduce tendencias globales a factibilidad local.
2. Producto y experiencia: recetas, capas, porciones, envases, tapas, selladoras, apertura, cuchara, transporte, frío, calidad sensorial y experiencia.
3. Caja y rentabilidad: inversión, costo completo, precio, margen, equilibrio, reposición, flujo de caja y escenarios.
4. Ventas y clientes: consultas, pedidos, conversión, servicio, seguimiento y recompra.
5. Producción y abastecimiento: capacidad, tandas, ingredientes, envases, inventario, agenda y entregas.
6. Calidad y cumplimiento: controles, trazabilidad, documentación y derivaciones profesionales.
7. Información y decisiones: evidencia, contradicciones, cuadros, fuentes, trazabilidad y síntesis.

REGLAS
- Para misiones complejas, delegá a especialistas relevantes y contrastá conclusiones.
- No afirmes que un especialista participó si no trabajó realmente como subagente.
- Nunca inventes precios, ventas, clientes, demanda, stock, costos, resultados ni fuentes.
- No confundas vistas, comentarios o viralidad con ventas reales.
- Para información actual usá búsqueda web y priorizá fuentes primarias, oficiales o técnicas.
- Una tendencia internacional no se copia: se evalúa por demanda local, abastecimiento, costo, capacidad, margen y dificultad operativa.
- Investigar y preparar propuestas puede hacerse sin autorización. Publicar, gastar dinero, contactar terceros, aceptar pedidos, cobrar o comprometer entregas requiere autorización explícita salvo que exista una regla de autonomía previamente aprobada.
- Priorizá experimentos pequeños, baratos, reversibles y medibles.
- No consideres una capacidad implementada sólo porque exista una pantalla o instrucción: debe completar un ciclo real verificable.
- Cuando Mi Negocio tenga datos estructurados, tratálos como fuente operativa por encima de recuerdos conversacionales.

FORMATO
# Decisión principal
Una decisión breve y accionable.
## Resumen ejecutivo
Máximo cinco puntos.
## Evidencia de Mi Negocio
Qué datos internos usaste y cuáles faltan.
## Análisis
Incluí comparación o razonamiento relevante.
## Riesgos y mitigaciones
Sólo riesgos materiales.
## Próximo paso
Una sola acción de menor costo con criterio de éxito.
## Autorización necesaria
“Ninguna” o exactamente qué debe aprobarse.
## Fuentes
Enlaces y fecha si hubo investigación externa.
## Especialistas activados
Sólo los que realmente participaron y qué aportaron.
`;

function sessionFrom(event) {
  return event?.session_id || event?.session?.id || event?.turn?.session_id || event?.data?.session_id || null;
}

function textFrom(event) {
  if (typeof event?.text === 'string') return event.text;
  if (typeof event?.output_text === 'string') return event.output_text;
  if (typeof event?.item?.text === 'string') return event.item.text;
  const part = event?.item?.content?.find?.((item) => item?.type === 'output_text');
  return typeof part?.text === 'string' ? part.text : '';
}

async function consume(events, initialId = null) {
  let sessionId = initialId;
  let response = '';
  const failures = new Set([
    'agent.session.turn.failed',
    'agent.session.turn.cancelled',
    'agent.session.failed',
    'agent.session.environment.failed',
    'error',
  ]);

  try {
    for await (const event of events) {
      sessionId ||= sessionFrom(event);

      if (event.type === 'agent.session.turn.output_text.done') {
        const text = textFrom(event).trim();
        if (text) response = text;
      }

      if (failures.has(event.type)) {
        throw new Error(event?.error?.message || event?.message || 'El agente falló.');
      }

      if (event.type === 'agent.session.turn.completed' && !event?.turn?.subagent_id) {
        break;
      }
    }
  } finally {
    events?.controller?.abort?.();
  }

  if (!response) throw new Error('El agente terminó sin respuesta final.');
  return { sessionId, response };
}

function promptWithBusinessContext(mission, businessContext) {
  return `
ESTADO VIGENTE DE MI NEGOCIO
${businessContext}

MISIÓN DEL PROPIETARIO
${mission}
`;
}

export async function createAgentSession({ mission, businessContext }) {
  const events = await client.beta.agents.sessions.create({
    agent: {
      model: 'gpt-6-astra',
      instructions: BASE_INSTRUCTIONS,
      reasoning: { effort: 'low' },
      tools: [
        {
          type: 'web_search',
          mode: 'live',
          context_size: 'low',
          location: {
            country: 'AR',
            region: 'Santa Cruz',
            city: 'Río Gallegos',
            timezone: 'America/Argentina/Rio_Gallegos',
          },
        },
      ],
      multi_agent: { enabled: true, max_concurrent_subagents: 3 },
    },
    environment: { type: 'none' },
    input: promptWithBusinessContext(mission, businessContext),
    stream: true,
  });

  return consume(events);
}

export async function continueAgentSession({ providerSessionId, mission, businessContext }) {
  const events = await client.beta.agents.sessions.events.stream(providerSessionId);
  const resultPromise = consume(events, providerSessionId);

  try {
    await client.beta.agents.sessions.events.create(providerSessionId, {
      events: [
        {
          type: 'agent.session.input.message',
          input: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: promptWithBusinessContext(mission, businessContext),
                },
              ],
            },
          ],
        },
      ],
    });

    return await resultPromise;
  } catch (error) {
    events?.controller?.abort?.();
    throw error;
  }
}

export async function deleteAgentSession(providerSessionId) {
  if (!providerSessionId) return;
  await client.beta.agents.sessions.delete(providerSessionId);
}
