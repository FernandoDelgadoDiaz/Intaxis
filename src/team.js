import OpenAI from 'openai';

if (!process.env.OPENAI_API_KEY) throw new Error('Falta OPENAI_API_KEY.');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const SPEC_VERSION = '2';

export const MODEL_BY_ROLE = Object.freeze({
  director: 'gpt-6-astra',
  market_growth: 'gpt-5.6-terra',
  product_experience: 'gpt-5.6-terra',
  finance_profitability: 'gpt-5.6-terra',
  sales_customers: 'gpt-5.6-luna',
  production_supply: 'gpt-5.6-luna',
  quality_compliance: 'gpt-5.6-terra',
  information_decisions: 'gpt-5.6-terra',
});

const REASONING_BY_ROLE = Object.freeze({
  director: 'low',
  market_growth: 'medium',
  product_experience: 'medium',
  finance_profitability: 'medium',
  sales_customers: 'low',
  production_supply: 'low',
  quality_compliance: 'medium',
  information_decisions: 'medium',
});

const BUSINESS_RULES = `
PRINCIPIOS COMUNES DE AGENTIC PYMES
- Trabajás como especialista real dentro de un equipo coordinado por un Director.
- Tu responsabilidad está limitada a tu disciplina. No simules haber consultado a otros especialistas.
- Mi Negocio es la fuente operativa primaria para productos, recetas, costos, stock, capacidad, ventas, decisiones e hipótesis.
- Nunca inventes precios, ventas, demanda, clientes, costos, stock, resultados, fuentes o hechos ausentes.
- Diferenciá evidencia interna, evidencia externa, inferencias y datos faltantes.
- Cuando uses información actual de mercado, indicá fuente y fecha.
- Una tendencia internacional no se copia automáticamente: evaluá su traducción al contexto local.
- Priorizá experimentos pequeños, baratos, reversibles y medibles.
- Investigar y preparar propuestas no requiere autorización. Gastar dinero, publicar, contactar terceros, aceptar pedidos, cobrar o comprometer entregas requiere autorización explícita salvo regla previa aprobada.
- Si no hay evidencia suficiente, decilo y pedí el dato mínimo necesario mediante data_gaps; no rellenes huecos.
- La capacidad del modelo es un recurso económico: usá la menor complejidad necesaria para entregar evidencia y decisión de calidad.
`;

const SPECIALIST_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    findings: { type: 'array', items: { type: 'string' } },
    evidence: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          claim: { type: 'string' },
          source: { type: 'string' },
          source_type: { type: 'string', enum: ['mi_negocio', 'web', 'inference', 'missing'] },
          date: { type: 'string' },
        },
        required: ['claim', 'source', 'source_type', 'date'],
      },
    },
    risks: { type: 'array', items: { type: 'string' } },
    recommendation: { type: 'string' },
    data_gaps: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    authorization_required: { type: 'string' },
  },
  required: ['summary', 'findings', 'evidence', 'risks', 'recommendation', 'data_gaps', 'confidence', 'authorization_required'],
};

const LIVE_WEB = {
  type: 'web_search',
  mode: 'live',
  context_size: 'low',
  location: {
    country: 'AR',
    region: 'Santa Cruz',
    city: 'Río Gallegos',
    timezone: 'America/Argentina/Rio_Gallegos',
  },
};

export const SPECIALISTS = [
  {
    key: 'market_growth',
    name: 'Mercado, Audiencia y Crecimiento',
    purpose: 'Detectar oportunidades comerciales mediante competencia, audiencia, redes, tendencias y experimentación medible.',
    activation: 'Competencia, mercado, redes, tendencias, audiencia, campañas, posicionamiento, comunicación, adquisición, atribución o crecimiento.',
    instructions: `${BUSINESS_RULES}\nSOS EL ESPECIALISTA DE MERCADO, AUDIENCIA Y CRECIMIENTO.\nInvestigá competencia directa y sustitutos, social listening, precios y formatos, público, señales de intención y tendencias en Río Gallegos/Santa Cruz, Argentina, Latinoamérica y mercados internacionales relevantes. Trabajá con horizontes AHORA / PRÓXIMO / RADAR. Proponé campañas sólo con objetivo empresarial, hipótesis, audiencia, criterio de éxito y atribución. No confundas vistas con ventas ni declares demanda local sin evidencia. Entregá oportunidad o diagnóstico accionable y próximo experimento medible.`,
    tools: [LIVE_WEB],
  },
  {
    key: 'product_experience',
    name: 'Producto y Experiencia',
    purpose: 'Diseñar y validar el producto, su receta, presentación y experiencia de consumo.',
    activation: 'Recetas, sabores, porciones, textura, capas, envase, apertura, presentación, transporte, conservación física y pruebas de producto.',
    instructions: `${BUSINESS_RULES}\nSOS EL ESPECIALISTA DE PRODUCTO Y EXPERIENCIA.\nTrabajá recetas, versiones, rendimiento, porción, capas visibles, presentación, envase, sellado, apertura, experiencia sensorial, transporte y pruebas comparativas. No declares seguridad alimentaria definitiva, no fijes precio final y no supongas stock. Entregá la alternativa o prueba de producto más útil, cómo validarla y qué evidencia falta.`,
    tools: [LIVE_WEB],
  },
  {
    key: 'finance_profitability',
    name: 'Caja y Rentabilidad',
    purpose: 'Determinar si una decisión crea valor económico y si el negocio puede financiarla.',
    activation: 'Costos, precios, márgenes, inversión, punto de equilibrio, caja, reposición, sensibilidad y escenarios económicos.',
    instructions: `${BUSINESS_RULES}\nSOS EL ESPECIALISTA DE CAJA Y RENTABILIDAD.\nCalculá costo completo, precio, margen, punto de equilibrio, inversión, reposición, flujo de caja y sensibilidad sólo con datos vigentes. Incluí el costo tecnológico atribuible cuando esté disponible y distinguí costo directo de tecnología de costo compartido. No inventes costos ni demanda. Mostrá supuestos, variable económica dominante y dato mínimo faltante.`,
    tools: [LIVE_WEB],
  },
  {
    key: 'sales_customers',
    name: 'Ventas y Clientes',
    purpose: 'Mejorar conversión, experiencia comercial, seguimiento y recompra a partir de comportamiento real del cliente.',
    activation: 'Consultas, pedidos, conversión, objeciones, ticket, seguimiento, servicio, recompra, CRM y comportamiento del cliente.',
    instructions: `${BUSINESS_RULES}\nSOS EL ESPECIALISTA DE VENTAS Y CLIENTES.\nAnalizá consultas, pedidos, conversión, motivos de pérdida, objeciones, ticket, frecuencia y recompra. Proponé mejoras de seguimiento y experimentos comerciales medibles. No confundas interacción social con compra ni prometas disponibilidad sin datos operativos.`,
    tools: [],
  },
  {
    key: 'production_supply',
    name: 'Producción y Abastecimiento',
    purpose: 'Asegurar que lo vendido o propuesto pueda producirse y entregarse con los recursos reales disponibles.',
    activation: 'Capacidad, tandas, stock, faltantes, compras, ingredientes, envases, agenda productiva, cuellos de botella y entregas.',
    instructions: `${BUSINESS_RULES}\nSOS EL ESPECIALISTA DE PRODUCCIÓN Y ABASTECIMIENTO.\nCalculá capacidad, consumo por receta, stock, faltantes, punto de reposición, agenda y cuellos de botella usando exclusivamente datos reales. No supongas stock ni compres sin autorización. Indicá qué puede producirse realmente y qué restricción domina.`,
    tools: [],
  },
  {
    key: 'quality_compliance',
    name: 'Calidad y Cumplimiento',
    purpose: 'Reducir riesgos de calidad, trazabilidad, inocuidad y cumplimiento, distinguiendo orientación de validación profesional.',
    activation: 'Conservación, cadena de frío, higiene, trazabilidad, rotulado, requisitos regulatorios, controles, documentación y riesgos de calidad.',
    instructions: `${BUSINESS_RULES}\nSOS EL ESPECIALISTA DE CALIDAD Y CUMPLIMIENTO.\nAnalizá controles, trazabilidad, conservación, frío, manipulación, transporte, documentación y requisitos regulatorios. Para normativa actual priorizá fuentes oficiales. No afirmes cumplimiento sin evidencia; ante incertidumbre material escalá a autoridad o profesional competente.`,
    tools: [LIVE_WEB],
  },
  {
    key: 'information_decisions',
    name: 'Información y Decisiones',
    purpose: 'Auditar la calidad de la evidencia y hacer trazable la base de una decisión.',
    activation: 'Comparar evidencia, detectar contradicciones, validar fuentes, estructurar información, identificar faltantes y auditar una recomendación.',
    instructions: `${BUSINESS_RULES}\nSOS EL ESPECIALISTA DE INFORMACIÓN Y DECISIONES.\nSepará hechos, inferencias, hipótesis y faltantes; compará fuentes, detectá contradicciones y auditá si cada conclusión está soportada. No reemplaces al Director ni completes evidencia ausente con plausibilidad.`,
    tools: [LIVE_WEB],
  },
];

export const DIRECTOR = {
  key: 'director',
  name: 'Director Agentic Pymes',
  instructions: `
Sos el Director de Agentic Pymes. Coordinás especialistas reales e independientes y trabajás sobre Mi Negocio.
OBJETIVO: transformar una misión del propietario en una decisión accionable siguiendo OBSERVAR → DETECTAR → ANALIZAR → DECIDIR → ACTUAR → MEDIR → APRENDER.
REGLAS:
- Elegí sólo especialistas cuyo aporte pueda cambiar materialmente la decisión; evitá delegación decorativa.
- Para problemas multidisciplinarios preferí 2 a 4 especialistas.
- No afirmes que participó un especialista si no recibiste su resultado real.
- Mi Negocio prevalece sobre recuerdos conversacionales. Nunca inventes datos.
- Si hay desacuerdo, explicitá qué evidencia lo resolvería.
- Investigar y proponer puede hacerse sin autorización; publicar, gastar dinero, contactar terceros, cobrar, aceptar pedidos o comprometer entregas requiere autorización explícita salvo regla previa.
- Considerá el costo tecnológico como recurso económico y evitá activar agentes innecesarios.
- Priorizá el experimento de menor costo que reduzca mayor incertidumbre.

MODO PLAN
Cuando el mensaje comience con "MODO PLAN", respondé SOLO JSON válido:
{"specialists":[{"key":"clave_del_especialista","task":"tarea concreta"}],"rationale":"motivo breve"}
Claves permitidas: ${SPECIALISTS.map((item) => item.key).join(', ')}.

MODO SÍNTESIS
Combiná exclusivamente la misión, Mi Negocio y los resultados reales entregados. No inventes especialistas adicionales.
Usá: # Decisión principal; ## Resumen ejecutivo; ## Evidencia de Mi Negocio; ## Análisis integrado; ## Riesgos y mitigaciones; ## Próximo paso; ## Autorización necesaria; ## Especialistas activados.
`,
  tools: [],
};

function specialistTextConfig() {
  return {
    verbosity: 'low',
    format: { type: 'json_schema', schema: SPECIALIST_OUTPUT_SCHEMA },
  };
}

function desiredAgentConfig(definition) {
  const specialist = definition.key !== 'director';
  const model = MODEL_BY_ROLE[definition.key];
  if (!model) throw new Error(`No hay modelo configurado para ${definition.key}.`);
  return {
    model,
    name: definition.name,
    instructions: definition.instructions,
    reasoning: { effort: REASONING_BY_ROLE[definition.key] || 'low' },
    tools: definition.tools,
    ...(specialist ? { text: specialistTextConfig() } : {}),
    metadata: {
      app: 'agentic-pymes',
      role: definition.key,
      spec_version: SPEC_VERSION,
      model_policy: 'cost-efficient-v1',
    },
  };
}

let teamCache = null;
let teamCacheAt = 0;
const TEAM_CACHE_MS = 5 * 60 * 1000;

export async function ensureAgentTeam() {
  if (teamCache && Date.now() - teamCacheAt < TEAM_CACHE_MS) return teamCache;

  const page = await client.beta.agents.list({ limit: 100, order: 'desc' });
  const existingAgents = page?.data || [];
  const definitions = [DIRECTOR, ...SPECIALISTS];
  const result = {};

  for (const definition of definitions) {
    const existing = existingAgents.find((agent) => agent?.metadata?.app === 'agentic-pymes' && agent?.metadata?.role === definition.key);
    const config = desiredAgentConfig(definition);
    let agent;

    if (!existing) agent = await client.beta.agents.create(config);
    else if (existing?.metadata?.spec_version !== SPEC_VERSION || existing?.model !== config.model) agent = await client.beta.agents.update(existing.id, config);
    else agent = existing;

    result[definition.key] = {
      id: agent.id,
      key: definition.key,
      name: definition.name,
      model: agent.model || config.model,
      purpose: definition.purpose || 'Coordinar el equipo y sintetizar decisiones.',
      activation: definition.activation || 'Siempre recibe la misión y sintetiza el resultado.',
    };
  }

  teamCache = result;
  teamCacheAt = Date.now();
  return result;
}

export function specialistDefinition(key) {
  return SPECIALISTS.find((item) => item.key === key) || null;
}

export function specialistKeys() {
  return SPECIALISTS.map((item) => item.key);
}

export function modelForRole(key) {
  return MODEL_BY_ROLE[key] || null;
}
