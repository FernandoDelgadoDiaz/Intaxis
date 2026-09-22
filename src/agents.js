import OpenAI from 'openai';
import { ensureAgentTeam, specialistDefinition, specialistKeys } from './team.js';
import { normalizeDirectorAction } from './autonomy.js';

if (!process.env.OPENAI_API_KEY) throw new Error('Falta OPENAI_API_KEY.');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const VALID_SPECIALIST_KEYS = new Set(specialistKeys());
const ACTION_MARKER = 'AGENTIC_ACTIONS_JSON:';
const MAX_SPECIALISTS_PER_MISSION = 3;
const ACTION_TYPES = [
  'market_research',
  'create_content_draft',
  'create_operation_task',
  'reply_customer_routine',
  'create_order',
  'create_payment_link',
  'publish_content',
  'paid_ad_spend',
];

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

async function hydrateTurnUsage({ sessionId, turnId, usage }) {
  if (usage || !sessionId || !turnId) return usage || null;
  try {
    const turn = await client.beta.agents.sessions.turns.retrieve(turnId, { session_id: sessionId });
    return turn?.usage || null;
  } catch {
    return null;
  }
}

async function consume(events, initialId = null) {
  let sessionId = initialId;
  let response = '';
  let turnId = null;
  let usage = null;
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
        turnId = event?.turn?.id || turnId;
        usage = event?.turn?.usage || usage;
        break;
      }
    }
  } finally {
    events?.controller?.abort?.();
  }

  if (!response) throw new Error('El agente terminó sin respuesta final.');
  usage = await hydrateTurnUsage({ sessionId, turnId, usage });
  return { sessionId, response, turnId, usage };
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
          input: [{ role: 'user', content: [{ type: 'input_text', text: input }] }],
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

export function extractDirectorActions(text) {
  const raw = String(text || '');
  const markerIndex = raw.lastIndexOf(ACTION_MARKER);
  if (markerIndex < 0) return { response: raw.trim(), actions: [] };

  const response = raw.slice(0, markerIndex).trim();
  const encoded = raw.slice(markerIndex + ACTION_MARKER.length).trim();
  try {
    const parsed = extractJson(encoded);
    const actions = (Array.isArray(parsed?.actions) ? parsed.actions : [])
      .map(normalizeDirectorAction)
      .filter(Boolean)
      .slice(0, 5);
    return { response, actions };
  } catch {
    return { response, actions: [] };
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
  if (/costo|precio|margen|rentab|caja|inversi|equilibrio|ganancia|tecnolog/.test(text)) add('finance_profitability', 'Evaluar impacto económico, margen, costo tecnológico y sensibilidad.');
  if (/venta|cliente|pedido|conversi|recompra|ticket|consulta/.test(text)) add('sales_customers', 'Evaluar impacto comercial y comportamiento de clientes.');
  if (/stock|producci|capacidad|insumo|abaste|compra|envase|entrega|tanda/.test(text)) add('production_supply', 'Evaluar factibilidad operativa, stock, capacidad y abastecimiento.');
  if (/calidad|inocu|habilit|norma|regula|frío|trazab|rotulad|higiene/.test(text)) add('quality_compliance', 'Evaluar riesgos de calidad, trazabilidad y cumplimiento.');
  if (/evidencia|compar|contradic|fuente|validar|decisi|informe/.test(text)) add('information_decisions', 'Auditar evidencia, contradicciones y datos faltantes.');

  if (!planned.length) add('information_decisions', 'Determinar qué evidencia existe, qué falta y qué especialistas adicionales serían necesarios.');
  return { specialists: planned.slice(0, MAX_SPECIALISTS_PER_MISSION), rationale: 'Plan de contingencia determinístico porque el plan del Director no pudo interpretarse.' };
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
    return { specialists: deduped.slice(0, MAX_SPECIALISTS_PER_MISSION), rationale: String(parsed?.rationale || '').trim() };
  } catch {
    return fallbackPlan(mission);
  }
}

function planPrompt(mission, businessContext) {
  return `MODO PLAN\n\nESTADO VIGENTE DE MI NEGOCIO\n${businessContext}\n\nMISIÓN DEL PROPIETARIO\n${mission}\n\nElegí sólo especialistas cuyo trabajo pueda cambiar materialmente la decisión. Cada task debe ser concreta y no duplicar a otra especialidad. Evitá costo tecnológico innecesario. Activá como máximo ${MAX_SPECIALISTS_PER_MISSION} especialistas por misión.`;
}

function specialistPrompt({ mission, businessContext, task, specialistName }) {
  return `ESTADO VIGENTE DE MI NEGOCIO\n${businessContext}\n\nMISIÓN ORIGINAL DEL PROPIETARIO\n${mission}\n\nASIGNACIÓN DEL DIRECTOR PARA ${specialistName.toUpperCase()}\n${task}\n\nTrabajá sólo dentro de tu especialidad y respetá exactamente el esquema estructurado del agente.`;
}

function synthesisPrompt({ mission, businessContext, plan, specialistResults }) {
  const evidence = specialistResults.map((item) => ({ key: item.key, name: item.name, task: item.task, result: item.result }));
  return `MODO SÍNTESIS\n\nESTADO VIGENTE DE MI NEGOCIO\n${businessContext}\n\nMISIÓN DEL PROPIETARIO\n${mission}\n\nPLAN DE DELEGACIÓN REAL\n${JSON.stringify(plan, null, 2)}\n\nRESULTADOS REALES DE LOS ESPECIALISTAS ACTIVADOS\n${JSON.stringify(evidence, null, 2)}\n\nIntegrá estos aportes. Si hay contradicciones, hacelas explícitas. En Especialistas activados mencioná exclusivamente los especialistas listados arriba.\n\nREGLA DE EJECUCIÓN AGENTIC\nAdemás del texto para el propietario, proponé únicamente acciones concretas que el sistema pueda evaluar mediante políticas. No inventes IDs, disponibilidad, montos, métricas, fuentes, URLs, imágenes ni fechas. Si faltan datos para ejecutar con seguridad, no propongas la acción ejecutable: explicá el faltante en el texto. Tipos permitidos: ${ACTION_TYPES.join(', ')}.\n\nPara market_research usalo únicamente cuando exista investigación suficiente para persistir un Descubrimiento de Producto real. El payload debe contener title, objective, scope, executive_summary, recommendation_notes, exactamente 3 candidates con rank 1, 2 y 3, y evidence. Cada candidato necesita rank, name y rationale; agregá concept, presentation, acceptance_score, acceptance_band, trend_strength, argentina_fit, visual_potential, production_complexity, conservation_risk y cost_complexity sólo cuando estén soportados. El orden es una hipótesis de aceptación comercial, nunca una garantía de ventas. Cada evidencia necesita candidate_rank, market_scope, source_name, source_url HTTPS real, source_type, evidence_type, claim, observed_at y confidence. Debe existir evidencia nacional e internacional y al menos una evidencia por candidato. Usá únicamente URLs reales recibidas de especialistas que hayan investigado con web_search. image_url e image_source_url son opcionales: si no existe una URL HTTPS directa y verificada, usá null. No inventes métricas de interacción ni ventas de competidores.\n\nPara create_operation_task el payload debe incluir product_id, quantity, due_at, title y opcionalmente priority, unit e instructions. Para create_content_draft debe incluir provider, content_type, concept, hook, body, call_to_action e hypothesis cuando estén disponibles.\nAl FINAL de tu respuesta, en una sola línea, agregá exactamente:\n${ACTION_MARKER}{"actions":[{"type":"market_research","title":"...","rationale":"...","confidence":0.0,"risk_level":"low","estimated_amount_ars":null,"payload":{}}]}\nSi no corresponde ninguna acción, usá ${ACTION_MARKER}{"actions":[]}. No escribas nada después de esa línea.`;
}

export async function planDirectorMission({ providerSessionId, mission, businessContext }) {
  const team = await ensureAgentTeam();
  const result = providerSessionId
    ? await continueSavedAgentSession({ sessionId: providerSessionId, input: planPrompt(mission, businessContext) })
    : await createSavedAgentSession({ agentId: team.director.id, input: planPrompt(mission, businessContext) });

  return {
    sessionId: result.sessionId,
    turnId: result.turnId,
    usage: result.usage,
    model: team.director.model,
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
    model: agent.model,
    task,
    agentId: agent.id,
    sessionId: result.sessionId,
    turnId: result.turnId,
    usage: result.usage,
    result: extractJson(result.response),
  };
}

export async function synthesizeDirectorMission({ providerSessionId, mission, businessContext, plan, specialistResults }) {
  const team = await ensureAgentTeam();
  const result = await continueSavedAgentSession({
    sessionId: providerSessionId,
    input: synthesisPrompt({ mission, businessContext, plan, specialistResults }),
  });
  const parsed = extractDirectorActions(result.response);
  return {
    sessionId: result.sessionId,
    turnId: result.turnId,
    usage: result.usage,
    model: team.director.model,
    response: parsed.response,
    actions: parsed.actions,
  };
}

export async function deleteAgentSession(providerSessionId) {
  if (!providerSessionId) return;
  await client.beta.agents.sessions.delete(providerSessionId);
}

export async function getAgentTeam() {
  return ensureAgentTeam();
}
