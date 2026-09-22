import OpenAI from 'openai';
import { ensureAgentTeam, specialistDefinition, specialistKeys } from './team.js';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('Falta OPENAI_API_KEY.');
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const VALID_SPECIALIST_KEYS = new Set(specialistKeys());

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

async function createSavedAgentSession({ agentId, input }) {
  const events = await client.beta.agents.sessions.create({
    agent_id: agentId,
    environment: { type: 'none' },
    input,
    stream: true,
  });
  return consume(events);
}

async function continueSavedAgentSession({ sessionId, input }) {
  const events = await client.beta.agents.sessions.events.stream(sessionId);
  const resultPromise = consume(events, sessionId);

  try {
    await client.beta.agents.sessions.events.create(sessionId, {
      events: [
        {
          type: 'agent.session.input.message',
          input: [
            {
              role: 'user',
              content: [{ type: 'input_text', text: input }],
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

function extractJson(text) {
  const cleaned = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('El agente devolvió una salida estructurada inválida.');
  }
}

function fallbackPlan(mission) {
  const text = String(mission || '').toLowerCase();
  const planned = [];
  const add = (key, task) => {
    if (!planned.some((item) => item.key === key)) planned.push({ key, task });
  };

  if (/mercado|compet|redes|instagram|tiktok|campañ|audien|tendencia|marketing|publicidad|comunicaci/.test(text)) add('market_growth', 'Analizar mercado, audiencia y oportunidad comercial relacionada con la misión.');
  if (/receta|sabor|producto|envase|presentaci|capa|textura|apertura|porci/.test(text)) add('product_experience', 'Evaluar producto, experiencia y prueba necesaria.');
  if (/costo|precio|margen|rentab|caja|inversi|equilibrio|ganancia/.test(text)) add('finance_profitability', 'Evaluar impacto económico, margen y sensibilidad.');
  if (/venta|cliente|pedido|conversi|recompra|ticket|consulta/.test(text)) add('sales_customers', 'Evaluar impacto comercial y comportamiento de clientes.');
  if (/stock|producci|capacidad|insumo|abaste|compra|envase|entrega|tanda/.test(text)) add('production_supply', 'Evaluar factibilidad operativa, stock, capacidad y abastecimiento.');
  if (/calidad|inocu|habilit|norma|regula|frío|trazab|rotulad|higiene/.test(text)) add('quality_compliance', 'Evaluar riesgos de calidad, trazabilidad y cumplimiento.');
  if (/evidencia|compar|contradic|fuente|validar|decisi|informe/.test(text)) add('information_decisions', 'Auditar evidencia, contradicciones y datos faltantes.');

  if (planned.length === 0) {
    add('information_decisions', 'Determinar qué evidencia existe, qué falta y qué especialistas adicionales serían necesarios.');
  }

  return { specialists: planned.slice(0, 4), rationale: 'Plan de contingencia generado por reglas determinísticas porque el plan del Director no pudo interpretarse.' };
}

function parsePlan(raw, mission) {
  try {
    const parsed = extractJson(raw);
    const specialists = Array.isArray(parsed?.specialists)
      ? parsed.specialists
          .filter((item) => VALID_SPECIALIST_KEYS.has(item?.key))
          .map((item) => ({ key: item.key, task: String(item.task || '').trim() || `Analizar la misión desde ${item.key}.` }))
      : [];

    if (!specialists.length) return fallbackPlan(mission);
    const deduped = specialists.filter((item, index, array) => array.findIndex((other) => other.key === item.key) === index);
    return { specialists: deduped.slice(0, 7), rationale: String(parsed?.rationale || '').trim() };
  } catch {
    return fallbackPlan(mission);
  }
}

function planPrompt(mission, businessContext) {
  return `MODO PLAN

ESTADO VIGENTE DE MI NEGOCIO
${businessContext}

MISIÓN DEL PROPIETARIO
${mission}

Elegí sólo especialistas cuyo trabajo pueda cambiar materialmente la decisión. Cada task debe ser concreta y no duplicar a otra especialidad.`;
}

function specialistPrompt({ mission, businessContext, task, specialistName }) {
  return `ESTADO VIGENTE DE MI NEGOCIO
${businessContext}

MISIÓN ORIGINAL DEL PROPIETARIO
${mission}

ASIGNACIÓN DEL DIRECTOR PARA ${specialistName.toUpperCase()}
${task}

Trabajá sólo dentro de tu especialidad. Tu salida debe respetar exactamente el esquema estructurado configurado para este agente.`;
}

function synthesisPrompt({ mission, businessContext, plan, specialistResults }) {
  const evidence = specialistResults.map((item) => ({
    key: item.key,
    name: item.name,
    task: item.task,
    result: item.result,
  }));

  return `MODO SÍNTESIS

ESTADO VIGENTE DE MI NEGOCIO
${businessContext}

MISIÓN DEL PROPIETARIO
${mission}

PLAN DE DELEGACIÓN REAL
${JSON.stringify(plan, null, 2)}

RESULTADOS REALES DE LOS ESPECIALISTAS ACTIVADOS
${JSON.stringify(evidence, null, 2)}

Integrá estos aportes. Si hay contradicciones, hacelas explícitas. En "Especialistas activados" mencioná exclusivamente los especialistas listados arriba y resumí qué aportó cada uno.`;
}

export async function planDirectorMission({ providerSessionId, mission, businessContext }) {
  const team = await ensureAgentTeam();
  const input = planPrompt(mission, businessContext);
  const result = providerSessionId
    ? await continueSavedAgentSession({ sessionId: providerSessionId, input })
    : await createSavedAgentSession({ agentId: team.director.id, input });

  return {
    sessionId: result.sessionId,
    plan: parsePlan(result.response, mission),
    rawPlan: result.response,
    directorAgentId: team.director.id,
  };
}

export async function runSpecialist({ key, task, mission, businessContext }) {
  const definition = specialistDefinition(key);
  if (!definition) throw new Error(`Especialista desconocido: ${key}`);
  const team = await ensureAgentTeam();
  const agent = team[key];
  if (!agent?.id) throw new Error(`El agente ${key} no está disponible.`);

  const result = await createSavedAgentSession({
    agentId: agent.id,
    input: specialistPrompt({ mission, businessContext, task, specialistName: definition.name }),
  });

  return {
    key,
    name: definition.name,
    task,
    agentId: agent.id,
    sessionId: result.sessionId,
    result: extractJson(result.response),
  };
}

export async function synthesizeDirectorMission({ providerSessionId, mission, businessContext, plan, specialistResults }) {
  const result = await continueSavedAgentSession({
    sessionId: providerSessionId,
    input: synthesisPrompt({ mission, businessContext, plan, specialistResults }),
  });
  return { sessionId: result.sessionId, response: result.response };
}

export async function deleteAgentSession(providerSessionId) {
  if (!providerSessionId) return;
  await client.beta.agents.sessions.delete(providerSessionId);
}

export async function getAgentTeam() {
  return ensureAgentTeam();
}
