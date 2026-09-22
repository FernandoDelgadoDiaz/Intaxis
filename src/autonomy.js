const ACTION_TYPES = new Set([
  'market_research',
  'create_content_draft',
  'create_operation_task',
  'reply_customer_routine',
  'create_order',
  'create_payment_link',
  'publish_content',
  'paid_ad_spend',
]);

const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));
const clean = (value) => String(value ?? '').trim();
const cleanHttps = (value) => {
  const text = clean(value);
  return /^https:\/\//i.test(text) ? text : null;
};
const band = (value) => ['low', 'medium', 'high'].includes(value) ? value : null;
const marketScope = (value) => ['local', 'national', 'latam', 'international'].includes(value) ? value : null;
const evidenceType = (value) => [
  'presentation', 'flavor', 'engagement', 'trend', 'price', 'competitor', 'packaging', 'comment_signal', 'other',
].includes(value) ? value : 'other';

export function normalizeDirectorAction(input) {
  if (!input || !ACTION_TYPES.has(input.type)) return null;
  const estimatedAmount = input.estimated_amount_ars == null || input.estimated_amount_ars === ''
    ? null
    : Number(input.estimated_amount_ars);
  return {
    type: input.type,
    title: clean(input.title) || input.type,
    rationale: clean(input.rationale),
    confidence: clamp01(input.confidence),
    risk_level: ['low', 'medium', 'high', 'critical'].includes(input.risk_level) ? input.risk_level : 'medium',
    estimated_amount_ars: Number.isFinite(estimatedAmount) && estimatedAmount >= 0 ? estimatedAmount : null,
    payload: input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload) ? input.payload : {},
  };
}

export function evaluateAutonomyPolicy(policy, action) {
  if (!policy || policy.active !== true) {
    return { decision: 'approval_required', requiresHuman: true, reason: 'No existe una política activa para esta acción.' };
  }
  if (action.risk_level === 'critical') {
    return { decision: 'blocked', requiresHuman: true, reason: 'Las acciones de riesgo crítico no se ejecutan automáticamente.' };
  }
  if (policy.mode === 'blocked') {
    return { decision: 'blocked', requiresHuman: true, reason: 'La política vigente bloquea esta clase de acción.' };
  }
  if (action.risk_level === 'high') {
    return { decision: 'approval_required', requiresHuman: true, reason: 'Riesgo alto: requiere autorización humana.' };
  }
  if (action.confidence < Number(policy.min_confidence || 0)) {
    return {
      decision: 'approval_required',
      requiresHuman: true,
      reason: `Confianza ${action.confidence.toFixed(2)} inferior al mínimo ${Number(policy.min_confidence).toFixed(2)}.`,
    };
  }
  if (
    action.estimated_amount_ars != null &&
    policy.max_amount_ars != null &&
    Number(action.estimated_amount_ars) > Number(policy.max_amount_ars)
  ) {
    return {
      decision: 'approval_required',
      requiresHuman: true,
      reason: `Monto estimado superior al límite autónomo de $${Number(policy.max_amount_ars).toLocaleString('es-AR')}.`,
    };
  }
  if (policy.mode === 'approval') {
    return { decision: 'approval_required', requiresHuman: true, reason: 'La política vigente exige autorización.' };
  }
  return { decision: 'autonomous', requiresHuman: false, reason: 'Cumple la política y los límites de autonomía vigentes.' };
}

function defaultChecklist() {
  return [
    { label: 'Área, manos y utensilios listos', required: true, done: false },
    { label: 'Insumos y envases verificados', required: true, done: false },
    { label: 'Preparación realizada según receta', required: true, done: false },
    { label: 'Armado y cierre completados', required: true, done: false },
    { label: 'Frío / almacenamiento asegurado', required: true, done: false },
  ];
}

async function productionPreflight(supabase, businessId, payload) {
  const productId = clean(payload.product_id);
  const quantity = Number(payload.quantity);
  const dueAt = clean(payload.due_at);
  if (!productId || !Number.isFinite(quantity) || quantity <= 0 || !dueAt) {
    return { ok: false, reason: 'Faltan product_id, quantity o due_at para una orden de producción verificable.' };
  }

  const productResult = await supabase.from('products').select('id,name').eq('business_id', businessId).eq('id', productId).maybeSingle();
  if (productResult.error) throw productResult.error;
  if (!productResult.data) return { ok: false, reason: 'El producto propuesto no existe en Mi Negocio.' };

  const recipeResult = await supabase
    .from('recipes')
    .select('id,version,status,yield_units,notes')
    .eq('business_id', businessId)
    .eq('product_id', productId)
    .in('status', ['test', 'approved'])
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recipeResult.error) throw recipeResult.error;
  if (!recipeResult.data) return { ok: false, reason: 'No existe una receta test/approved vigente para producir autónomamente.' };
  const recipe = recipeResult.data;

  const dueDate = dueAt.slice(0, 10);
  const capacityResult = await supabase
    .from('capacity_settings')
    .select('daily_capacity_units,valid_from')
    .eq('business_id', businessId)
    .lte('valid_from', dueDate)
    .order('valid_from', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (capacityResult.error) throw capacityResult.error;
  if (!capacityResult.data) return { ok: false, reason: 'No hay capacidad diaria configurada para la fecha de producción.' };

  const dayStart = `${dueDate}T00:00:00`;
  const next = new Date(`${dueDate}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const dayEnd = next.toISOString().slice(0, 19);
  const existingResult = await supabase
    .from('operation_tasks')
    .select('quantity')
    .eq('business_id', businessId)
    .eq('task_type', 'production')
    .in('status', ['pending', 'in_progress', 'blocked'])
    .gte('due_at', dayStart)
    .lt('due_at', dayEnd);
  if (existingResult.error) throw existingResult.error;
  const alreadyCommitted = (existingResult.data || []).reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  if (alreadyCommitted + quantity > Number(capacityResult.data.daily_capacity_units || 0)) {
    return {
      ok: false,
      reason: `La orden supera la capacidad: ${alreadyCommitted + quantity} unidades comprometidas vs ${Number(capacityResult.data.daily_capacity_units)} disponibles.`,
    };
  }

  const itemsResult = await supabase
    .from('recipe_items')
    .select('ingredient_id,quantity,waste_pct')
    .eq('business_id', businessId)
    .eq('recipe_id', recipe.id);
  if (itemsResult.error) throw itemsResult.error;
  if (!(itemsResult.data || []).length) return { ok: false, reason: 'La receta no tiene insumos cargados.' };

  const ingredientIds = itemsResult.data.map((row) => row.ingredient_id);
  const [ingredientsResult, movementsResult] = await Promise.all([
    supabase.from('ingredients').select('id,name,unit').eq('business_id', businessId).in('id', ingredientIds),
    supabase.from('inventory_movements').select('ingredient_id,quantity_delta').eq('business_id', businessId).in('ingredient_id', ingredientIds),
  ]);
  if (ingredientsResult.error) throw ingredientsResult.error;
  if (movementsResult.error) throw movementsResult.error;
  const ingredients = new Map((ingredientsResult.data || []).map((row) => [row.id, row]));
  const stock = new Map();
  for (const movement of movementsResult.data || []) {
    stock.set(movement.ingredient_id, Number(stock.get(movement.ingredient_id) || 0) + Number(movement.quantity_delta || 0));
  }

  const scale = quantity / Number(recipe.yield_units || 1);
  const inputs = itemsResult.data.map((row) => {
    const ingredient = ingredients.get(row.ingredient_id);
    const required = Number(row.quantity || 0) * scale * (1 + Number(row.waste_pct || 0) / 100);
    return {
      ingredient_id: row.ingredient_id,
      name: ingredient?.name || 'Insumo',
      unit: ingredient?.unit || '',
      quantity: Number(required.toFixed(4)),
      waste_pct: Number(row.waste_pct || 0),
      available: Number(stock.get(row.ingredient_id) || 0),
    };
  });
  const shortages = inputs.filter((row) => row.available + 1e-9 < row.quantity);
  if (shortages.length) {
    return {
      ok: false,
      reason: `Stock insuficiente: ${shortages.map((row) => `${row.name} necesita ${row.quantity} ${row.unit} y hay ${row.available}`).join('; ')}.`,
    };
  }

  return {
    ok: true,
    product: productResult.data,
    recipeSnapshot: {
      recipe_id: recipe.id,
      version: recipe.version,
      status: recipe.status,
      yield_units: Number(recipe.yield_units),
      notes: recipe.notes || null,
    },
    inputsSnapshot: inputs.map(({ available, ...row }) => row),
    dueAt,
    quantity,
  };
}

async function executeCreateOperationTask({ supabase, business, userId, request }) {
  const preflight = await productionPreflight(supabase, business.id, request.payload || {});
  if (!preflight.ok) {
    const error = new Error(preflight.reason);
    error.code = 'AUTONOMY_PREFLIGHT';
    throw error;
  }
  const payload = request.payload || {};
  const { data, error } = await supabase
    .from('operation_tasks')
    .insert({
      business_id: business.id,
      task_type: 'production',
      title: clean(payload.title) || request.title,
      product_id: preflight.product.id,
      product_name: preflight.product.name,
      quantity: preflight.quantity,
      unit: clean(payload.unit) || 'unidades',
      priority: ['low', 'normal', 'high', 'urgent'].includes(payload.priority) ? payload.priority : 'normal',
      due_at: preflight.dueAt,
      instructions: clean(payload.instructions) || null,
      checklist: defaultChecklist(),
      recipe_snapshot: preflight.recipeSnapshot,
      inputs_snapshot: preflight.inputsSnapshot,
      created_by: userId,
      created_source: 'agent',
      source_action_request_id: request.id,
    })
    .select('*')
    .single();
  if (error) throw error;

  const event = await supabase.from('operation_events').insert({
    business_id: business.id,
    task_id: data.id,
    actor_user_id: userId,
    event_type: 'created',
    payload: { source: 'agent_action_request', action_request_id: request.id },
  });
  if (event.error) throw event.error;
  return { operation_task_id: data.id, status: data.status };
}

async function executeContentDraft({ supabase, business, request }) {
  const payload = request.payload || {};
  const provider = ['instagram', 'facebook', 'tiktok', 'whatsapp', 'web'].includes(payload.provider) ? payload.provider : 'instagram';
  const contentType = ['post', 'reel', 'story', 'video', 'message', 'ad', 'other'].includes(payload.content_type) ? payload.content_type : 'post';
  const { data, error } = await supabase.from('content_items').insert({
    business_id: business.id,
    campaign_id: payload.campaign_id || null,
    provider,
    content_type: contentType,
    status: 'draft',
    concept: clean(payload.concept) || request.title,
    hook: clean(payload.hook) || null,
    body: clean(payload.body) || null,
    call_to_action: clean(payload.call_to_action) || null,
    hypothesis: clean(payload.hypothesis) || null,
    source_action_request_id: request.id,
    metadata: { generated_by: 'director' },
  }).select('*').single();
  if (error) throw error;
  return { content_item_id: data.id, status: data.status };
}

function marketResearchGap(message) {
  const error = new Error(message);
  error.code = 'AUTONOMY_DATA_GAP';
  return error;
}

function normalizeDiscoveryCandidate(candidate) {
  const rank = Number(candidate?.rank);
  const score = candidate?.acceptance_score == null || candidate?.acceptance_score === ''
    ? null
    : Number(candidate.acceptance_score);
  return {
    rank,
    name: clean(candidate?.name),
    concept: clean(candidate?.concept) || null,
    presentation: clean(candidate?.presentation) || null,
    acceptance_score: Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : null,
    acceptance_band: band(candidate?.acceptance_band),
    trend_strength: band(candidate?.trend_strength),
    argentina_fit: band(candidate?.argentina_fit),
    visual_potential: band(candidate?.visual_potential),
    production_complexity: band(candidate?.production_complexity),
    conservation_risk: band(candidate?.conservation_risk),
    cost_complexity: band(candidate?.cost_complexity),
    rationale: clean(candidate?.rationale),
    image_url: cleanHttps(candidate?.image_url),
    image_source_url: cleanHttps(candidate?.image_source_url),
  };
}

function validateMarketResearchPayload(payload) {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates.map(normalizeDiscoveryCandidate) : [];
  if (candidates.length !== 3) throw marketResearchGap('La investigación debe entregar exactamente tres candidatos comparables.');
  const ranks = candidates.map((item) => item.rank).sort((a, b) => a - b);
  if (ranks.join(',') !== '1,2,3') throw marketResearchGap('Los tres candidatos deben tener rankings únicos 1, 2 y 3.');
  if (candidates.some((item) => !item.name || !item.rationale)) {
    throw marketResearchGap('Cada candidato necesita nombre y fundamento trazable antes de persistirse.');
  }

  const evidence = Array.isArray(payload?.evidence) ? payload.evidence : [];
  if (!evidence.length) throw marketResearchGap('La investigación no contiene evidencia externa trazable.');
  const normalizedEvidence = evidence.map((item) => {
    const rank = Number(item?.candidate_rank);
    const scope = marketScope(item?.market_scope);
    const sourceUrl = cleanHttps(item?.source_url);
    const claim = clean(item?.claim);
    const observedAt = clean(item?.observed_at);
    const metricValue = item?.metric_value == null || item?.metric_value === '' ? null : Number(item.metric_value);
    if (![1, 2, 3].includes(rank) || !scope || !sourceUrl || !claim || !observedAt) {
      throw marketResearchGap('Cada evidencia debe identificar candidato, mercado, URL HTTPS real, hallazgo y fecha observada.');
    }
    return {
      candidate_rank: rank,
      market_scope: scope,
      country: clean(item?.country) || null,
      source_name: clean(item?.source_name) || sourceUrl,
      source_url: sourceUrl,
      source_type: clean(item?.source_type) || 'web',
      evidence_type: evidenceType(item?.evidence_type),
      claim,
      metric_name: clean(item?.metric_name) || null,
      metric_value: Number.isFinite(metricValue) ? metricValue : null,
      metric_unit: clean(item?.metric_unit) || null,
      image_url: cleanHttps(item?.image_url),
      observed_at: observedAt,
      confidence: band(item?.confidence) || 'medium',
      metadata: item?.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata) ? item.metadata : {},
    };
  });

  for (const rank of [1, 2, 3]) {
    if (!normalizedEvidence.some((item) => item.candidate_rank === rank)) {
      throw marketResearchGap(`El candidato #${rank} no tiene evidencia externa trazable.`);
    }
  }
  const scopes = new Set(normalizedEvidence.map((item) => item.market_scope));
  if (!scopes.has('national') || !scopes.has('international')) {
    throw marketResearchGap('Para cerrar Descubrimiento se necesita evidencia nacional e internacional.');
  }

  const executiveSummary = clean(payload?.executive_summary);
  if (!executiveSummary) throw marketResearchGap('Falta el resumen ejecutivo de la investigación.');

  return {
    title: clean(payload?.title),
    objective: clean(payload?.objective) || null,
    scope: payload?.scope && typeof payload.scope === 'object' && !Array.isArray(payload.scope) ? payload.scope : {},
    executive_summary: executiveSummary,
    recommendation_notes: clean(payload?.recommendation_notes) || null,
    candidates,
    evidence: normalizedEvidence,
  };
}

async function executeMarketResearch({ supabase, business, request }) {
  const research = validateMarketResearchPayload(request.payload || {});
  let discoveryRunId = null;
  try {
    const runResult = await supabase.from('product_discovery_runs').insert({
      business_id: business.id,
      agent_run_id: request.agent_run_id || null,
      title: research.title || request.title || 'Descubrimiento de producto',
      objective: research.objective,
      status: 'ready',
      scope: research.scope,
      executive_summary: research.executive_summary,
      recommendation_notes: research.recommendation_notes,
      completed_at: new Date().toISOString(),
    }).select('*').single();
    if (runResult.error) throw runResult.error;
    discoveryRunId = runResult.data.id;

    const candidateRows = research.candidates.map((item) => ({
      business_id: business.id,
      discovery_run_id: discoveryRunId,
      rank: item.rank,
      name: item.name,
      concept: item.concept,
      presentation: item.presentation,
      acceptance_score: item.acceptance_score,
      acceptance_band: item.acceptance_band,
      trend_strength: item.trend_strength,
      argentina_fit: item.argentina_fit,
      visual_potential: item.visual_potential,
      production_complexity: item.production_complexity,
      conservation_risk: item.conservation_risk,
      cost_complexity: item.cost_complexity,
      rationale: item.rationale,
      image_url: item.image_url,
      image_source_url: item.image_source_url,
      status: 'proposed',
    }));
    const candidateResult = await supabase.from('product_discovery_candidates').insert(candidateRows).select('id,rank,name');
    if (candidateResult.error) throw candidateResult.error;
    const candidateByRank = new Map((candidateResult.data || []).map((item) => [Number(item.rank), item]));

    const evidenceRows = research.evidence.map((item) => ({
      business_id: business.id,
      discovery_run_id: discoveryRunId,
      candidate_id: candidateByRank.get(item.candidate_rank)?.id || null,
      market_scope: item.market_scope,
      country: item.country,
      source_name: item.source_name,
      source_url: item.source_url,
      source_type: item.source_type,
      evidence_type: item.evidence_type,
      claim: item.claim,
      metric_name: item.metric_name,
      metric_value: item.metric_value,
      metric_unit: item.metric_unit,
      image_url: item.image_url,
      observed_at: item.observed_at,
      confidence: item.confidence,
      metadata: item.metadata,
    }));
    const evidenceResult = await supabase.from('product_discovery_evidence').insert(evidenceRows).select('id');
    if (evidenceResult.error) throw evidenceResult.error;

    const previousResult = await supabase
      .from('product_discovery_runs')
      .update({ status: 'superseded', updated_at: new Date().toISOString() })
      .eq('business_id', business.id)
      .eq('status', 'ready')
      .neq('id', discoveryRunId);
    if (previousResult.error) throw previousResult.error;

    return {
      discovery_run_id: discoveryRunId,
      status: 'ready',
      candidate_ids: (candidateResult.data || []).sort((a, b) => Number(a.rank) - Number(b.rank)).map((item) => item.id),
      evidence_count: evidenceRows.length,
    };
  } catch (error) {
    if (discoveryRunId) {
      await supabase.from('product_discovery_runs').delete().eq('business_id', business.id).eq('id', discoveryRunId);
    }
    throw error;
  }
}

export async function executeActionRequest({ supabase, business, userId, request }) {
  const started = await supabase.from('agent_action_requests').update({
    status: 'executing',
    execution_started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', request.id);
  if (started.error) throw started.error;

  try {
    let result;
    if (request.action_type === 'market_research') {
      result = await executeMarketResearch({ supabase, business, request });
    } else if (request.action_type === 'create_operation_task') {
      result = await executeCreateOperationTask({ supabase, business, userId, request });
    } else if (request.action_type === 'create_content_draft') {
      result = await executeContentDraft({ supabase, business, request });
    } else {
      const unsupported = new Error(`Todavía no existe un ejecutor seguro para ${request.action_type}.`);
      unsupported.code = 'EXECUTOR_UNAVAILABLE';
      throw unsupported;
    }

    const completed = await supabase.from('agent_action_requests').update({
      status: 'completed',
      execution_result: result,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      error_message: null,
    }).eq('id', request.id);
    if (completed.error) throw completed.error;
    return { ...request, status: 'completed', execution_result: result };
  } catch (error) {
    const preflight = error?.code === 'AUTONOMY_PREFLIGHT';
    await supabase.from('agent_action_requests').update({
      status: preflight ? 'awaiting_approval' : 'failed',
      policy_decision: preflight ? 'approval_required' : request.policy_decision,
      requires_human: preflight ? true : request.requires_human,
      policy_reason: preflight ? String(error.message).slice(0, 2000) : request.policy_reason,
      error_message: String(error?.message || error).slice(0, 2000),
      updated_at: new Date().toISOString(),
    }).eq('id', request.id);
    return {
      ...request,
      status: preflight ? 'awaiting_approval' : 'failed',
      policy_decision: preflight ? 'approval_required' : request.policy_decision,
      policy_reason: preflight ? String(error.message) : request.policy_reason,
      error_message: String(error?.message || error),
    };
  }
}

export async function registerDirectorActions({ supabase, business, userId, agentRunId, actions }) {
  const normalized = (Array.isArray(actions) ? actions : []).map(normalizeDirectorAction).filter(Boolean).slice(0, 5);
  if (!normalized.length) return [];

  const { data: policies, error: policyError } = await supabase
    .from('autonomy_policies')
    .select('*')
    .eq('business_id', business.id)
    .eq('active', true);
  if (policyError) throw policyError;
  const byType = new Map((policies || []).map((policy) => [policy.action_type, policy]));
  const results = [];

  for (const action of normalized) {
    const policy = byType.get(action.type) || null;
    const evaluation = evaluateAutonomyPolicy(policy, action);
    const initialStatus = evaluation.decision === 'autonomous'
      ? 'authorized'
      : evaluation.decision === 'approval_required'
        ? 'awaiting_approval'
        : 'blocked';

    const { data: request, error } = await supabase.from('agent_action_requests').insert({
      business_id: business.id,
      agent_run_id: agentRunId,
      action_type: action.type,
      title: action.title,
      rationale: action.rationale || null,
      confidence: action.confidence,
      risk_level: action.risk_level,
      payload: action.payload,
      estimated_amount_ars: action.estimated_amount_ars,
      policy_id: policy?.id || null,
      policy_decision: evaluation.decision,
      policy_reason: evaluation.reason,
      status: initialStatus,
      requires_human: evaluation.requiresHuman,
    }).select('*').single();
    if (error) throw error;

    if (evaluation.decision === 'autonomous') {
      results.push(await executeActionRequest({ supabase, business, userId, request }));
    } else {
      results.push(request);
    }
  }
  return results;
}

export async function approveAndExecuteAction({ supabase, business, userId, requestId }) {
  const { data: request, error } = await supabase.from('agent_action_requests')
    .select('*')
    .eq('business_id', business.id)
    .eq('id', requestId)
    .single();
  if (error) throw error;
  if (!['awaiting_approval', 'authorized', 'failed'].includes(request.status)) {
    const stateError = new Error('La acción no está disponible para autorizar en su estado actual.');
    stateError.statusCode = 409;
    throw stateError;
  }
  const approved = await supabase.from('agent_action_requests').update({
    status: 'authorized',
    policy_decision: 'autonomous',
    policy_reason: 'Autorizada explícitamente por el propietario.',
    requires_human: false,
    approved_by: userId,
    approved_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', request.id).select('*').single();
  if (approved.error) throw approved.error;
  return executeActionRequest({ supabase, business, userId, request: approved.data });
}
