import { createClient } from '@supabase/supabase-js';

let supabase;
let configPromise;
let discoveryActive = false;
let loading = false;
let lastDiscovery = null;

const root = document.querySelector('#app');
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const band = (value) => ({ low: 'Bajo', medium: 'Medio', high: 'Alto' }[value] || 'Sin dato');
const statusLabel = (value) => ({ researching: 'Investigando', ready: 'Lista para decidir', approved: 'Selección aprobada', superseded: 'Reemplazada', failed: 'Fallida', proposed: 'Propuesto', selected: 'Seleccionado', rejected: 'Descartado' }[value] || value || 'Sin estado');

async function getSupabase() {
  if (supabase) return supabase;
  configPromise ||= fetch('/api/config').then(async (response) => {
    if (!response.ok) throw new Error(`Error ${response.status}`);
    return response.json();
  });
  const config = await configPromise;
  supabase = createClient(config.supabaseUrl, config.supabasePublishableKey);
  return supabase;
}

async function authToken() {
  const client = await getSupabase();
  const { data } = await client.auth.getSession();
  return data?.session?.access_token || null;
}

async function request(path, options = {}) {
  const token = await authToken();
  if (!token) throw new Error('Necesitás iniciar sesión.');
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const type = response.headers.get('content-type') || '';
  if (!response.ok) {
    const body = type.includes('application/json') ? await response.json().catch(() => ({})) : {};
    throw new Error(body.error || `Error ${response.status}`);
  }
  if (type.includes('application/json')) return response.json();
  return response;
}

function imageBlock(url, alt, className = 'candidate-image') {
  if (!url || !/^https:\/\//i.test(url)) return `<div class="${className}"><span class="no-image">Sin imagen verificada</span></div>`;
  return `<div class="${className}"><img loading="lazy" src="${esc(url)}" alt="${esc(alt)}" referrerpolicy="no-referrer"></div>`;
}

function candidateCard(item) {
  const score = item.acceptance_score == null ? 'Sin score' : `${Number(item.acceptance_score).toLocaleString('es-AR', { maximumFractionDigits: 0 })}/100`;
  const checked = item.status === 'selected' || (item.status === 'proposed' && Number(item.rank) <= 3);
  return `
    <article class="candidate-card">
      ${imageBlock(item.image_url, item.name)}
      <div class="candidate-body">
        <div class="candidate-rank"><strong>#${esc(item.rank)} · candidato</strong><span class="candidate-score">${esc(score)}</span></div>
        <h4>${esc(item.name)}</h4>
        <p>${esc(item.concept || item.presentation || 'Pendiente de descripción técnica.')}</p>
        <div class="candidate-signals">
          <div class="candidate-signal"><span>Aceptación</span><strong>${esc(band(item.acceptance_band))}</strong></div>
          <div class="candidate-signal"><span>Tendencia</span><strong>${esc(band(item.trend_strength))}</strong></div>
          <div class="candidate-signal"><span>Afinidad AR</span><strong>${esc(band(item.argentina_fit))}</strong></div>
          <div class="candidate-signal"><span>Potencial visual</span><strong>${esc(band(item.visual_potential))}</strong></div>
        </div>
        <p><strong>Presentación:</strong> ${esc(item.presentation || 'Pendiente')}</p>
        <p>${esc(item.rationale || 'La justificación se completará con evidencia trazable.')}</p>
        <label class="candidate-choice"><input type="checkbox" data-candidate-choice value="${esc(item.id)}" ${checked ? 'checked' : ''}> Incluir en selección estratégica</label>
      </div>
    </article>`;
}

function comparisonTable(candidates) {
  if (!candidates.length) return '<div class="discovery-empty"><p>No hay candidatos comparables todavía.</p></div>';
  return `
    <div class="comparison-wrap">
      <table class="comparison-table">
        <thead><tr><th>#</th><th>Producto</th><th>Aceptación</th><th>Tendencia</th><th>Afinidad AR</th><th>Visual</th><th>Producción</th><th>Conservación</th><th>Costo</th><th>Estado</th></tr></thead>
        <tbody>${candidates.map((item) => `<tr>
          <td>${esc(item.rank)}</td><td><strong>${esc(item.name)}</strong></td>
          <td>${esc(band(item.acceptance_band))}${item.acceptance_score == null ? '' : ` · ${esc(Number(item.acceptance_score).toFixed(0))}/100`}</td>
          <td>${esc(band(item.trend_strength))}</td><td>${esc(band(item.argentina_fit))}</td><td>${esc(band(item.visual_potential))}</td>
          <td>${esc(band(item.production_complexity))}</td><td>${esc(band(item.conservation_risk))}</td><td>${esc(band(item.cost_complexity))}</td><td>${esc(statusLabel(item.status))}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

function evidenceCard(item, candidateById) {
  const candidate = candidateById.get(item.candidate_id);
  const image = item.image_url && /^https:\/\//i.test(item.image_url)
    ? `<div class="evidence-thumb"><img loading="lazy" src="${esc(item.image_url)}" alt="${esc(candidate?.name || item.source_name || 'Referencia')}" referrerpolicy="no-referrer"></div>`
    : '<div class="evidence-thumb"><span class="no-image">Referencia</span></div>';
  const sourceLink = item.source_url && /^https:\/\//i.test(item.source_url)
    ? `<a class="evidence-link" href="${esc(item.source_url)}" target="_blank" rel="noopener noreferrer">Abrir fuente</a>`
    : '';
  return `<article class="evidence-card">${image}<div class="evidence-copy"><strong>${esc(candidate?.name || item.source_name || item.evidence_type)}</strong><p>${esc(item.claim)}</p>${sourceLink}<div class="evidence-meta"><span>${esc(item.market_scope)}${item.country ? ` · ${esc(item.country)}` : ''}</span><span>${esc(item.confidence)}</span></div></div></article>`;
}

function blueprintCard(blueprint, candidateById) {
  const candidate = candidateById.get(blueprint.candidate_id);
  const ingredients = Array.isArray(blueprint.ingredients) ? blueprint.ingredients.length : 0;
  const steps = Array.isArray(blueprint.instructions) ? blueprint.instructions.length : 0;
  const conservation = blueprint.conservation && typeof blueprint.conservation === 'object'
    ? Object.values(blueprint.conservation).filter(Boolean).slice(0, 3).join(' · ')
    : '';
  return `<article class="blueprint-card"><h5>${esc(candidate?.name || 'Ficha técnica')}</h5><div class="blueprint-grid">
    <div class="blueprint-item"><strong>Porción</strong>${blueprint.portion_grams == null ? 'Pendiente' : `${esc(blueprint.portion_grams)} g`}</div>
    <div class="blueprint-item"><strong>Rendimiento</strong>${blueprint.yield_units == null ? 'Pendiente' : `${esc(blueprint.yield_units)} unidades`}</div>
    <div class="blueprint-item"><strong>Receta</strong>${ingredients} ingredientes · ${steps} pasos</div>
    <div class="blueprint-item"><strong>Conservación</strong>${esc(conservation || 'Pendiente')}</div>
  </div>${blueprint.quality_notes ? `<p class="discovery-note">${esc(blueprint.quality_notes)}</p>` : ''}</article>`;
}

function emptyView() {
  return `
    <div class="discovery-shell">
      <section class="discovery-hero"><div><span class="eyebrow">Descubrimiento de producto</span><h3>Primero investigamos. Después producimos.</h3><p>Este módulo reunirá evidencia nacional e internacional, presentaciones, sabores, señales de interacción y competencia para proponer tres candidatos. No se mostrará un ranking sin fuentes verificables.</p></div></section>
      <section class="discovery-empty"><h3>Todavía no hay una investigación registrada</h3><p>El próximo paso es pedir al Director una investigación de mercado con evidencia trazable. Cuando termine, acá aparecerán el Top 3, el cuadro comparativo, las imágenes de referencia y la exportación a Excel.</p><div style="margin-top:18px"><button class="primary" id="prepare-discovery-mission">Preparar misión de investigación</button></div></section>
    </div>`;
}

function discoveryView(discovery) {
  if (!discovery) return emptyView();
  const { run, candidates = [], evidence = [], blueprints = [] } = discovery;
  const candidateById = new Map(candidates.map((item) => [item.id, item]));
  const selectedCount = candidates.filter((item) => item.status === 'selected').length;
  return `
    <div class="discovery-shell">
      <section class="discovery-hero">
        <div><span class="eyebrow">Descubrimiento de producto</span><h3>${esc(run.title || 'Investigación de mercado')}</h3><p>${esc(run.objective || 'Comparación nacional e internacional orientada a decidir qué productos validar primero.')}</p><div class="discovery-note"><span class="discovery-status">${esc(statusLabel(run.status))}</span> · ${candidates.length} candidatos · ${evidence.length} evidencias</div></div>
        <div class="discovery-actions"><button class="secondary" id="discovery-copy-summary">Copiar resumen</button><button class="primary" id="discovery-export-excel">Exportar Excel</button></div>
      </section>
      <section class="discovery-panel"><div class="discovery-panel-head"><div><h4>Resumen ejecutivo</h4><p>Lectura corta para decidir desde computadora o teléfono.</p></div></div><div class="discovery-summary">${esc(run.executive_summary || 'La investigación todavía no tiene resumen ejecutivo.')}</div>${run.recommendation_notes ? `<div class="discovery-note"><strong>Nota:</strong> ${esc(run.recommendation_notes)}</div>` : ''}</section>
      <section><div class="discovery-panel-head"><div><h4>Top de productos propuestos</h4><p>Ordenados por hipótesis de aceptación, no como garantía de ventas.</p></div>${run.status !== 'approved' ? '<button class="primary" id="approve-discovery-selection">Confirmar selección</button>' : `<span class="discovery-status">${selectedCount} seleccionados</span>`}</div><div class="discovery-grid">${candidates.slice(0, 6).map(candidateCard).join('')}</div></section>
      <section class="discovery-panel"><div class="discovery-panel-head"><div><h4>Cuadro comparativo</h4><p>Señales comerciales, visuales y operativas en una sola vista.</p></div></div>${comparisonTable(candidates)}</section>
      <section class="discovery-panel"><div class="discovery-panel-head"><div><h4>Evidencia e imágenes</h4><p>Cada referencia debe conservar fuente, mercado y nivel de confianza.</p></div></div>${evidence.length ? `<div class="evidence-grid">${evidence.slice(0, 16).map((item) => evidenceCard(item, candidateById)).join('')}</div>` : '<div class="discovery-empty"><p>Todavía no hay evidencia visual cargada.</p></div>'}</section>
      <section class="discovery-panel"><div class="discovery-panel-head"><div><h4>Ficha técnica posterior a la selección</h4><p>Receta, pasos, conservación y packaging se completan después de definir los productos.</p></div></div>${blueprints.length ? `<div class="blueprint-list">${blueprints.map((item) => blueprintCard(item, candidateById)).join('')}</div>` : '<div class="discovery-empty"><p>Las fichas técnicas todavía no fueron generadas. Esto es correcto hasta confirmar los candidatos.</p></div>'}</section>
    </div>`;
}

async function exportExcel() {
  const runId = lastDiscovery?.run?.id;
  if (!runId) return;
  const token = await authToken();
  const response = await fetch(`/api/discovery/${encodeURIComponent(runId)}/excel`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`No se pudo exportar Excel (${response.status}).`);
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const name = disposition.match(/filename="([^"]+)"/)?.[1] || 'Descubrimiento_Producto.xlsx';
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function approveSelection() {
  const checked = [...document.querySelectorAll('[data-candidate-choice]:checked')].map((input) => input.value);
  if (!checked.length) return alert('Seleccioná al menos un producto.');
  if (checked.length > 3) return alert('La primera validación admite hasta tres productos.');
  const button = document.querySelector('#approve-discovery-selection');
  if (button) { button.disabled = true; button.textContent = 'Guardando…'; }
  try {
    await request(`/api/discovery/${encodeURIComponent(lastDiscovery.run.id)}/select`, { method: 'POST', body: JSON.stringify({ candidate_ids: checked }) });
    await loadAndRender();
  } catch (error) {
    alert(error.message);
    if (button) { button.disabled = false; button.textContent = 'Confirmar selección'; }
  }
}

function prepareMission() {
  discoveryActive = false;
  document.querySelector('[data-view="director"]')?.click();
  setTimeout(() => {
    const input = document.querySelector('#mission');
    if (!input) return;
    input.value = 'Investigá el mercado de postres individuales en envases transparentes para Postres Experiencia. Relevá Argentina y mercados internacionales, usando evidencia actual y trazable. Compará presentación, envases, sabores, productos en tendencia, señales de interacción e interés, competencia y formatos visuales. No uses likes aislados como única señal. Cruzá tendencia, afinidad con Argentina, potencial visual, diferenciación, factibilidad productiva, conservación y complejidad de costo. Proponé exactamente tres variedades en orden de mayor a menor hipótesis de aceptación comercial y explicá la evidencia que sostiene el orden. No inventes métricas ni disponibilidad. Conservá fuentes e imágenes de referencia cuando existan.';
    input.focus();
  }, 80);
}

function bindDiscoveryActions() {
  document.querySelector('#discovery-export-excel')?.addEventListener('click', () => exportExcel().catch((error) => alert(error.message)));
  document.querySelector('#discovery-copy-summary')?.addEventListener('click', async () => {
    const text = [lastDiscovery?.run?.executive_summary, lastDiscovery?.run?.recommendation_notes].filter(Boolean).join('\n\n');
    await navigator.clipboard.writeText(text || 'Sin resumen disponible.');
    const button = document.querySelector('#discovery-copy-summary');
    if (button) button.textContent = 'Copiado';
  });
  document.querySelector('#approve-discovery-selection')?.addEventListener('click', approveSelection);
  document.querySelector('#prepare-discovery-mission')?.addEventListener('click', prepareMission);
  document.querySelectorAll('[data-candidate-choice]').forEach((input) => input.addEventListener('change', () => {
    const checked = document.querySelectorAll('[data-candidate-choice]:checked');
    if (checked.length > 3) {
      input.checked = false;
      alert('Podés seleccionar hasta tres productos para la primera validación.');
    }
  }));
}

async function loadAndRender() {
  if (!discoveryActive || loading) return;
  const content = document.querySelector('.main .content');
  if (!content) return;
  loading = true;
  content.innerHTML = '<div class="discovery-loading">Cargando investigación…</div>';
  try {
    const data = await request('/api/discovery');
    lastDiscovery = data.discovery || null;
    content.innerHTML = discoveryView(lastDiscovery);
    bindDiscoveryActions();
  } catch (error) {
    content.innerHTML = `<section class="discovery-empty"><h3>No se pudo cargar Descubrimiento</h3><p>${esc(error.message)}</p></section>`;
  } finally {
    loading = false;
  }
}

function setTopbar() {
  const title = document.querySelector('.topbar-title h2');
  const subtitle = document.querySelector('.topbar-title p');
  if (title) title.textContent = 'Descubrimiento';
  if (subtitle) subtitle.textContent = 'Mercado, tendencias y selección de producto';
}

function activateDiscovery() {
  discoveryActive = true;
  document.querySelectorAll('.nav button,.owner-mobile-nav button').forEach((button) => button.classList.remove('active'));
  document.querySelectorAll('[data-discovery-nav]').forEach((button) => button.classList.add('active'));
  setTopbar();
  loadAndRender();
}

function ensureNavigation() {
  const ownerNav = document.querySelector('.sidebar .nav');
  if (!ownerNav) return;
  if (!ownerNav.querySelector('[data-discovery-nav]')) {
    const button = document.createElement('button');
    button.dataset.discoveryNav = 'true';
    button.className = 'discovery-nav-btn';
    button.innerHTML = '<span class="nav-icon">P</span><span>Descubrimiento</span>';
    button.addEventListener('click', activateDiscovery);
    const operation = ownerNav.querySelector('[data-view="operation"]');
    ownerNav.insertBefore(button, operation || null);
  }
  const mobile = document.querySelector('.owner-mobile-nav');
  if (mobile && !mobile.querySelector('[data-discovery-nav]')) {
    const button = document.createElement('button');
    button.dataset.discoveryNav = 'true';
    button.className = 'discovery-mobile-btn';
    button.textContent = 'Descubrir';
    button.addEventListener('click', activateDiscovery);
    const operation = mobile.querySelector('[data-view="operation"]');
    mobile.insertBefore(button, operation || null);
  }
  if (discoveryActive) {
    document.querySelectorAll('[data-discovery-nav]').forEach((button) => button.classList.add('active'));
    setTopbar();
    loadAndRender();
  }
}

document.addEventListener('click', (event) => {
  if (event.target.closest?.('[data-view]')) discoveryActive = false;
}, true);

const observer = new MutationObserver(() => ensureNavigation());
observer.observe(root, { childList: true, subtree: true });
setTimeout(ensureNavigation, 250);
