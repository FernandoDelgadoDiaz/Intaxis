import { getAgentTeam, runSpecialist } from './agents.js';
import { contextForAgent, loadBusinessSnapshot } from './business-context.js';
import { estimateModelCostUsd, normalizeUsage, PRICING_VERSION, sumKnownCosts } from './ai-cost.js';

const PRODUCT_MARKER = 'DEVELOPMENT_JSON:';
const PRODUCTION_MARKER = 'PRODUCTION_REVIEW_JSON:';
const QUALITY_MARKER = 'QUALITY_REVIEW_JSON:';
const clean = (value) => String(value ?? '').trim();
const asArray = (value) => Array.isArray(value) ? value : [];
const asObject = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const validBand = (value) => ['low', 'medium', 'high'].includes(value) ? value : null;

function markedJson(text, marker) {
  const raw = clean(text);
  const index = raw.indexOf(marker);
  if (index < 0) throw new Error(`El especialista no entregó ${marker}`);
  const candidate = raw.slice(index + marker.length).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1));
    throw new Error(`La salida ${marker} no contiene JSON válido.`);
  }
}

function uniqueStrings(...groups) {
  return [...new Set(groups.flatMap((group) => asArray(group).map(clean).filter(Boolean)))];
}

function numberOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function normalizedComponents(value) {
  return asArray(value).map((item) => {
    const row = asObject(item);
    return {
      name: clean(row.name),
      quantity: numberOrNull(row.quantity),
      unit: clean(row.unit) || null,
      role: clean(row.role) || null,
      notes: clean(row.notes) || null,
    };
  }).filter((item) => item.name);
}

function normalizedSteps(value) {
  return asArray(value).map((item, index) => {
    const row = asObject(item);
    return {
      step: Number.isFinite(Number(row.step)) ? Number(row.step) : index + 1,
      instruction: clean(row.instruction || row.description),
      duration_minutes: numberOrNull(row.duration_minutes),
      control: clean(row.control) || null,
    };
  }).filter((item) => item.instruction);
}

async function recordUsage({ supabase, businessId, agentRunId, specialistRunId, roleKey, model, result }) {
  const normalized = normalizeUsage(result?.usage);
  const estimate = estimateModelCostUsd(model, result?.usage);
  const row = {
    business_id: businessId,
    agent_run_id: agentRunId,
    specialist_run_id: specialistRunId,
    role_key: roleKey,
    phase: 'specialist',
    model,
    openai_session_id: result?.sessionId || null,
    openai_turn_id: result?.turnId || null,
    input_tokens: normalized?.inputTokens ?? null,
    cached_input_tokens: normalized?.cachedInputTokens ?? null,
    output_tokens: normalized?.outputTokens ?? null,
    reasoning_tokens: normalized?.reasoningTokens ?? null,
    total_tokens: normalized?.totalTokens ?? null,
    estimated_model_cost_usd: estimate?.estimatedModelCostUsd ?? null,
    usage_available: Boolean(normalized),
    pricing_version: PRICING_VERSION,
  };
  const inserted = await supabase.from('ai_usage_events').insert(row);
  if (inserted.error) throw inserted.error;
  return { usageAvailable: Boolean(normalized), estimatedModelCostUsd: estimate?.estimatedModelCostUsd ?? null };
}

async function tracedSpecialist({ supabase, business, agentRunId, key, task, mission, businessContext }) {
  const team = await getAgentTeam();
  const specialist = team[key];
  if (!specialist?.id) throw new Error(`El especialista ${key} no está disponible.`);

  const trace = await supabase.from('specialist_runs').insert({
    business_id: business.id,
    agent_run_id: agentRunId,
    specialist_key: key,
    specialist_name: specialist.name,
    openai_agent_id: specialist.id,
    model: specialist.model,
    assigned_task: task,
    status: 'running',
  }).select('*').single();
  if (trace.error) throw trace.error;

  try {
    const result = await runSpecialist({ key, task, mission, businessContext });
    const cost = await recordUsage({
      supabase,
      businessId: business.id,
      agentRunId,
      specialistRunId: trace.data.id,
      roleKey: key,
      model: result.model || specialist.model,
      result,
    });
    const completed = await supabase.from('specialist_runs').update({
      openai_session_id: result.sessionId,
      openai_turn_id: result.turnId,
      model: result.model || specialist.model,
      result: result.result,
      estimated_model_cost_usd: cost.estimatedModelCostUsd,
      usage_available: cost.usageAvailable,
      status: 'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', trace.data.id);
    if (completed.error) throw completed.error;
    return { ...result, ...cost };
  } catch (error) {
    await supabase.from('specialist_runs').update({
      status: 'failed',
      error_message: String(error?.message || error).slice(0, 2000),
      completed_at: new Date().toISOString(),
    }).eq('id', trace.data.id);
    throw error;
  }
}

async function setDevelopmentStage(supabase, businessId, discoveryRunId, values) {
  const result = await supabase.from('product_discovery_runs').update({
    ...values,
    updated_at: new Date().toISOString(),
  }).eq('business_id', businessId).eq('id', discoveryRunId);
  if (result.error) throw result.error;
}

async function selectedDiscovery(supabase, businessId, discoveryRunId) {
  const runResult = await supabase.from('product_discovery_runs').select('*')
    .eq('business_id', businessId).eq('id', discoveryRunId).maybeSingle();
  if (runResult.error) throw runResult.error;
  if (!runResult.data || runResult.data.status !== 'approved') throw new Error('La selección todavía no está aprobada.');

  const candidatesResult = await supabase.from('product_discovery_candidates').select('*')
    .eq('business_id', businessId).eq('discovery_run_id', discoveryRunId).eq('status', 'selected').order('rank');
  if (candidatesResult.error) throw candidatesResult.error;
  const candidates = candidatesResult.data || [];
  if (!candidates.length) throw new Error('No hay oportunidades seleccionadas para desarrollar.');

  const evidenceResult = await supabase.from('product_discovery_evidence').select('*')
    .eq('business_id', businessId).eq('discovery_run_id', discoveryRunId).order('created_at');
  if (evidenceResult.error) throw evidenceResult.error;
  return { run: runResult.data, candidates, evidence: evidenceResult.data || [] };
}

function productTask(candidates) {
  return `FLUJO INTERNO: DESARROLLO DE OPORTUNIDADES SELECCIONADAS. Desarrollá las ${candidates.length} oportunidades seleccionadas, una por una, sin cambiar su identidad ni inventar datos comerciales. Para cada una definí una oferta técnicamente realizable y comparable. Si el vertical es alimentos, prepará una receta de trabajo con cantidades, unidades, rendimiento, porción, instrucciones paso a paso, presentación/envase, supuestos y datos faltantes; podés investigar fuentes actuales con web_search para formulación y técnica. No fijes vida útil ni seguridad alimentaria definitiva: eso lo revisa Calidad. No inventes costos, stock ni capacidad. En el campo recommendation respondé SOLAMENTE con ${PRODUCT_MARKER}{"candidates":[{"candidate_id":"UUID exacto","candidate_name":"...","offer_definition":"...","unit_or_scope":"...","portion_grams":null,"yield_units":null,"components":[{"name":"...","quantity":null,"unit":null,"role":null,"notes":null}],"process_steps":[{"step":1,"instruction":"...","duration_minutes":null,"control":null}],"packaging":{"format":"...","requirements":[]},"operating_conditions":{},"quality_controls":[],"allergens":[],"cost_inputs_required":[],"assumptions":[],"data_gaps":[]}]} y nada más en recommendation. Conservá exactamente estos IDs: ${candidates.map((item) => `${item.id}=${item.name}`).join(' | ')}.`;
}

function productionTask(candidates, productResult) {
  return `FLUJO INTERNO: REVISIÓN OPERATIVA SECUENCIAL. Revisá las definiciones de Producto recibidas abajo para las oportunidades seleccionadas. No rediseñes el producto salvo que haya una imposibilidad operativa clara. Evaluá recursos, secuencia, tiempos, cuellos de botella, escalabilidad artesanal, abastecimiento y datos faltantes. No inventes stock, capacidad ni costos. En recommendation respondé SOLAMENTE con ${PRODUCTION_MARKER}{"reviews":[{"candidate_id":"UUID exacto","production_complexity":"low|medium|high|null","resources":[],"process_steps":[],"operating_conditions":{},"bottlenecks":[],"changes":[],"cost_inputs_required":[],"data_gaps":[]}]} y nada más en recommendation. IDs válidos: ${candidates.map((item) => item.id).join(', ')}. RESULTADO DE PRODUCTO: ${JSON.stringify(productResult)}`;
}

function qualityTask(candidates, productResult, productionResult) {
  return `FLUJO INTERNO: REVISIÓN DE CALIDAD Y CUMPLIMIENTO. Revisá candidato por candidato usando el trabajo de Producto y Producción. Para alimentos, priorizá fuentes oficiales actuales para inocuidad, conservación, cadena de frío, alérgenos y rotulado. No declares una vida útil específica si no puede sustentarse: usá validation_required. No afirmes cumplimiento definitivo sin evidencia. En recommendation respondé SOLAMENTE con ${QUALITY_MARKER}{"reviews":[{"candidate_id":"UUID exacto","conservation_risk":"low|medium|high|null","conservation":{"storage_temperature":null,"shelf_life":"validation_required","transport":null,"handling":null},"allergens":[],"quality_controls":[],"compliance_notes":[],"changes":[],"data_gaps":[]}]} y nada más en recommendation. IDs válidos: ${candidates.map((item) => item.id).join(', ')}. PRODUCTO: ${JSON.stringify(productResult)} PRODUCCIÓN: ${JSON.stringify(productionResult)}`;
}

function validateCandidatePayload(payload, selectedIds) {
  const rows = asArray(payload?.candidates);
  if (rows.length !== selectedIds.size) throw new Error('Producto no devolvió una definición para cada oportunidad seleccionada.');
  const ids = rows.map((item) => clean(item?.candidate_id));
  if (new Set(ids).size !== ids.length || ids.some((id) => !selectedIds.has(id))) {
    throw new Error('Producto devolvió IDs de oportunidades inválidos o duplicados.');
  }
  return rows;
}

function reviewsByCandidate(payload, marker, selectedIds) {
  const rows = asArray(payload?.reviews);
  const map = new Map();
  for (const item of rows) {
    const id = clean(item?.candidate_id);
    if (!selectedIds.has(id) || map.has(id)) continue;
    map.set(id, asObject(item));
  }
  if (!map.size) throw new Error(`${marker} no contiene revisiones válidas.`);
  return map;
}

function mergeBlueprint({ base, production, quality, candidate, agentRunId, reviews }) {
  const components = normalizedComponents(base.components);
  const baseSteps = normalizedSteps(base.process_steps);
  const productionSteps = normalizedSteps(production?.process_steps);
  const processSteps = productionSteps.length ? productionSteps : baseSteps;
  const conservation = asObject(quality?.conservation);
  const resources = asArray(production?.resources).length ? asArray(production.resources) : components;
  const qualityControls = uniqueStrings(base.quality_controls, quality?.quality_controls);
  const dataGaps = uniqueStrings(base.data_gaps, production?.data_gaps, quality?.data_gaps);
  const costInputs = uniqueStrings(base.cost_inputs_required, production?.cost_inputs_required);
  const assumptions = uniqueStrings(base.assumptions);
  const packaging = asObject(base.packaging);

  return {
    business_id: candidate.business_id,
    candidate_id: candidate.id,
    portion_grams: numberOrNull(base.portion_grams),
    yield_units: numberOrNull(base.yield_units),
    ingredients: components,
    instructions: processSteps,
    conservation,
    allergens: uniqueStrings(base.allergens, quality?.allergens),
    packaging,
    quality_notes: [clean(quality?.compliance_notes?.join?.(' · ')), dataGaps.length ? `Pendientes: ${dataGaps.join(' · ')}` : ''].filter(Boolean).join('\n'),
    approval_status: 'review',
    offer_definition: {
      summary: clean(base.offer_definition),
      unit_or_scope: clean(base.unit_or_scope) || null,
      candidate_name: candidate.name,
      assumptions,
      data_gaps: dataGaps,
    },
    resources,
    process_steps: processSteps,
    operating_conditions: {
      ...asObject(base.operating_conditions),
      ...asObject(production?.operating_conditions),
      ...asObject(quality?.operating_conditions),
    },
    quality_controls: qualityControls,
    costing: {
      status: 'pending_real_inputs',
      required_inputs: costInputs,
      note: 'Caja y Rentabilidad debe usar costos reales y trazables antes de calcular precio o margen.',
    },
    specialist_reviews: reviews,
    source_agent_run_id: agentRunId,
    development_status: dataGaps.length ? 'needs_data' : 'review',
    updated_at: new Date().toISOString(),
  };
}

export async function processSelectedOpportunityDevelopment({ supabase, business, discoveryRunId, agentRunId }) {
  const claim = await supabase.from('agent_runs').update({ status: 'running' })
    .eq('id', agentRunId).eq('business_id', business.id).eq('status', 'queued').select('*').maybeSingle();
  if (claim.error) {
    if (claim.error.code === '23505') return { busy: true, agentRunId };
    throw claim.error;
  }
  if (!claim.data) return { skipped: true, agentRunId };

  const costs = [];
  let partial = false;
  try {
    const current = await selectedDiscovery(supabase, business.id, discoveryRunId);
    const selectedIds = new Set(current.candidates.map((item) => item.id));
    const snapshot = await loadBusinessSnapshot(supabase, business.id);
    const baseContext = contextForAgent(business, snapshot);
    const evidence = current.evidence.map((item) => ({
      candidate_id: item.candidate_id,
      market_scope: item.market_scope,
      country: item.country,
      source_name: item.source_name,
      source_url: item.source_url,
      claim: item.claim,
      observed_at: item.observed_at,
      confidence: item.confidence,
    }));
    const workflowContext = `${baseContext}\n\nOPORTUNIDADES SELECCIONADAS\n${JSON.stringify(current.candidates, null, 2)}\n\nEVIDENCIA DE DESCUBRIMIENTO\n${JSON.stringify(evidence, null, 2)}`;
    const mission = `Desarrollar técnicamente oportunidades seleccionadas de ${business.name}. Flujo interno sin efectos externos. discovery_run_id=${discoveryRunId}`;

    await setDevelopmentStage(supabase, business.id, discoveryRunId, {
      development_status: 'running',
      development_stage: 'product_design',
      development_started_at: new Date().toISOString(),
      development_error_message: null,
    });

    const product = await tracedSpecialist({
      supabase, business, agentRunId,
      key: 'product_experience',
      task: productTask(current.candidates),
      mission,
      businessContext: workflowContext,
    });
    costs.push(product);
    const productPayload = markedJson(product.result?.recommendation, PRODUCT_MARKER);
    const baseRows = validateCandidatePayload(productPayload, selectedIds);
    const baseById = new Map(baseRows.map((item) => [clean(item.candidate_id), asObject(item)]));

    await setDevelopmentStage(supabase, business.id, discoveryRunId, { development_stage: 'production_review' });
    let production = null;
    let productionReviews = new Map();
    try {
      production = await tracedSpecialist({
        supabase, business, agentRunId,
        key: 'production_supply',
        task: productionTask(current.candidates, product.result),
        mission,
        businessContext: workflowContext,
      });
      costs.push(production);
      productionReviews = reviewsByCandidate(markedJson(production.result?.recommendation, PRODUCTION_MARKER), PRODUCTION_MARKER, selectedIds);
    } catch (error) {
      partial = true;
      production = { error: String(error?.message || error), result: null, usageAvailable: false, estimatedModelCostUsd: null };
    }

    await setDevelopmentStage(supabase, business.id, discoveryRunId, { development_stage: 'quality_review' });
    let quality = null;
    let qualityReviews = new Map();
    try {
      quality = await tracedSpecialist({
        supabase, business, agentRunId,
        key: 'quality_compliance',
        task: qualityTask(current.candidates, product.result, production?.result || production),
        mission,
        businessContext: workflowContext,
      });
      costs.push(quality);
      qualityReviews = reviewsByCandidate(markedJson(quality.result?.recommendation, QUALITY_MARKER), QUALITY_MARKER, selectedIds);
    } catch (error) {
      partial = true;
      quality = { error: String(error?.message || error), result: null, usageAvailable: false, estimatedModelCostUsd: null };
    }

    await setDevelopmentStage(supabase, business.id, discoveryRunId, { development_stage: 'persisting' });
    const rows = current.candidates.map((candidate) => {
      const base = baseById.get(candidate.id);
      if (!base) throw new Error(`Falta definición base para ${candidate.name}.`);
      const productionReview = productionReviews.get(candidate.id) || {};
      const qualityReview = qualityReviews.get(candidate.id) || {};
      return mergeBlueprint({
        base,
        production: productionReview,
        quality: qualityReview,
        candidate,
        agentRunId,
        reviews: {
          product_experience: product.result,
          production_supply: production?.result || { error: production?.error || 'Sin revisión estructurada.' },
          quality_compliance: quality?.result || { error: quality?.error || 'Sin revisión estructurada.' },
        },
      });
    });

    const upsert = await supabase.from('product_discovery_blueprints').upsert(rows, { onConflict: 'candidate_id' }).select('id,candidate_id,development_status');
    if (upsert.error) throw upsert.error;

    for (const candidate of current.candidates) {
      const productionReview = productionReviews.get(candidate.id) || {};
      const qualityReview = qualityReviews.get(candidate.id) || {};
      const patch = {};
      const productionBand = validBand(productionReview.production_complexity);
      const conservationBand = validBand(qualityReview.conservation_risk);
      if (productionBand) patch.production_complexity = productionBand;
      if (conservationBand) patch.conservation_risk = conservationBand;
      if (Object.keys(patch).length) {
        patch.updated_at = new Date().toISOString();
        const update = await supabase.from('product_discovery_candidates').update(patch)
          .eq('business_id', business.id).eq('id', candidate.id);
        if (update.error) throw update.error;
      }
    }

    const estimatedModelCostUsd = sumKnownCosts(costs);
    const usageComplete = costs.length === 3 && costs.every((item) => item.usageAvailable === true);
    const finalStatus = partial ? 'partial' : 'completed';
    await setDevelopmentStage(supabase, business.id, discoveryRunId, {
      development_status: finalStatus,
      development_stage: 'completed',
      development_completed_at: new Date().toISOString(),
      development_error_message: partial ? 'Una revisión especialista quedó incompleta; las fichas conservan esa limitación.' : null,
    });

    const complete = await supabase.from('agent_runs').update({
      result_summary: `Desarrollo técnico ${finalStatus}: ${rows.length} oportunidades con ficha comparable.`,
      estimated_model_cost_usd: estimatedModelCostUsd,
      usage_complete: usageComplete,
      status: 'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', agentRunId);
    if (complete.error) throw complete.error;

    return { status: finalStatus, blueprints: upsert.data || [], estimatedModelCostUsd, usageComplete };
  } catch (error) {
    await setDevelopmentStage(supabase, business.id, discoveryRunId, {
      development_status: 'failed',
      development_stage: 'error',
      development_completed_at: new Date().toISOString(),
      development_error_message: String(error?.message || error).slice(0, 2000),
    }).catch(() => {});
    await supabase.from('agent_runs').update({
      status: 'failed',
      error_message: String(error?.message || error).slice(0, 2000),
      completed_at: new Date().toISOString(),
    }).eq('id', agentRunId);
    throw error;
  }
}
