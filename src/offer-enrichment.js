import OpenAI from 'openai';
import { getAgentTeam, runSpecialist } from './agents.js';
import { contextForAgent, loadBusinessSnapshot } from './business-context.js';
import { estimateModelCostUsd, normalizeUsage, PRICING_VERSION, sumKnownCosts } from './ai-cost.js';

const VISUAL_MARKER = 'VISUAL_STRATEGY_JSON:';
const HUMAN_MARKER = 'HUMAN_INSTRUCTIONS_JSON:';
const QUALITY_MARKER = 'QUALITY_REVIEW_JSON:';
const IMAGE_MODEL = 'gpt-image-2';
const MEDIA_BUCKET = 'business-offer-media';
const clean = (value) => String(value ?? '').trim();
const asArray = (value) => Array.isArray(value) ? value : [];
const asObject = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

function validHttps(value) {
  const text = clean(value);
  return /^https:\/\//i.test(text) ? text : null;
}

function uniqueStrings(...groups) {
  return [...new Set(groups.flatMap((group) => asArray(group).map(clean).filter(Boolean)))];
}

async function recordUsage({ supabase, businessId, agentRunId, specialistRunId, roleKey, model, result }) {
  const normalized = normalizeUsage(result?.usage);
  const estimate = estimateModelCostUsd(model, result?.usage);
  const inserted = await supabase.from('ai_usage_events').insert({
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
  });
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

async function setStage(supabase, businessId, discoveryRunId, values) {
  const result = await supabase.from('product_discovery_runs').update({
    ...values,
    updated_at: new Date().toISOString(),
  }).eq('business_id', businessId).eq('id', discoveryRunId);
  if (result.error) throw result.error;
}

async function loadCurrent(supabase, businessId, discoveryRunId) {
  const runResult = await supabase.from('product_discovery_runs').select('*')
    .eq('business_id', businessId).eq('id', discoveryRunId).maybeSingle();
  if (runResult.error) throw runResult.error;
  const run = runResult.data;
  if (!run || run.status !== 'approved') throw new Error('La selección estratégica todavía no está aprobada.');
  if (!['completed', 'partial'].includes(run.development_status)) throw new Error('El desarrollo técnico todavía no terminó.');

  const candidatesResult = await supabase.from('product_discovery_candidates').select('*')
    .eq('business_id', businessId).eq('discovery_run_id', discoveryRunId).eq('status', 'selected').order('rank');
  if (candidatesResult.error) throw candidatesResult.error;
  const candidates = candidatesResult.data || [];
  if (!candidates.length) throw new Error('No hay oportunidades seleccionadas.');

  const ids = candidates.map((item) => item.id);
  const [evidenceResult, blueprintResult] = await Promise.all([
    supabase.from('product_discovery_evidence').select('*').eq('business_id', businessId).eq('discovery_run_id', discoveryRunId).order('created_at'),
    supabase.from('product_discovery_blueprints').select('*').eq('business_id', businessId).in('candidate_id', ids),
  ]);
  if (evidenceResult.error) throw evidenceResult.error;
  if (blueprintResult.error) throw blueprintResult.error;
  const blueprints = blueprintResult.data || [];
  if (blueprints.length !== candidates.length) throw new Error('Faltan fichas técnicas para enriquecer la selección.');
  return { run, candidates, evidence: evidenceResult.data || [], blueprints };
}

function visualTask(candidates, evidence, blueprints) {
  return `FLUJO INTERNO: ESTRATEGIA VISUAL Y COMERCIAL DE OFERTAS SELECCIONADAS. Tu tarea NO es crear una imagen bonita sin fundamento. Analizá cómo se presenta cada oportunidad en el mercado, usando la evidencia ya reunida y web_search cuando haga falta. Contrastá referencias locales, nacionales e internacionales. Separá claramente lo observable de tus inferencias. No tomes likes, vistas ni una única cuenta como prueba de ventas. No copies marca, packaging distintivo, fotografía ni trade dress de un competidor. La recomendación debe cruzar atractivo visual, claridad del producto, diferenciación, posibilidad de producción, transporte/conservación y coherencia con la propuesta del negocio. Para cada candidato explicá qué patrones viste, qué conviene adoptar como principio, qué evitar y por qué la propuesta recomendada podría ser comercialmente más atractiva. Conservá referencias trazables con URL HTTPS real; image_url sólo si es una URL HTTPS directa y realmente observada, de lo contrario null. El aspirational_prompt debe describir una representación comercial propia, sin logos, texto ni marcas de terceros. No prometas que será la presentación más vendida: es una hipótesis de diseño fundamentada. En recommendation respondé SOLAMENTE con ${VISUAL_MARKER}{"strategies":[{"candidate_id":"UUID exacto","strategy_summary":"...","recommended_presentation":"...","market_patterns":[],"visual_priorities":[],"differentiators":[],"avoid":[],"references":[{"source_name":"...","source_url":"https://...","image_url":null,"market_scope":"local|national|international","observed_pattern":"...","why_relevant":"..."}],"aspirational_prompt":"..."}]} y nada más en recommendation. Debe haber una estrategia para cada ID: ${candidates.map((item) => `${item.id}=${item.name}`).join(' | ')}. EVIDENCIA PREVIA: ${JSON.stringify(evidence)} FICHAS TÉCNICAS: ${JSON.stringify(blueprints.map((item) => ({ candidate_id: item.candidate_id, offer_definition: item.offer_definition, packaging: item.packaging, operating_conditions: item.operating_conditions })))}`;
}

function humanTask(candidates, blueprints) {
  return `FLUJO INTERNO: CAPA HUMANA DE INSTRUCCIONES. Reescribí el proceso técnico de cada oportunidad para una persona real que va a producir o prestar el servicio. Usá español cotidiano de Argentina, frases cortas, verbos claros y vocabulario común. No suenes burocrático ni robótico. Conservá exactamente cantidades, tiempos y controles críticos; no simplifiques de manera que cambie el proceso ni inventes datos. Cuando exista un control importante, separalo como "Control" en lugar de esconderlo dentro de una frase larga. El detalle técnico original queda guardado por separado: esta salida es la versión fácil de seguir. En recommendation respondé SOLAMENTE con ${HUMAN_MARKER}{"candidates":[{"candidate_id":"UUID exacto","steps":[{"step":1,"title":"...","instruction":"...","duration_minutes":null,"control":"..."}]}]} y nada más en recommendation. IDs: ${candidates.map((item) => `${item.id}=${item.name}`).join(' | ')}. FICHAS TÉCNICAS: ${JSON.stringify(blueprints.map((item) => ({ candidate_id: item.candidate_id, ingredients: item.ingredients, process_steps: item.process_steps, instructions: item.instructions })))}`;
}

function qualityTask(candidates, blueprints) {
  return `FLUJO INTERNO: REVISIÓN FINAL DE CALIDAD Y CUMPLIMIENTO. La ejecución anterior quedó incompleta porque el especialista respondió que la revisión estaba "en preparación". Esta vez DEBÉS TERMINAR la revisión dentro de este turno. No describas trabajo futuro. Usá web_search y priorizá fuentes oficiales actuales cuando corresponda. Revisá candidato por candidato. Para alimentos: inocuidad, cadena de frío, alérgenos, manipulación, transporte, envase y rotulado. No fijes una vida útil específica sin evidencia suficiente: usá validation_required. No declares cumplimiento definitivo sin respaldo. Si un dato no puede determinarse, marcá el faltante, pero igualmente devolvé la estructura completa. En recommendation respondé SOLAMENTE con ${QUALITY_MARKER}{"reviews":[{"candidate_id":"UUID exacto","conservation_risk":"low|medium|high|null","conservation":{"storage_temperature":null,"shelf_life":"validation_required","transport":null,"handling":null},"allergens":[],"quality_controls":[],"compliance_notes":[],"changes":[],"data_gaps":[]}]} y nada más en recommendation. IDs: ${candidates.map((item) => item.id).join(', ')}. FICHAS ACTUALES: ${JSON.stringify(blueprints)}`;
}

function validateRows(payload, key, selectedIds, label) {
  const rows = asArray(payload?.[key]);
  const map = new Map();
  for (const item of rows) {
    const id = clean(item?.candidate_id);
    if (selectedIds.has(id) && !map.has(id)) map.set(id, asObject(item));
  }
  if (map.size !== selectedIds.size) throw new Error(`${label} no devolvió una fila válida para cada oportunidad.`);
  return map;
}

function normalizeReferences(strategy) {
  return asArray(strategy?.references).map((item) => {
    const row = asObject(item);
    const sourceUrl = validHttps(row.source_url);
    if (!sourceUrl) return null;
    return {
      source_name: clean(row.source_name) || 'Referencia de mercado',
      source_url: sourceUrl,
      image_url: validHttps(row.image_url),
      market_scope: clean(row.market_scope) || null,
      observed_pattern: clean(row.observed_pattern) || null,
      why_relevant: clean(row.why_relevant) || null,
    };
  }).filter(Boolean);
}

function normalizeHumanSteps(row) {
  return asArray(row?.steps).map((item, index) => {
    const step = asObject(item);
    return {
      step: Number.isFinite(Number(step.step)) ? Number(step.step) : index + 1,
      title: clean(step.title) || `Paso ${index + 1}`,
      instruction: clean(step.instruction),
      duration_minutes: step.duration_minutes == null ? null : Number(step.duration_minutes),
      control: clean(step.control) || null,
    };
  }).filter((item) => item.instruction);
}

async function generateAspirationalImage({ supabase, business, candidate, strategy }) {
  const references = normalizeReferences(strategy);
  const promptBase = clean(strategy?.aspirational_prompt);
  if (!promptBase || references.length === 0) {
    return { status: 'not_generated', reason: 'Faltan estrategia visual o referencias trazables suficientes.' };
  }

  const evidenceSummary = references.slice(0, 6).map((item) => `${item.market_scope || 'mercado'}: ${item.observed_pattern || item.why_relevant || item.source_name}`).join('; ');
  const prompt = `Creá una imagen conceptual comercial ORIGINAL para ${candidate.name}. Es una representación aspiracional de una oferta todavía en desarrollo, no una foto del producto real. Debe materializar esta recomendación: ${clean(strategy.recommended_presentation)}. Fundamento de mercado: ${evidenceSummary}. Dirección visual: ${promptBase}. No copies una fotografía, composición, marca, logo, etiqueta, tipografía, personaje, trade dress ni packaging distintivo de ningún competidor. Sin texto legible, sin logos y sin marcas. Fotografía de producto realista, iluminación comercial cuidada, fondo limpio y foco claro en la presentación propuesta.`;

  const result = await openai.images.generate({
    model: IMAGE_MODEL,
    prompt,
    size: '1024x1024',
  });
  const base64 = result?.data?.[0]?.b64_json;
  if (!base64) throw new Error('El modelo de imágenes no devolvió contenido utilizable.');
  const bytes = Buffer.from(base64, 'base64');
  const path = `${business.id}/${candidate.id}/aspirational-${Date.now()}.png`;
  const upload = await supabase.storage.from(MEDIA_BUCKET).upload(path, bytes, {
    contentType: 'image/png',
    upsert: true,
  });
  if (upload.error) throw upload.error;
  const publicResult = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  const url = publicResult?.data?.publicUrl;
  if (!url) throw new Error('No se pudo obtener la URL pública de la imagen aspiracional.');
  return {
    status: 'ready',
    url,
    kind: 'aspirational',
    model: IMAGE_MODEL,
    generated_at: new Date().toISOString(),
    evidence_sources: references.map((item) => item.source_url),
    disclaimer: 'Representación aspiracional basada en análisis de mercado. No corresponde al producto real.',
  };
}

async function upsertProduct({ supabase, business, candidate, blueprint, visualStrategy, references, aspirationalMedia }) {
  const summary = clean(asObject(blueprint.offer_definition).summary) || clean(candidate.concept) || clean(candidate.presentation) || null;
  const phase = blueprint.development_status === 'needs_data' ? 'needs_data' : 'in_development';
  const row = {
    business_id: business.id,
    name: candidate.name,
    description: summary,
    status: 'draft',
    portion_grams: blueprint.portion_grams,
    source_discovery_candidate_id: candidate.id,
    origin: 'discovery',
    development_phase: phase,
    visual_strategy: visualStrategy,
    reference_media: references,
    aspirational_media: aspirationalMedia,
    updated_at: new Date().toISOString(),
  };
  const result = await supabase.from('products').upsert(row, { onConflict: 'business_id,name' }).select('*').single();
  if (result.error) throw result.error;
  return result.data;
}

function needsQualityRepair(blueprints) {
  return blueprints.some((item) => {
    const conservation = asObject(item.conservation);
    const review = asObject(asObject(item.specialist_reviews).quality_compliance);
    return Object.keys(conservation).length === 0 || Boolean(review.error);
  });
}

export async function processOfferEnrichment({ supabase, business, discoveryRunId, agentRunId }) {
  const claim = await supabase.from('agent_runs').update({ status: 'running' })
    .eq('id', agentRunId).eq('business_id', business.id).eq('status', 'queued').select('*').maybeSingle();
  if (claim.error) throw claim.error;
  if (!claim.data) return { skipped: true, agentRunId };

  const costs = [];
  let partial = false;
  try {
    const current = await loadCurrent(supabase, business.id, discoveryRunId);
    const selectedIds = new Set(current.candidates.map((item) => item.id));
    const snapshot = await loadBusinessSnapshot(supabase, business.id);
    const baseContext = contextForAgent(business, snapshot);
    const mission = `Completar presentación comercial trazable, capa humana y controles faltantes de ofertas seleccionadas de ${business.name}. discovery_run_id=${discoveryRunId}`;
    const context = `${baseContext}\n\nCANDIDATOS\n${JSON.stringify(current.candidates)}\n\nEVIDENCIA\n${JSON.stringify(current.evidence)}\n\nFICHAS\n${JSON.stringify(current.blueprints)}`;

    await setStage(supabase, business.id, discoveryRunId, {
      enrichment_status: 'running',
      enrichment_stage: 'market_visual_review',
      enrichment_started_at: new Date().toISOString(),
      enrichment_error_message: null,
    });

    const visual = await tracedSpecialist({
      supabase, business, agentRunId,
      key: 'market_growth',
      task: visualTask(current.candidates, current.evidence, current.blueprints),
      mission,
      businessContext: context,
    });
    costs.push(visual);
    const visualById = validateRows(markedJson(visual.result?.recommendation, VISUAL_MARKER), 'strategies', selectedIds, 'Mercado');

    await setStage(supabase, business.id, discoveryRunId, { enrichment_stage: 'human_instructions' });
    const human = await tracedSpecialist({
      supabase, business, agentRunId,
      key: 'product_experience',
      task: humanTask(current.candidates, current.blueprints),
      mission,
      businessContext: context,
    });
    costs.push(human);
    const humanById = validateRows(markedJson(human.result?.recommendation, HUMAN_MARKER), 'candidates', selectedIds, 'Producto');

    let qualityById = new Map();
    if (needsQualityRepair(current.blueprints)) {
      await setStage(supabase, business.id, discoveryRunId, { enrichment_stage: 'quality_repair' });
      try {
        const quality = await tracedSpecialist({
          supabase, business, agentRunId,
          key: 'quality_compliance',
          task: qualityTask(current.candidates, current.blueprints),
          mission,
          businessContext: context,
        });
        costs.push(quality);
        qualityById = validateRows(markedJson(quality.result?.recommendation, QUALITY_MARKER), 'reviews', selectedIds, 'Calidad');
      } catch (error) {
        partial = true;
        await setStage(supabase, business.id, discoveryRunId, {
          enrichment_error_message: `Calidad quedó incompleta: ${String(error?.message || error).slice(0, 1200)}`,
        });
      }
    }

    await setStage(supabase, business.id, discoveryRunId, { enrichment_stage: 'aspirational_media' });
    const blueprintByCandidate = new Map(current.blueprints.map((item) => [item.candidate_id, item]));
    const updatedBlueprints = [];
    for (const candidate of current.candidates) {
      const blueprint = blueprintByCandidate.get(candidate.id);
      const visualStrategy = visualById.get(candidate.id) || {};
      const references = normalizeReferences(visualStrategy);
      const humanInstructions = normalizeHumanSteps(humanById.get(candidate.id));
      const quality = qualityById.get(candidate.id) || null;
      let aspirationalMedia = asObject(blueprint.aspirational_media);
      try {
        if (aspirationalMedia.status !== 'ready' || !validHttps(aspirationalMedia.url)) {
          aspirationalMedia = await generateAspirationalImage({ supabase, business, candidate, strategy: visualStrategy });
        }
      } catch (error) {
        partial = true;
        aspirationalMedia = {
          status: 'failed',
          reason: String(error?.message || error).slice(0, 800),
        };
      }

      const patch = {
        human_instructions: humanInstructions,
        visual_strategy: visualStrategy,
        reference_media: references,
        aspirational_media: aspirationalMedia,
        updated_at: new Date().toISOString(),
      };
      if (quality) {
        patch.conservation = asObject(quality.conservation);
        patch.allergens = uniqueStrings(blueprint.allergens, quality.allergens);
        patch.quality_controls = uniqueStrings(blueprint.quality_controls, quality.quality_controls);
        const existingOffer = asObject(blueprint.offer_definition);
        const remainingGaps = uniqueStrings(existingOffer.data_gaps, quality.data_gaps);
        patch.offer_definition = { ...existingOffer, data_gaps: remainingGaps };
        patch.quality_notes = uniqueStrings(quality.compliance_notes).join(' · ') || blueprint.quality_notes;
        patch.specialist_reviews = {
          ...asObject(blueprint.specialist_reviews),
          quality_compliance: quality,
        };
      }

      const updated = await supabase.from('product_discovery_blueprints').update(patch)
        .eq('business_id', business.id).eq('candidate_id', candidate.id).select('*').single();
      if (updated.error) throw updated.error;
      updatedBlueprints.push(updated.data);

      await upsertProduct({
        supabase,
        business,
        candidate,
        blueprint: updated.data,
        visualStrategy,
        references,
        aspirationalMedia,
      });
    }

    const finalStatus = partial ? 'partial' : 'completed';
    await setStage(supabase, business.id, discoveryRunId, {
      enrichment_status: finalStatus,
      enrichment_stage: 'completed',
      enrichment_completed_at: new Date().toISOString(),
      enrichment_error_message: partial ? 'El enriquecimiento terminó con al menos un componente pendiente; las partes completas se conservaron.' : null,
    });

    const estimatedModelCostUsd = sumKnownCosts(costs);
    const completed = await supabase.from('agent_runs').update({
      result_summary: `Enriquecimiento ${finalStatus}: estrategia visual trazable, capa humana y medios para ${updatedBlueprints.length} ofertas.`,
      estimated_model_cost_usd: estimatedModelCostUsd,
      usage_complete: false,
      status: 'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', agentRunId);
    if (completed.error) throw completed.error;
    return { status: finalStatus, blueprints: updatedBlueprints.length, estimatedModelCostUsd };
  } catch (error) {
    await setStage(supabase, business.id, discoveryRunId, {
      enrichment_status: 'failed',
      enrichment_stage: 'error',
      enrichment_completed_at: new Date().toISOString(),
      enrichment_error_message: String(error?.message || error).slice(0, 2000),
    }).catch(() => {});
    await supabase.from('agent_runs').update({
      status: 'failed',
      error_message: String(error?.message || error).slice(0, 2000),
      completed_at: new Date().toISOString(),
    }).eq('id', agentRunId);
    throw error;
  }
}