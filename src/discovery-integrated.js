import { createClient } from '@supabase/supabase-js';

const root = document.querySelector('#app');
let supabasePromise;
let active = false;
let loading = false;
let discovery = null;
let business = null;
let profile = null;
let selected = new Set();
let developmentLaunching = false;
let developmentTimer = null;
let lastBackgroundKickAt = 0;
const TIMEOUT_MS = 8000;
const DEVELOPMENT_POLL_MS = 4500;
const BACKGROUND_REKICK_MS = 20000;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const band = (value) => ({ low: 'Bajo', medium: 'Medio', high: 'Alto' }[value] || 'Sin dato');
const statusLabel = (value) => ({ researching: 'Investigando', ready: 'Lista para decidir', approved: 'Selección aprobada', superseded: 'Reemplazada', failed: 'Fallida', proposed: 'Propuesto', selected: 'Seleccionado', rejected: 'Descartado' }[value] || value || 'Sin estado');
const developmentStatusLabel = (value) => ({
  not_started: 'Sin iniciar',
  pending: 'Preparando desarrollo',
  queued: 'En cola',
  running: 'Especialistas trabajando',
  completed: 'Desarrollo técnico completo',
  partial: 'Desarrollo parcial',
  failed: 'Requiere revisión',
}[value] || 'Pendiente');
const developmentStageLabel = (value) => ({
  awaiting_selection: 'Esperando selección',
  selected: 'Selección confirmada',
  queued: 'Preparando equipo',
  product_design: 'Producto y Experiencia',
  production_review: 'Producción y Abastecimiento',
  quality_review: 'Calidad y Cumplimiento',
  persisting: 'Integrando fichas',
  completed: 'Fichas listas',
  error: 'Revisar error',
}[value] || value || 'Pendiente');

function timeout(promise, label) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} tardó demasiado.`)), TIMEOUT_MS); }),
  ]).finally(() => clearTimeout(timer));
}

async function db() {
  if (!supabasePromise) {
    supabasePromise = (async () => {
      const response = await timeout(fetch('/api/config'), 'La configuración');
      if (!response.ok) throw new Error(`No se pudo leer la configuración (${response.status}).`);
      const config = await response.json();
      return createClient(config.supabaseUrl, config.supabasePublishableKey);
    })();
  }
  return supabasePromise;
}

async function accessToken() {
  const client = await db();
  const { data } = await client.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Necesitás iniciar sesión.');
  return token;
}

async function authenticatedFetch(path, options = {}) {
  const token = await accessToken();
  return timeout(fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  }), 'La solicitud');
}

async function readDiscovery() {
  const client = await db();
  const accessResult = await timeout(client.rpc('current_business_access'), 'El acceso al negocio');
  if (accessResult.error) throw accessResult.error;
  const access = Array.isArray(accessResult.data) ? accessResult.data[0] || null : accessResult.data || null;
  if (!access?.business_id) throw new Error('No se encontró un negocio activo.');

  business = {
    id: access.business_id,
    name: access.business_name,
    stage: access.stage,
    city: access.city,
    province: access.province,
    country: access.country,
  };

  const [profileResult, runResult] = await Promise.all([
    timeout(client.from('business_profiles').select('*').eq('business_id', access.business_id).maybeSingle(), 'El perfil del negocio'),
    timeout(client.from('product_discovery_runs').select('*').eq('business_id', access.business_id).order('created_at', { ascending: false }).limit(1).maybeSingle(), 'La investigación'),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (runResult.error) throw runResult.error;
  profile = profileResult.data || null;

  if (!runResult.data) {
    discovery = null;
    selected = new Set();
    return;
  }

  const run = runResult.data;
  const [candidateResult, evidenceResult] = await Promise.all([
    timeout(client.from('product_discovery_candidates').select('*').eq('business_id', access.business_id).eq('discovery_run_id', run.id).order('rank'), 'Los candidatos'),
    timeout(client.from('product_discovery_evidence').select('*').eq('business_id', access.business_id).eq('discovery_run_id', run.id).order('created_at'), 'La evidencia'),
  ]);
  if (candidateResult.error) throw candidateResult.error;
  if (evidenceResult.error) throw evidenceResult.error;

  const candidates = candidateResult.data || [];
  let blueprints = [];
  if (candidates.length) {
    const blueprintResult = await timeout(
      client.from('product_discovery_blueprints').select('*').eq('business_id', access.business_id).in('candidate_id', candidates.map((item) => item.id)),
      'Las fichas técnicas',
    );
    if (blueprintResult.error) throw blueprintResult.error;
    blueprints = blueprintResult.data || [];
  }

  discovery = { run, candidates, evidence: evidenceResult.data || [], blueprints };
  selected = new Set(
    candidates.filter((item) => item.status === 'selected' || (run.status !== 'approved' && Number(item.rank) <= 3)).slice(0, 3).map((item) => item.id),
  );
}

function terminology() {
  const terms = profile?.terminology || {};
  const mode = profile?.offer_mode || 'mixed';
  return {
    singular: terms.offer_singular || (mode === 'service' ? 'servicio' : mode === 'product' ? 'producto' : 'oferta'),
    plural: terms.offer_plural || (mode === 'service' ? 'servicios' : mode === 'product' ? 'productos' : 'ofertas'),
  };
}

function imageBlock(url, alt, className = 'candidate-image') {
  if (!url || !/^https:\/\//i.test(url)) return `<div class="${className}"><span class="no-image">Sin imagen verificada</span></div>`;
  return `<div class="${className}"><img loading="lazy" src="${esc(url)}" alt="${esc(alt)}" referrerpolicy="no-referrer"></div>`;
}

function candidateCard(item) {
  const score = item.acceptance_score == null ? 'Sin score' : `${Number(item.acceptance_score).toLocaleString('es-AR', { maximumFractionDigits: 0 })}/100`;
  const checked = selected.has(item.id);
  return `<article class="candidate-card ${checked ? 'candidate-selected' : ''}">
    ${imageBlock(item.image_url, item.name)}
    <div class="candidate-body">
      <div class="candidate-rank"><strong>#${esc(item.rank)} · candidato</strong><span class="candidate-score">${esc(score)}</span></div>
      <h4>${esc(item.name)}</h4>
      <p>${esc(item.concept || item.presentation || 'Pendiente de definición.')}</p>
      <div class="candidate-signals">
        <div class="candidate-signal"><span>Aceptación</span><strong>${esc(band(item.acceptance_band))}</strong></div>
        <div class="candidate-signal"><span>Tendencia</span><strong>${esc(band(item.trend_strength))}</strong></div>
        <div class="candidate-signal"><span>Afinidad local</span><strong>${esc(band(item.argentina_fit))}</strong></div>
        <div class="candidate-signal"><span>Potencial visual</span><strong>${esc(band(item.visual_potential))}</strong></div>
      </div>
      <p><strong>Presentación:</strong> ${esc(item.presentation || 'Pendiente')}</p>
      <p>${esc(item.rationale || 'La justificación se completará con evidencia trazable.')}</p>
      ${discovery.run.status !== 'approved' ? `<label class="candidate-choice"><input type="checkbox" data-candidate-choice value="${esc(item.id)}" ${checked ? 'checked' : ''}> Incluir en selección estratégica</label>` : ''}
    </div>
  </article>`;
}

function comparisonTable(candidates) {
  if (!candidates.length) return '<div class="discovery-empty"><p>No hay candidatos comparables todavía.</p></div>';
  const { singular } = terminology();
  return `<div class="comparison-wrap"><table class="comparison-table"><thead><tr><th>#</th><th>${esc(singular)}</th><th>Aceptación</th><th>Tendencia</th><th>Afinidad local</th><th>Visual</th><th>Ejecución</th><th>Riesgo específico</th><th>Costo</th><th>Estado</th></tr></thead><tbody>${candidates.map((item) => `<tr><td>${esc(item.rank)}</td><td><strong>${esc(item.name)}</strong></td><td>${esc(band(item.acceptance_band))}${item.acceptance_score == null ? '' : ` · ${esc(Number(item.acceptance_score).toFixed(0))}/100`}</td><td>${esc(band(item.trend_strength))}</td><td>${esc(band(item.argentina_fit))}</td><td>${esc(band(item.visual_potential))}</td><td>${esc(band(item.production_complexity))}</td><td>${esc(band(item.conservation_risk))}</td><td>${esc(band(item.cost_complexity))}</td><td>${esc(statusLabel(item.status))}</td></tr>`).join('')}</tbody></table></div>`;
}

function evidenceCard(item, candidateById) {
  const candidate = candidateById.get(item.candidate_id);
  const image = item.image_url && /^https:\/\//i.test(item.image_url)
    ? `<div class="evidence-thumb"><img loading="lazy" src="${esc(item.image_url)}" alt="${esc(candidate?.name || item.source_name || 'Referencia')}" referrerpolicy="no-referrer"></div>`
    : '<div class="evidence-thumb"><span class="no-image">Referencia</span></div>';
  const link = item.source_url && /^https:\/\//i.test(item.source_url)
    ? `<a class="evidence-link" href="${esc(item.source_url)}" target="_blank" rel="noopener noreferrer">Abrir fuente</a>`
    : '';
  return `<article class="evidence-card">${image}<div class="evidence-copy"><strong>${esc(candidate?.name || item.source_name || item.evidence_type)}</strong><p>${esc(item.claim)}</p>${link}<div class="evidence-meta"><span>${esc(item.market_scope)}${item.country ? ` · ${esc(item.country)}` : ''}</span><span>${esc(item.confidence)}</span></div></div></article>`;
}

function listItems(items, formatter = (item) => item) {
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) return '<p class="muted">Pendiente.</p>';
  return `<ul class="discovery-detail-list">${rows.map((item) => `<li>${esc(formatter(item))}</li>`).join('')}</ul>`;
}

function blueprintCard(item, candidateById) {
  const candidate = candidateById.get(item.candidate_id);
  const offer = item.offer_definition && typeof item.offer_definition === 'object' ? item.offer_definition : {};
  const ingredients = Array.isArray(item.ingredients) ? item.ingredients : [];
  const steps = Array.isArray(item.instructions) && item.instructions.length ? item.instructions : (Array.isArray(item.process_steps) ? item.process_steps : []);
  const allergens = Array.isArray(item.allergens) ? item.allergens : [];
  const controls = Array.isArray(item.quality_controls) ? item.quality_controls : [];
  const conservation = item.conservation && typeof item.conservation === 'object' ? item.conservation : {};
  const costing = item.costing && typeof item.costing === 'object' ? item.costing : {};
  const componentText = (row) => {
    if (typeof row === 'string') return row;
    const quantity = row?.quantity == null ? '' : `${row.quantity}${row.unit ? ` ${row.unit}` : ''}`;
    return [row?.name, quantity, row?.notes].filter(Boolean).join(' · ');
  };
  const stepText = (row) => {
    if (typeof row === 'string') return row;
    return [row?.step ? `${row.step}.` : '', row?.instruction || row?.description, row?.duration_minutes != null ? `${row.duration_minutes} min` : '', row?.control].filter(Boolean).join(' ');
  };
  const conservationText = Object.entries(conservation).filter(([, value]) => value != null && value !== '').map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
  const costInputs = Array.isArray(costing.required_inputs) ? costing.required_inputs : [];

  return `<article class="blueprint-card">
    <div class="candidate-rank"><strong>${esc(candidate?.name || 'Definición operativa')}</strong><span class="candidate-score">${esc(item.development_status || item.approval_status || 'review')}</span></div>
    <p>${esc(offer.summary || candidate?.concept || 'Definición técnica en revisión.')}</p>
    <div class="blueprint-grid">
      <div class="blueprint-item"><strong>Tamaño / alcance</strong>${item.portion_grams == null ? esc(offer.unit_or_scope || 'Según el rubro') : `${esc(item.portion_grams)} g`}</div>
      <div class="blueprint-item"><strong>Rendimiento</strong>${item.yield_units == null ? 'Pendiente' : `${esc(item.yield_units)} unidades`}</div>
      <div class="blueprint-item"><strong>Componentes</strong>${ingredients.length}</div>
      <div class="blueprint-item"><strong>Pasos</strong>${steps.length}</div>
    </div>
    <details open><summary>Componentes / receta</summary>${listItems(ingredients, componentText)}</details>
    <details><summary>Proceso e instrucciones</summary>${listItems(steps, stepText)}</details>
    <details><summary>Conservación / condiciones</summary>${listItems(conservationText)}</details>
    <details><summary>Alérgenos y controles</summary>${listItems([...allergens.map((value) => `Alérgeno: ${value}`), ...controls])}</details>
    <details><summary>Costeo</summary><p>${esc(costing.note || 'Pendiente de costos reales y trazables.')}</p>${listItems(costInputs)}</details>
    ${item.quality_notes ? `<p class="discovery-note"><strong>Calidad:</strong> ${esc(item.quality_notes)}</p>` : ''}
  </article>`;
}

function developmentPanel(run, blueprints) {
  if (run.status !== 'approved') return '';
  const status = run.development_status || 'pending';
  const stage = run.development_stage || 'selected';
  const complete = ['completed', 'partial'].includes(status);
  const failed = status === 'failed';
  const progress = status === 'running' ? `Trabajando ahora: ${developmentStageLabel(stage)}` : developmentStatusLabel(status);
  return `<section class="discovery-panel development-panel">
    <div class="discovery-panel-head"><div><h4>Desarrollo técnico</h4><p>La selección ya es una decisión humana. Desde acá el equipo técnico trabaja automáticamente sin publicar, gastar ni comprometer ventas.</p></div><span class="discovery-status">${esc(progress)}</span></div>
    <div class="blueprint-grid">
      <div class="blueprint-item"><strong>1 · Producto</strong>${stage === 'product_design' ? 'En curso…' : complete || ['production_review','quality_review','persisting','completed'].includes(stage) ? 'Procesado' : 'Pendiente'}</div>
      <div class="blueprint-item"><strong>2 · Producción</strong>${stage === 'production_review' ? 'En curso…' : complete || ['quality_review','persisting','completed'].includes(stage) ? 'Procesado' : 'Pendiente'}</div>
      <div class="blueprint-item"><strong>3 · Calidad</strong>${stage === 'quality_review' ? 'En curso…' : complete || ['persisting','completed'].includes(stage) ? 'Procesado' : 'Pendiente'}</div>
      <div class="blueprint-item"><strong>Resultado</strong>${blueprints.length ? `${blueprints.length} fichas` : complete ? 'Sin fichas' : 'En preparación'}</div>
    </div>
    ${run.development_error_message ? `<div class="discovery-note"><strong>Observación:</strong> ${esc(run.development_error_message)}</div>` : ''}
    ${failed ? '<button class="primary" id="retry-development">Reintentar desarrollo técnico</button>' : ''}
  </section>`;
}

function viewHtml() {
  const { plural } = terminology();
  if (!discovery) return `<div class="discovery-shell" data-discovery-screen><section class="discovery-hero"><div><span class="eyebrow">Descubrimiento de oportunidades</span><h3>Primero investigamos. Después decidimos.</h3><p>Este módulo usa el perfil real de la PyME para investigar mercado, competencia y tendencias. El núcleo es el mismo para cualquier rubro.</p></div></section><section class="discovery-empty"><h3>Todavía no hay una investigación registrada</h3><p>Iniciá una investigación para generar candidatos con evidencia trazable.</p></section></div>`;

  const { run, candidates = [], evidence = [], blueprints = [] } = discovery;
  const candidateById = new Map(candidates.map((item) => [item.id, item]));
  const selectedCount = candidates.filter((item) => item.status === 'selected').length;
  return `<div class="discovery-shell" data-discovery-screen>
    <section class="discovery-hero"><div><span class="eyebrow">Descubrimiento de oportunidades</span><h3>${esc(run.title || 'Investigación de mercado')}</h3><p>${esc(run.objective || 'Comparación de oportunidades orientada a decidir qué validar primero.')}</p><div class="discovery-note"><span class="discovery-status">${esc(statusLabel(run.status))}</span> · ${candidates.length} candidatos · ${evidence.length} evidencias</div></div><div class="discovery-actions"><button class="secondary" id="discovery-copy-summary">Copiar resumen</button><button class="primary" id="discovery-export-excel">Exportar Excel</button></div></section>
    <section class="discovery-panel"><div class="discovery-panel-head"><div><h4>Resumen ejecutivo</h4><p>Lectura corta para decidir desde computadora o teléfono.</p></div></div><div class="discovery-summary">${esc(run.executive_summary || 'La investigación todavía no tiene resumen ejecutivo.')}</div>${run.recommendation_notes ? `<div class="discovery-note"><strong>Nota:</strong> ${esc(run.recommendation_notes)}</div>` : ''}</section>
    <section><div class="discovery-panel-head"><div><h4>Candidatos propuestos</h4><p>${esc(plural)} ordenados como hipótesis de aceptación, no como garantía de ventas.</p></div>${run.status !== 'approved' ? `<button class="primary" id="approve-discovery-selection">Confirmar ${selected.size} candidato${selected.size === 1 ? '' : 's'}</button>` : `<span class="discovery-status">${selectedCount} seleccionados</span>`}</div><div class="discovery-grid">${candidates.slice(0, 6).map(candidateCard).join('')}</div><div id="discovery-selection-status" class="discovery-note"></div></section>
    ${developmentPanel(run, blueprints)}
    <section class="discovery-panel"><div class="discovery-panel-head"><div><h4>Cuadro comparativo</h4><p>Señales comerciales y operativas en una sola vista.</p></div></div>${comparisonTable(candidates)}</section>
    <section class="discovery-panel"><div class="discovery-panel-head"><div><h4>Evidencia e imágenes</h4><p>Cada referencia conserva fuente, mercado y nivel de confianza.</p></div></div>${evidence.length ? `<div class="evidence-grid">${evidence.slice(0, 16).map((item) => evidenceCard(item, candidateById)).join('')}</div>` : '<div class="discovery-empty"><p>Todavía no hay evidencia visual cargada.</p></div>'}</section>
    <section class="discovery-panel"><div class="discovery-panel-head"><div><h4>Definición operativa posterior a la selección</h4><p>El detalle se adapta al rubro: receta y conservación, prestación del servicio, recursos, pasos y controles.</p></div></div>${blueprints.length ? `<div class="blueprint-list">${blueprints.map((item) => blueprintCard(item, candidateById)).join('')}</div>` : '<div class="discovery-empty"><p>Las fichas se generan automáticamente después de confirmar la selección.</p></div>'}</section>
  </div>`;
}

function ensureNavigation() {
  const desktop = document.querySelector('.sidebar .nav');
  if (desktop && !desktop.querySelector('[data-discovery-integrated]')) {
    const button = document.createElement('button');
    button.dataset.discoveryIntegrated = 'true';
    button.innerHTML = '<span class="nav-icon">P</span><span>Descubrimiento</span>';
    desktop.insertBefore(button, desktop.querySelector('[data-view="operation"]') || null);
  }
  const mobile = document.querySelector('.owner-mobile-nav');
  if (mobile && !mobile.querySelector('[data-discovery-integrated]')) {
    const button = document.createElement('button');
    button.dataset.discoveryIntegrated = 'true';
    button.textContent = 'Descubrir';
    mobile.insertBefore(button, mobile.querySelector('[data-view="operation"]') || null);
  }
}

function markActive() {
  document.querySelectorAll('.nav button,.owner-mobile-nav button').forEach((item) => item.classList.remove('active'));
  document.querySelectorAll('[data-discovery-integrated]').forEach((item) => item.classList.add('active'));
  const title = document.querySelector('.topbar-title h2');
  const subtitle = document.querySelector('.topbar-title p');
  if (title) title.textContent = 'Descubrimiento';
  if (subtitle) subtitle.textContent = 'Mercado, tendencias y oportunidades';
}

function renderLoading() {
  const content = document.querySelector('.main .content');
  if (!content) return;
  content.innerHTML = '<div class="discovery-loading" data-discovery-screen><strong>Cargando investigación…</strong><span>Máximo 8 segundos.</span></div>';
}

function renderError(error) {
  const content = document.querySelector('.main .content');
  if (!content) return;
  content.innerHTML = `<section class="discovery-empty" data-discovery-screen><h3>No se pudo cargar Descubrimiento</h3><p>${esc(error.message || 'Error desconocido.')}</p><button class="primary" id="retry-discovery">Reintentar</button></section>`;
}

function renderDiscovery() {
  const content = document.querySelector('.main .content');
  if (!content) return;
  content.innerHTML = viewHtml();
  bindActions();
}

function stopDevelopmentPolling() {
  if (developmentTimer) clearTimeout(developmentTimer);
  developmentTimer = null;
}

async function kickBackground(agentRunId) {
  if (!agentRunId) return;
  const now = Date.now();
  if (now - lastBackgroundKickAt < BACKGROUND_REKICK_MS) return;
  lastBackgroundKickAt = now;
  const token = await accessToken();
  await fetch('/.netlify/functions/opportunity-development-background', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ discoveryRunId: discovery.run.id, agentRunId }),
  }).catch(() => {});
}

async function queueDevelopment(retry = false) {
  if (!discovery?.run?.id || developmentLaunching) return;
  developmentLaunching = true;
  try {
    const response = await authenticatedFetch(`/api/discovery/${encodeURIComponent(discovery.run.id)}/develop`, {
      method: 'POST',
      body: JSON.stringify({ retry }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `No se pudo iniciar el desarrollo (${response.status}).`);
    if (body.agentRunId && !body.alreadyCompleted) await kickBackground(body.agentRunId);
    await readDiscovery();
    if (active) renderDiscovery();
    scheduleDevelopmentPolling();
  } catch (error) {
    const host = document.querySelector('.development-panel');
    if (host) host.insertAdjacentHTML('beforeend', `<div class="discovery-note"><strong>No se pudo iniciar:</strong> ${esc(error.message)}</div>`);
  } finally {
    developmentLaunching = false;
  }
}

function scheduleDevelopmentPolling() {
  stopDevelopmentPolling();
  if (!active || !discovery?.run) return;
  const status = discovery.run.development_status || 'not_started';
  if (!['pending', 'queued', 'running'].includes(status)) return;
  developmentTimer = setTimeout(async () => {
    if (!active) return;
    try {
      await readDiscovery();
      if (!active) return;
      renderDiscovery();
      const currentStatus = discovery?.run?.development_status;
      if (currentStatus === 'queued' && discovery.run.development_agent_run_id) {
        await kickBackground(discovery.run.development_agent_run_id);
      }
      scheduleDevelopmentPolling();
    } catch (error) {
      if (active) renderError(error);
    }
  }, DEVELOPMENT_POLL_MS);
}

async function ensureDevelopmentWorkflow() {
  if (!discovery?.run || discovery.run.status !== 'approved') return;
  const status = discovery.run.development_status || 'not_started';
  if (['not_started', 'pending'].includes(status)) {
    await queueDevelopment(false);
    return;
  }
  if (status === 'queued' && discovery.run.development_agent_run_id) await kickBackground(discovery.run.development_agent_run_id);
  scheduleDevelopmentPolling();
}

async function activate() {
  if (loading) return;
  active = true;
  ensureNavigation();
  markActive();
  loading = true;
  renderLoading();
  try {
    await readDiscovery();
    if (!active) return;
    markActive();
    renderDiscovery();
    ensureDevelopmentWorkflow().catch(() => {});
  } catch (error) {
    if (active) renderError(error);
  } finally {
    loading = false;
  }
}

async function confirmSelection() {
  if (!discovery?.run?.id || selected.size === 0) return;
  const status = document.querySelector('#discovery-selection-status');
  const button = document.querySelector('#approve-discovery-selection');
  if (button) { button.disabled = true; button.textContent = 'Guardando…'; }
  if (status) status.textContent = 'Confirmando selección…';
  try {
    const client = await db();
    const result = await timeout(client.rpc('confirm_discovery_selection', { p_run_id: discovery.run.id, p_candidate_ids: [...selected] }), 'La confirmación');
    if (result.error) throw result.error;
    if (status) status.textContent = 'Selección confirmada ✓';
    await readDiscovery();
    renderDiscovery();
    await ensureDevelopmentWorkflow();
  } catch (error) {
    if (status) status.textContent = error.message;
    if (button) { button.disabled = false; button.textContent = `Confirmar ${selected.size} candidatos`; }
  }
}

async function exportExcel(button) {
  const runId = discovery?.run?.id;
  if (!runId) return;
  button.disabled = true;
  const original = button.textContent;
  button.textContent = 'Generando Excel…';
  try {
    const token = await accessToken();
    const response = await timeout(fetch(`/api/discovery/${encodeURIComponent(runId)}/excel`, { headers: { Authorization: `Bearer ${token}` } }), 'La exportación');
    if (!response.ok) throw new Error(`No se pudo exportar Excel (${response.status}).`);
    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition') || '';
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] || 'Descubrimiento_Mercado.xlsx';
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
    button.textContent = 'Excel listo ✓';
  } catch (error) {
    button.textContent = error.message || 'Error';
  } finally {
    setTimeout(() => { button.disabled = false; button.textContent = original; }, 1800);
  }
}

function bindActions() {
  document.querySelectorAll('[data-candidate-choice]').forEach((input) => input.addEventListener('change', () => {
    if (input.checked) {
      if (selected.size >= 3 && !selected.has(input.value)) input.checked = false;
      else selected.add(input.value);
    } else selected.delete(input.value);
    renderDiscovery();
  }));
  document.querySelector('#approve-discovery-selection')?.addEventListener('click', confirmSelection);
  document.querySelector('#retry-development')?.addEventListener('click', () => queueDevelopment(true));
  document.querySelector('#discovery-copy-summary')?.addEventListener('click', async (event) => {
    const text = [discovery?.run?.executive_summary, discovery?.run?.recommendation_notes].filter(Boolean).join('\n\n') || 'Sin resumen disponible.';
    await navigator.clipboard.writeText(text);
    const button = event.currentTarget;
    const original = button.textContent;
    button.textContent = 'Copiado ✓';
    setTimeout(() => { button.textContent = original; }, 1200);
  });
  document.querySelector('#discovery-export-excel')?.addEventListener('click', (event) => exportExcel(event.currentTarget));
  document.querySelector('#retry-discovery')?.addEventListener('click', activate);
}

document.addEventListener('click', (event) => {
  const button = event.target.closest?.('[data-discovery-integrated]');
  if (button) {
    event.preventDefault();
    event.stopPropagation();
    activate();
    return;
  }
  if (event.target.closest?.('[data-view]')) {
    active = false;
    stopDevelopmentPolling();
  }
}, true);

const observer = new MutationObserver(() => {
  queueMicrotask(() => {
    ensureNavigation();
    if (active && !document.querySelector('[data-discovery-screen]')) {
      markActive();
      renderDiscovery();
    }
  });
});
observer.observe(root, { childList: true });
setTimeout(ensureNavigation, 250);
