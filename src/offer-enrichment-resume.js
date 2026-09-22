import OpenAI from 'openai';
import { getAgentTeam, runSpecialist } from './agents.js';
import { contextForAgent, loadBusinessSnapshot } from './business-context.js';
import { estimateModelCostUsd, normalizeUsage, PRICING_VERSION, sumKnownCosts } from './ai-cost.js';
import { processOfferEnrichment } from './offer-enrichment.js';

const QUALITY_MARKER = 'QUALITY_REVIEW_JSON:';
const IMAGE_MODEL = 'gpt-image-2';
const MEDIA_BUCKET = 'business-offer-media';
const clean = (value) => String(value ?? '').trim();
const asArray = (value) => Array.isArray(value) ? value : [];
const asObject = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function validHttps(value) {
  const text = clean(value);
  return /^https:\/\//i.test(text) ? text : null;
}

function uniqueStrings(...groups) {
  return [...new Set(groups.flatMap((group) => asArray(group).map(clean).filter(Boolean)))];
}

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

function validateRows(payload, selectedIds) {
  const rows = asArray(payload?.reviews);
  const map = new Map();
  for (const item of rows) {
    const id = clean(item?.candidate_id);
    if (selectedIds.has(id) && !map.has(id)) map.set(id, asObject(item));
  }
  if (map.size !== selectedIds.size) throw new Error('Calidad no devolvió una fila válida para cada oportunidad.');
  return map;
}

function hasGroundedVisual(blueprint) {
  const strategy = asObject(blueprint.visual_strategy);
  const references = asArray(blueprint.reference_media).filter((item) => validHttps(item?.source_url));
  return Object.keys(strategy).length > 0 && Boolean(clean(strategy.aspirational_prompt)) && references.length > 0;
}

function hasHumanInstructions(blueprint) {
  return asArray(blueprint.human_instructions).some((item) => clean(item?.instruction));
}

function needsQualityRepair(blueprints) {
  return blueprints.some((item) => {
    const conservation = asObject(item.conservation);
    const review = asObject(asObject(item.specialist_reviews).quality_compliance);
    return Object.keys(conservation).length === 0 || Boolean(review.error);
  });
}

function needsAspirationalMedia(blueprints) {
  return blueprints.some((item) => {
    const media = asObject(item.aspirational_media);
    return media.status !== 'ready' || !validHttps(media.url);
  });
}

async function loadState(supabase, businessId, discoveryRunId) {
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

  const blueprintsResult = await supabase.from('product_discovery_blueprints').select('*')
    .eq('business_id', businessId).in('candidate_id', candidates.map((item) => item.id));
  if (blueprintsResult.error) throw blueprintsResult.error;
  const blueprints = blueprintsResult.data || [];
  if (blueprints.length !== candidates.length) throw new Error('Faltan fichas técnicas para reanudar el enriquecimiento.');
  return { run, candidates, blueprints };
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

async function tracedQuality({ supabase, business, agentRunId, task, mission, businessContext }) {
  const team = await getAgentTeam();
  const specialist = team.quality_compliance;
  if (!specialist?.id) throw new Error('El especialista quality_compliance no está disponible.');

  const trace = await supabase.from('specialist_runs').insert({
    business_id: business.id,
    agent_run_id: agentRunId,
    specialist_key: 'quality_compliance',
    specialist_name: specialist.name,
    openai_agent_id: specialist.id,
    model: specialist.model,
    assigned_task: task,
    status: 'running',
  }).select('*').single();
  if (trace.error) throw trace.error;

  try {
    const result = await runSpecialist({ key: 'quality_compliance', task, mission, businessContext });
    const cost = await recordUsage({
      supabase,
      businessId: business.id,
      agentRunId,
      specialistRunId: trace.data.id,
      roleKey: 'quality_compliance',
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

function qualityTask(candidates, blueprints) {
  return `FLUJO INTERNO: REPARACIÓN PUNTUAL DE CALIDAD Y CUMPLIMIENTO. Mercado y Producto ya terminaron y NO deben repetirse. Completá ahora exclusivamente la revisión de Calidad dentro de este turno. Usá web_search y priorizá fuentes oficiales actuales cuando corresponda. Revisá candidato por candidato. Para alimentos: inocuidad, cadena de frío, alérgenos, manipulación, transporte, envase y rotulado. No fijes una vida útil específica sin evidencia suficiente: usá validation_required. No declares cumplimiento definitivo sin respaldo. Si falta un dato, registralo, pero devolvé igualmente la estructura completa. En recommendation respondé SOLAMENTE con ${QUALITY_MARKER}{"reviews":[{"candidate_id":"UUID exacto","conservation_risk":"low|medium|high|null","conservation":{"storage_temperature":null,"shelf_life":"validation_required","transport":null,"handling":null},"allergens":[],"quality_controls":[],"compliance_notes":[],"changes":[],"data_gaps":[]}]} y nada más en recommendation. IDs: ${candidates.map((item) => item.id).join(', ')}. FICHAS ACTUALES: ${JSON.stringify(blueprints)}`;
}

async function setRun(supabase, businessId, discoveryRunId, values) {
  const result = await supabase.from('product_discovery_runs').update({
    ...values,
    updated_at: new Date().toISOString(),
  }).eq('business_id', businessId).eq('id', discoveryRunId);
  if (result.error) throw result.error;
}

async function generateAspirationalImage({ supabase, business, candidate, blueprint }) {
  const strategy = asObject(blueprint.visual_strategy);
  const references = asArray(blueprint.reference_media).filter((item) => validHttps(item?.source_url));
  const promptBase = clean(strategy.aspirational_prompt);
  if (!promptBase || references.length === 0) {
    return { status: 'not_generated', reason: 'Faltan estrategia visual o referencias trazables suficientes.' };
  }

  const evidenceSummary = references.slice(0, 6)
    .map((item) => `${item.market_scope || 'mercado'}: ${item.observed_pattern || item.why_relevant || item.source_name || item.source_url}`)
    .join('; ');
  const prompt = `Creá una imagen conceptual comercial ORIGINAL para ${candidate.name}. Es una representación aspiracional de una oferta todavía en desarrollo, no una foto del producto real. Debe materializar esta recomendación: ${clean(strategy.recommended_presentation)}. Fundamento de mercado: ${evidenceSummary}. Dirección visual: ${promptBase}. No copies una fotografía, composición, marca, logo, etiqueta, tipografía, personaje, trade dress ni packaging distintivo de ningún competidor. Sin texto legible, sin logos y sin marcas. Fotografía de producto realista, iluminación comercial cuidada, fondo limpio y foco claro en la presentación propuesta.`;

  const result = await openai.images.generate({ model: IMAGE_MODEL, prompt, size: '1024x1024' });
  const base64 = result?.data?.[0]?.b64_json;
  if (!base64) throw new Error('El modelo de imágenes no devolvió contenido utilizable.');
  const bytes = Buffer.from(base64, 'base64');
  const path = `${business.id}/${candidate.id}/aspirational-${Date.now()}.png`;
  const upload = await supabase.storage.from(MEDIA_BUCKET).upload(path, bytes, { contentType: 'image/png', upsert: true });
  if (upload.error) throw upload.error;
  const url = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path)?.data?.publicUrl;
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

async function processPersistedStageResume({ supabase, business, discoveryRunId, agentRunId, state }) {
  const claim = await supabase.from('agent_runs').update({ status: 'running' })
    .eq('id', agentRunId).eq('business_id', business.id).eq('status', 'queued').select('*').maybeSingle();
  if (claim.error) throw claim.error;
  if (!claim.data) return { skipped: true, agentRunId };

  const qualityRequired = needsQualityRepair(state.blueprints);
  const imageRequired = needsAspirationalMedia(state.blueprints);
  const plannedSpecialists = qualityRequired ? ['quality_compliance'] : [];
  await supabase.from('agent_runs').update({
    delegation_plan: {
      workflow: 'resume_offer_enrichment',
      sequential: true,
      reuse_persisted: ['market_growth', 'product_experience'],
      specialists: plannedSpecialists,
      aspirational_media: imageRequired,
    },
    specialist_count: plannedSpecialists.length,
  }).eq('id', agentRunId);

  const costs = [];
  const issues = [];
  let qualityById = new Map();
  try {
    const snapshot = await loadBusinessSnapshot(supabase, business.id);
    const baseContext = contextForAgent(business, snapshot);
    const mission = `Reanudar únicamente etapas pendientes del enriquecimiento de ${business.name}. discovery_run_id=${discoveryRunId}`;
    const context = `${baseContext}\n\nCANDIDATOS\n${JSON.stringify(state.candidates)}\n\nFICHAS PERSISTIDAS\n${JSON.stringify(state.blueprints)}`;
    const selectedIds = new Set(state.candidates.map((item) => item.id));

    await setRun(supabase, business.id, discoveryRunId, {
      enrichment_status: 'running',
      enrichment_stage: qualityRequired ? 'quality_repair' : 'aspirational_media',
      enrichment_started_at: new Date().toISOString(),
      enrichment_completed_at: null,
      enrichment_error_message: null,
    });

    if (qualityRequired) {
      try {
        const quality = await tracedQuality({
          supabase,
          business,
          agentRunId,
          task: qualityTask(state.candidates, state.blueprints),
          mission,
          businessContext: context,
        });
        costs.push(quality);
        qualityById = validateRows(markedJson(quality.result?.recommendation, QUALITY_MARKER), selectedIds);
      } catch (error) {
        issues.push(`Calidad: ${String(error?.message || error).slice(0, 1000)}`);
      }
    }

    await setRun(supabase, business.id, discoveryRunId, { enrichment_stage: 'aspirational_media' });
    const blueprintById = new Map(state.blueprints.map((item) => [item.candidate_id, item]));

    for (const candidate of state.candidates) {
      const blueprint = blueprintById.get(candidate.id);
      const patch = { updated_at: new Date().toISOString() };
      const quality = qualityById.get(candidate.id) || null;

      if (quality) {
        patch.conservation = asObject(quality.conservation);
        patch.allergens = uniqueStrings(blueprint.allergens, quality.allergens);
        patch.quality_controls = uniqueStrings(blueprint.quality_controls, quality.quality_controls);
        const existingOffer = asObject(blueprint.offer_definition);
        patch.offer_definition = {
          ...existingOffer,
          data_gaps: uniqueStrings(existingOffer.data_gaps, quality.data_gaps),
        };
        patch.quality_notes = uniqueStrings(quality.compliance_notes).join(' · ') || blueprint.quality_notes;
        patch.specialist_reviews = {
          ...asObject(blueprint.specialist_reviews),
          quality_compliance: quality,
        };
        if (['low', 'medium', 'high'].includes(quality.conservation_risk)) {
          await supabase.from('product_discovery_candidates').update({
            conservation_risk: quality.conservation_risk,
            updated_at: new Date().toISOString(),
          }).eq('business_id', business.id).eq('id', candidate.id);
        }
      }

      let media = asObject(blueprint.aspirational_media);
      if (media.status !== 'ready' || !validHttps(media.url)) {
        try {
          media = await generateAspirationalImage({ supabase, business, candidate, blueprint });
        } catch (error) {
          media = { status: 'failed', reason: String(error?.message || error).slice(0, 800) };
          issues.push(`${candidate.name} · imagen: ${media.reason}`);
        }
      }
      patch.aspirational_media = media;

      const updated = await supabase.from('product_discovery_blueprints').update(patch)
        .eq('business_id', business.id).eq('candidate_id', candidate.id).select('id').single();
      if (updated.error) throw updated.error;

      const productUpdate = await supabase.from('products').update({
        aspirational_media: media,
        updated_at: new Date().toISOString(),
      }).eq('business_id', business.id).eq('source_discovery_candidate_id', candidate.id);
      if (productUpdate.error) throw productUpdate.error;
    }

    const finalStatus = issues.length ? 'partial' : 'completed';
    await setRun(supabase, business.id, discoveryRunId, {
      enrichment_status: finalStatus,
      enrichment_stage: 'completed',
      enrichment_completed_at: new Date().toISOString(),
      enrichment_error_message: issues.length ? issues.join(' | ').slice(0, 2000) : null,
    });

    const estimatedModelCostUsd = sumKnownCosts(costs);
    const complete = await supabase.from('agent_runs').update({
      result_summary: `Reanudación de enrichment ${finalStatus}: se reutilizaron Mercado e instrucciones humanas; se ejecutaron únicamente etapas pendientes.`,
      estimated_model_cost_usd: estimatedModelCostUsd,
      usage_complete: plannedSpecialists.length === costs.length && costs.every((item) => item.usageAvailable === true),
      status: 'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', agentRunId);
    if (complete.error) throw complete.error;
    return { status: finalStatus, resumed: true, issues, estimatedModelCostUsd };
  } catch (error) {
    await setRun(supabase, business.id, discoveryRunId, {
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

export async function processOfferEnrichmentResumable(args) {
  const state = await loadState(args.supabase, args.business.id, args.discoveryRunId);
  const reusableMarket = state.blueprints.every(hasGroundedVisual);
  const reusableHuman = state.blueprints.every(hasHumanInstructions);

  if (!reusableMarket || !reusableHuman) {
    return processOfferEnrichment(args);
  }

  return processPersistedStageResume({ ...args, state });
}
