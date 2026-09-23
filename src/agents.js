import OpenAI from 'openai';
import { ensureAgentTeam, specialistDefinition, specialistKeys } from './team.js';
import { normalizeDirectorAction } from './autonomy.js';

if (!process.env.OPENAI_API_KEY) throw new Error('Falta OPENAI_API_KEY.');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const VALID_SPECIALIST_KEYS = new Set(specialistKeys());
const ACTION_MARKER = 'AGENTIC_ACTIONS_JSON:';
const MAX_SPECIALISTS_PER_MISSION = 4;
const ACTION_TYPES = [
  'market_research',
  'create_content_draft',
  'create_operation_task',
  'record_business_inputs',
  'materialize_development_recipe',
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

function isPilotMission(mission) {
  return /piloto|tanda|producir\s+\d+|hacer\s+\d+|cu[aá]nto.*compr|qu[eé].*compr|me\s+alcanza|ingrediente|receta|costo\s+por|precio\s+de\s+venta|precio\s+piloto|envase|ticket|factura|compr[eé]|pagu[eé]|stock/i.test(String(mission || ''));
}

function fallbackPlan(mission) {
  const text = String(mission || '').toLowerCase();
  const planned = [];
  const add = (key, task) => {
    if (!planned.some((item) => item.key === key)) planned.push({ key, task });
  };

  if (/mercado|compet|redes|instagram|tiktok|campañ|audien|tendencia|marketing|publicidad|comunicaci/.test(text)) add('market_growth', 'Analizar mercado, audiencia y oportunidad comercial relacionada con la misión.');
  if (/piloto|receta|sabor|producto|envase|presentaci|capa|textura|apertura|porci|tanda/.test(text)) add('product_experience', 'Usar la formulación de desarrollo vigente, escalarla al tamaño de piloto pedido y señalar qué debe validarse físicamente.');
  if (/piloto|costo|precio|margen|rentab|caja|inversi|equilibrio|ganancia|tecnolog|ticket|factura|pagu/.test(text)) add('finance_profitability', 'Calcular costo y economía del piloto sólo con precios y cantidades reales disponibles, dejando explícitos los costos faltantes.');
  if (/venta|cliente|pedido|conversi|recompra|ticket|consulta/.test(text)) add('sales_customers', 'Evaluar impacto comercial y comportamiento de clientes.');
  if (/piloto|stock|producci|capacidad|insumo|abaste|compra|comprar|compr[eé]|alcanza|faltante|envase|entrega|tanda/.test(text)) add('production_supply', 'Cruzar la formulación escalada con stock/compras reales y decir qué alcanza, qué falta y qué comprar, sin inventar disponibilidad.');
  if (/calidad|inocu|habilit|norma|regula|frío|trazab|rotulad|higiene|vida útil|conserv/.test(text)) add('quality_compliance', 'Evaluar riesgos de calidad, trazabilidad y cumplimiento.');
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
  const pilotRule = isPilotMission(mission)
    ? `\n\nREGLA ESPECIAL · PREPARAR PILOTO\nLa misión es operativa sobre un piloto. Si ESTADO VIGENTE DE MI NEGOCIO contiene desarrollo_ofertas, esa formulación de banco es la base existente y NO debés volver a inventar una receta desde cero. Delegá el escalado de formulación a Producto y Experiencia, el cruce de cantidades/compras/faltantes a Producción y Abastecimiento y el costeo/precio a Caja y Rentabilidad cuando existan datos económicos. Activá Calidad sólo cuando la misión necesite resolver inocuidad, conservación, cadena de frío, rotulado o una condición que pueda bloquear la prueba. El propietario debe aportar hechos del mundo físico; los agentes hacen las cuentas. Si el propietario aporta compras, stock, precios pagados o costos de insumos/envases, planificá usarlos como hechos reales y no como texto descartable.`
    : '';
  return `MODO PLAN\n\nESTADO VIGENTE DE MI NEGOCIO\n${businessContext}\n\nMISIÓN DEL PROPIETARIO\n${mission}\n\nElegí sólo especialistas cuyo trabajo pueda cambiar materialmente la decisión. Cada task debe ser concreta y no duplicar a otra especialidad. Evitá costo tecnológico innecesario. Activá como máximo ${MAX_SPECIALISTS_PER_MISSION} especialistas por misión. Antes de ampliar superficie funcional, aplicá el filtro de visión: cerrar un loop existente tiene prioridad sobre crear otra capa.${pilotRule}`;
}

function specialistPrompt({ mission, businessContext, task, specialistName }) {
  const pilotRule = isPilotMission(mission)
    ? `\n\nREGLA DE PILOTO\nUsá desarrollo_ofertas como definición previa del producto cuando corresponda. Si el propietario pide una cantidad distinta del rendimiento base, escalá matemáticamente las cantidades. No le pidas que calcule proporciones, costo unitario, faltantes o margen: hacé vos esas cuentas con los datos reales disponibles. Si una cifra necesaria no existe, devolvela como data_gap en vez de inventarla. Una formulación de banco sigue siendo de prueba y no equivale a producto aprobado para venta. Conservá exactamente los hechos reales de compra, stock o costo aportados por el propietario para que el Director pueda persistirlos.`
    : '';
  return `ESTADO VIGENTE DE MI NEGOCIO\n${businessContext}\n\nMISIÓN ORIGINAL DEL PROPIETARIO\n${mission}\n\nASIGNACIÓN DEL DIRECTOR PARA ${specialistName.toUpperCase()}\n${task}\n\nTrabajá sólo dentro de tu especialidad y respetá exactamente el esquema estructurado del agente.${pilotRule}`;
}

function synthesisPrompt({ mission, businessContext, plan, specialistResults }) {
  const evidence = specialistResults.map((item) => ({ key: item.key, name: item.name, task: item.task, result: item.result }));
  const pilotRule = isPilotMission(mission)
    ? `\n\nSALIDA OBLIGATORIA PARA PILOTO\nEl propietario no debe hacer las cuentas. Integrá los resultados y entregale, cuando la evidencia lo permita: (1) cantidad objetivo; (2) formulación escalada con cantidades concretas; (3) qué compras/stock alcanzan y qué falta; (4) lista de compra mínima; (5) costo conocido del lote y por unidad, separando costos faltantes; (6) precio o rango de prueba sólo si Caja y Rentabilidad lo fundamentó con costos suficientes, indicando margen; (7) instrucciones humanas ya disponibles, sin reescribir la receta técnica innecesariamente; (8) controles que todavía impiden tratar la formulación como producto comercial aprobado. Si falta un dato, pedí sólo el hecho físico mínimo —por ejemplo peso del envase, precio pagado o stock—, nunca un cálculo que pueda hacer el sistema. Reutilizá contexto_reciente cuando contenga hechos aportados por el propietario en misiones anteriores. Si la misión contiene hechos explícitos nuevos sobre compras, stock o costos, proponé record_business_inputs para que no se pierdan. Si se está preparando una oferta que tiene blueprint pero no receta operativa, proponé materialize_development_recipe para convertir esa formulación existente en receta draft, nunca approved.`
    : '';
  return `MODO SÍNTESIS\n\nESTADO VIGENTE DE MI NEGOCIO\n${businessContext}\n\nMISIÓN DEL PROPIETARIO\n${mission}\n\nPLAN DE DELEGACIÓN REAL\n${JSON.stringify(plan, null, 2)}\n\nRESULTADOS REALES DE LOS ESPECIALISTAS ACTIVADOS\n${JSON.stringify(evidence, null, 2)}\n\nIntegrá estos aportes. Si hay contradicciones, hacelas explícitas. En Especialistas activados mencioná exclusivamente los especialistas listados arriba.${pilotRule}\n\nREGLA DE EJECUCIÓN AGENTIC\nAdemás del texto para el propietario, proponé únicamente acciones concretas que el sistema pueda evaluar mediante políticas. No inventes IDs, disponibilidad, montos, métricas, fuentes, URLs, imágenes ni fechas. Si faltan datos para ejecutar con seguridad, no propongas la acción ejecutable: explicá el faltante en el texto. Tipos permitidos: ${ACTION_TYPES.join(', ')}.\n\nPara record_business_inputs usalo únicamente para hechos explícitos aportados por el propietario o ya persistidos como evidencia interna inequívoca. El payload debe ser {"items":[...]}. Cada item necesita name y unit; puede incluir quantity_added, unit_cost, total_cost, currency, source, observed_at y note. quantity_added representa stock real que entra a Mi Negocio; si sólo se informó un costo o cotización, usá quantity_added: 0 y unit_cost. Si usás total_cost sin unit_cost, necesitás quantity_added > 0 para derivar el costo unitario. No transformes un precio web, una inferencia ni una formulación sugerida en una compra real.\n\nPara materialize_development_recipe usalo sólo cuando desarrollo_ofertas contenga product_id y blueprint_id reales y el propietario esté preparando o validando esa oferta. El payload debe incluir product_id y blueprint_id. Esta acción materializa la formulación base como receta draft; jamás la marques test o approved ni la uses para declarar vida útil.\n\nPara market_research usalo únicamente cuando exista investigación suficiente para persistir un Descubrimiento de Producto real. El payload debe contener title, objective, scope, executive_summary, recommendation_notes, exactamente 3 candidates con rank 1, 2 y 3, y evidence. Cada candidato necesita rank, name y rationale; agregá concept, presentation, acceptance_score, acceptance_band, trend_strength, argentina_fit, visual_potential, production_complexity, conservation_risk y cost_complexity sólo cuando estén soportados. El orden es una hipótesis de aceptación comercial, nunca una garantía de ventas. Cada evidencia necesita candidate_rank, market_scope, source_name, source_url HTTPS real, source_type, evidence_type, claim, observed_at y confidence. Debe existir evidencia nacional e internacional y al menos una evidencia por candidato. Usá únicamente URLs reales recibidas de especialistas que hayan investigado con web_search. image_url e image_source_url son opcionales: si no existe una URL HTTPS directa y verificada, usá null. No inventes métricas de interacción ni ventas de competidores.\n\nPara create_operation_task el payload debe incluir product_id, quantity, due_at, title y opcionalmente priority, unit e instructions. Para create_content_draft debe incluir provider, content_type, concept, hook, body, call_to_action e hypothesis cuando estén disponibles.\nAl FINAL de tu respuesta, en una sola línea, agregá exactamente:\n${ACTION_MARKER}{"actions":[{"type":"market_research","title":"...","rationale":"...","confidence":0.0,"risk_level":"low","estimated_amount_ars":null,"payload":{}}]}\nSi no corresponde ninguna acción, usá ${ACTION_MARKER}{"actions":[]}. No escribas nada después de esa línea.`;
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
