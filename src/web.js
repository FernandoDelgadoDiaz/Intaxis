import { createClient } from '@supabase/supabase-js';

const root = document.querySelector('#app');
let supabase;
let session = null;
let state = { business: null, snapshot: null };
let activeView = 'director';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const fmtNumber = (value, maximumFractionDigits = 2) => Number(value || 0).toLocaleString('es-AR', { maximumFractionDigits });
const fmtUsd = (value) => `US$ ${Number(value || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
const stageLabel = (value) => ({ concepto: 'Concepto', validacion: 'Validación', producto: 'Producto', costeo: 'Costeo', viabilidad: 'Viabilidad', piloto: 'Piloto', lanzamiento: 'Lanzamiento', seguimiento: 'Seguimiento', crecimiento: 'Crecimiento' }[value] || value || 'Sin etapa');
const productStatusLabel = (value) => ({ draft: 'Borrador', test: 'Prueba', active: 'Activo', paused: 'Pausado', retired: 'Retirado' }[value] || value);

async function init() {
  try {
    const configResponse = await fetch('/api/config');
    const config = await configResponse.json();
    if (!config.supabaseUrl || !config.supabasePublishableKey) {
      throw new Error('La infraestructura todavía no está configurada.');
    }
    supabase = createClient(config.supabaseUrl, config.supabasePublishableKey);
    const current = await supabase.auth.getSession();
    session = current.data.session;
    supabase.auth.onAuthStateChange((_event, nextSession) => {
      session = nextSession;
      if (session) loadBusiness().then(render); else render();
    });
    if (session) await loadBusiness();
    render();
  } catch (error) {
    root.innerHTML = `<div class="auth-shell"><div class="auth-panel"><div class="login-card"><div class="brand"><div class="logo">AP</div><div class="brand-copy"><h1>Agentic Pymes</h1><p>Operación empresarial asistida</p></div></div><div class="notice danger">${esc(error.message)}</div></div></div></div>`;
  }
}

async function api(path, options = {}) {
  const token = session?.access_token;
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    const body = contentType.includes('application/json') ? await response.json().catch(() => ({})) : {};
    throw new Error(body.error || `Error ${response.status}`);
  }
  if (contentType.includes('application/json')) return response.json();
  return response;
}

async function loadBusiness() {
  state = await api('/api/mi-negocio');
}

async function sendMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
}

function loginView() {
  return `
    <div class="auth-shell">
      <section class="auth-showcase">
        <div class="auth-copy">
          <div class="auth-kicker">Sistema operativo empresarial</div>
          <h1>Decisiones mejores.<br>Operación más simple.</h1>
          <p>Agentic Pymes conecta los datos reales de tu negocio con un Director y especialistas que investigan, analizan y proponen acciones medibles.</p>
          <div class="auth-points">
            <div class="auth-point"><strong>Mi Negocio</strong>Una fuente de verdad para productos, costos y capacidad.</div>
            <div class="auth-point"><strong>Equipo especialista</strong>Se activa sólo cuando puede cambiar la decisión.</div>
            <div class="auth-point"><strong>Control humano</strong>Gastar, publicar o comprometer requiere autorización.</div>
          </div>
        </div>
      </section>
      <section class="auth-panel">
        <div class="login-card">
          <div class="brand"><div class="logo">AP</div><div class="brand-copy"><h1>Agentic Pymes</h1><p>Gestión inteligente para PyMEs</p></div></div>
          <h2>Ingresá a tu empresa</h2>
          <p class="muted">Usamos un enlace seguro enviado por correo. No necesitás recordar otra contraseña.</p>
          <form id="login-form">
            <div class="field"><label>Correo electrónico</label><input id="login-email" type="email" autocomplete="email" required placeholder="tu@email.com"></div>
            <button class="primary" type="submit">Enviar enlace de acceso</button>
            <div id="login-status" class="muted"></div>
          </form>
          <div class="login-help">Tu información de negocio permanece asociada a tu usuario y protegida mediante las políticas de acceso de Supabase.</div>
        </div>
      </section>
    </div>`;
}

function navButton(view, label, icon) {
  return `<button data-view="${view}" class="${activeView === view ? 'active' : ''}"><span class="nav-icon">${icon}</span><span>${label}</span></button>`;
}

function shell(content) {
  const business = state.business;
  const viewTitle = activeView === 'director' ? 'Director' : 'Mi Negocio';
  return `
    <div class="shell">
      <section class="app-frame">
        <aside class="sidebar">
          <div class="brand"><div class="logo">AP</div><div class="brand-copy"><h1>Agentic Pymes</h1><p>Centro de operaciones</p></div></div>
          <div class="business-chip"><span class="eyebrow">Empresa activa</span><strong>${esc(business?.name || 'Sin inicializar')}</strong><small>${esc(stageLabel(business?.stage))} · ${esc(business?.city || '')}</small></div>
          <nav class="nav">
            ${navButton('director', 'Director', 'D')}
            ${navButton('business', 'Mi Negocio', 'N')}
          </nav>
          <div class="sidebar-spacer"></div>
          <div class="side-note"><strong>Autorización protegida</strong>El equipo puede investigar y preparar propuestas. Publicar, gastar, cobrar o contactar terceros requiere tu autorización.</div>
        </aside>
        <main class="main">
          <header class="topbar">
            <div class="topbar-title"><h2>${viewTitle}</h2><p>${activeView === 'director' ? 'Coordinación y decisiones' : `${esc(business?.name || '')} · ${esc(business?.city || '')}`}</p></div>
            <div class="actions"><span class="status" id="global-status">Disponible</span><button class="secondary" id="logout">Salir</button></div>
          </header>
          <div class="content">${content}</div>
        </main>
      </section>
    </div>
    <nav class="mobile-nav">
      <button data-view="director" class="${activeView === 'director' ? 'active' : ''}">Director</button>
      <button data-view="business" class="${activeView === 'business' ? 'active' : ''}">Mi Negocio</button>
    </nav>`;
}

function bootstrapView() {
  return shell(`
    <div class="page-intro"><div><span class="eyebrow">Primer paso</span><h3>Inicializá Mi Negocio</h3><p>Crearemos la memoria estructurada que usarán el Director y los especialistas como fuente operativa.</p></div></div>
    <section class="panel" style="max-width:720px"><div class="panel-head"><div><h3>Negocio piloto</h3><p class="panel-subtitle">Se creará Postres Experiencia con Río Gallegos como ubicación inicial.</p></div><span class="pill">Listo para crear</span></div><button class="primary" id="bootstrap">Crear negocio piloto</button></section>`);
}

function contextCard(title, subtitle, body) {
  return `<section class="context-card"><h4>${title}</h4><p>${subtitle}</p>${body}</section>`;
}

function directorView() {
  const s = state.snapshot || { products: [], ingredients: [], recipes: [], capacity: [], decisions: [], hypotheses: [], technology_costs: {} };
  const capacity = s.capacity?.[0]?.daily_capacity_units;
  const techCost = s.technology_costs?.known_model_cost_usd || 0;
  const openHypotheses = (s.hypotheses || []).filter((item) => ['open', 'testing'].includes(item.status)).length;
  return shell(`
    <div class="director-layout">
      <section class="director-main">
        <div class="director-hero">
          <div><span class="eyebrow">Dirección empresarial</span><h3>¿Qué necesitás decidir hoy?</h3><p>El Director usa los datos de Mi Negocio y activa sólo a los especialistas cuyo análisis puede cambiar la decisión.</p></div>
          <div class="hero-badge">AI</div>
        </div>
        <div class="messages" id="messages">
          <div class="message assistant">Mi Negocio está conectado. Podés plantear una decisión, un problema o una oportunidad. El equipo distinguirá datos reales, evidencia externa y faltantes antes de recomendar.</div>
        </div>
        <div class="composer-card">
          <div class="composer"><textarea id="mission" placeholder="Ej.: Analizá qué deberíamos validar antes del primer piloto y usá únicamente los datos reales de Mi Negocio."></textarea><button class="primary" id="send-mission">Enviar misión</button></div>
          <div class="composer-foot"><small>Enter para enviar · Shift + Enter para nueva línea</small><button class="ghost" id="new-thread">Nueva conversación</button></div>
        </div>
      </section>
      <aside class="context-rail">
        ${contextCard('Estado del negocio', 'Contexto disponible para el Director', `
          <div class="context-stat"><span>Productos</span><strong>${s.products.length}</strong></div>
          <div class="context-stat"><span>Insumos</span><strong>${s.ingredients.length}</strong></div>
          <div class="context-stat"><span>Recetas</span><strong>${s.recipes.length}</strong></div>
          <div class="context-stat"><span>Capacidad diaria</span><strong>${capacity == null ? 'Pendiente' : `${fmtNumber(capacity, 0)} u.`}</strong></div>`)}
        ${contextCard('Aprendizaje', 'Decisiones e hipótesis vigentes', `
          <div class="context-stat"><span>Decisiones</span><strong>${(s.decisions || []).filter((item) => item.status === 'active').length}</strong></div>
          <div class="context-stat"><span>Hipótesis abiertas</span><strong>${openHypotheses}</strong></div>`)}
        ${contextCard('Costo tecnológico', 'Tokens de modelo conocidos', `
          <div class="context-stat"><span>Últimas misiones</span><strong>${fmtUsd(techCost)}</strong></div>
          <div class="context-stat"><span>Medición</span><strong>${s.technology_costs?.all_usage_complete ? 'Completa' : 'En progreso'}</strong></div>`)}
      </aside>
    </div>`);
}

function metricCard(label, value, foot) {
  return `<section class="panel metric-card span-3"><div class="metric-label">${label}</div><div class="metric">${value}</div><div class="metric-foot">${foot}</div></section>`;
}

function businessView() {
  const s = state.snapshot || { products: [], ingredients: [], recipes: [], capacity: [], decisions: [], hypotheses: [], technology_costs: {} };
  const capacity = s.capacity?.[0]?.daily_capacity_units;
  const techCost = s.technology_costs?.known_model_cost_usd || 0;
  const activeDecisions = (s.decisions || []).filter((item) => item.status === 'active');
  const openHypotheses = (s.hypotheses || []).filter((item) => ['open', 'testing'].includes(item.status));

  return shell(`
    <div class="page-intro"><div><span class="eyebrow">Fuente de verdad</span><h3>${esc(state.business?.name || 'Mi Negocio')}</h3><p>Productos, costos, stock, capacidad y aprendizaje empresarial. Estos datos alimentan las decisiones del equipo agentic.</p></div><span class="pill success">${esc(stageLabel(state.business?.stage))}</span></div>
    <div class="grid metrics-grid" style="margin-bottom:14px">
      ${metricCard('Productos', s.products.length, 'Portafolio cargado')}
      ${metricCard('Insumos', s.ingredients.length, 'Con costo y stock')}
      ${metricCard('Capacidad diaria', capacity == null ? '—' : fmtNumber(capacity, 0), capacity == null ? 'Pendiente de cargar' : 'unidades por día')}
      ${metricCard('Costo IA conocido', fmtUsd(techCost), 'Estimación de tokens')}
    </div>
    <div class="grid">
      <section class="panel span-6"><div class="panel-head"><div><h3>Agregar producto</h3><p class="panel-subtitle">Definí qué vendés y en qué etapa está.</p></div><span class="pill neutral">Producto</span></div><form id="product-form"><div class="field"><label>Nombre</label><input name="name" required placeholder="Chocotorta"></div><div class="form-row"><div class="field"><label>Estado</label><select name="status"><option value="draft">Borrador</option><option value="test">Prueba</option><option value="active">Activo</option></select></div><div class="field"><label>Precio de venta</label><input name="sell_price" type="number" min="0" step="0.01" placeholder="0"></div></div><div class="field"><label>Descripción</label><textarea name="description" placeholder="Presentación, tamaño, propuesta de valor..."></textarea></div><button class="primary" type="submit">Guardar producto</button></form></section>

      <section class="panel span-6"><div class="panel-head"><div><h3>Agregar insumo</h3><p class="panel-subtitle">Registrá costo y stock real para costear correctamente.</p></div><span class="pill neutral">Insumo</span></div><form id="ingredient-form"><div class="form-row"><div class="field"><label>Nombre</label><input name="name" required placeholder="Dulce de leche"></div><div class="field"><label>Unidad</label><input name="unit" required placeholder="g / ml / unidad"></div></div><div class="form-row"><div class="field"><label>Costo por unidad</label><input name="cost_per_unit" type="number" min="0" step="0.0001" placeholder="0"></div><div class="field"><label>Stock inicial</label><input name="initial_stock" type="number" min="0" step="0.0001" placeholder="0"></div></div><div class="field"><label>Fuente del costo</label><input name="cost_source" placeholder="Proveedor, ticket o cotización"></div><button class="primary" type="submit">Guardar insumo</button></form></section>

      <section class="panel span-6"><div class="panel-head"><div><h3>Productos</h3><p class="panel-subtitle">Portafolio actual del negocio.</p></div><span class="pill neutral">${s.products.length}</span></div><div class="list">${s.products.length ? s.products.map((p) => `<div class="item"><div class="item-row"><strong>${esc(p.name)}</strong><span class="pill ${p.status === 'active' ? 'success' : 'neutral'}">${esc(productStatusLabel(p.status))}</span></div><small>${p.sell_price == null ? 'Precio pendiente' : `$ ${Number(p.sell_price).toLocaleString('es-AR')} ${esc(p.currency || 'ARS')}`}${p.description ? ` · ${esc(p.description)}` : ''}</small></div>`).join('') : '<div class="empty">Todavía no cargaste productos.</div>'}</div></section>

      <section class="panel span-6"><div class="panel-head"><div><h3>Insumos y stock</h3><p class="panel-subtitle">Disponibilidad y costo registrado.</p></div><span class="pill neutral">${s.ingredients.length}</span></div><div class="list">${s.ingredients.length ? s.ingredients.map((i) => `<div class="item"><div class="item-row"><strong>${esc(i.name)}</strong><span class="pill neutral">${fmtNumber(i.current_stock)} ${esc(i.unit)}</span></div><small>${i.cost_per_unit == null ? 'Costo pendiente' : `$ ${Number(i.cost_per_unit).toLocaleString('es-AR')}/${esc(i.unit)}`}${i.cost_source ? ` · ${esc(i.cost_source)}` : ''}</small></div>`).join('') : '<div class="empty">Todavía no cargaste insumos.</div>'}</div></section>

      <section class="panel span-6"><div class="panel-head"><div><h3>Decisiones vigentes</h3><p class="panel-subtitle">Criterios que el equipo debe respetar.</p></div><span class="pill neutral">${activeDecisions.length}</span></div><div class="list">${activeDecisions.length ? activeDecisions.slice(0,8).map((d) => `<div class="item"><strong>${esc(d.title)}</strong><small>${esc(d.decision)}</small></div>`).join('') : '<div class="empty">Sin decisiones registradas.</div>'}</div></section>
      <section class="panel span-6"><div class="panel-head"><div><h3>Hipótesis abiertas</h3><p class="panel-subtitle">Supuestos que todavía necesitan evidencia.</p></div><span class="pill neutral">${openHypotheses.length}</span></div><div class="list">${openHypotheses.length ? openHypotheses.slice(0,8).map((h) => `<div class="item"><strong>${esc(h.title)}</strong><small>${esc(h.statement)}</small></div>`).join('') : '<div class="empty">Sin hipótesis registradas.</div>'}</div></section>
    </div>`);
}

function render() {
  if (!session) root.innerHTML = loginView();
  else if (!state.business) root.innerHTML = bootstrapView();
  else root.innerHTML = activeView === 'director' ? directorView() : businessView();
  bind();
}

function bind() {
  document.querySelector('#login-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.querySelector('#login-status');
    try {
      status.textContent = 'Enviando enlace seguro…';
      await sendMagicLink(document.querySelector('#login-email').value.trim());
      status.textContent = 'Listo. Revisá tu correo para ingresar.';
    } catch (error) { status.textContent = error.message; }
  });

  document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => {
    activeView = button.dataset.view;
    render();
  }));

  document.querySelector('#logout')?.addEventListener('click', () => supabase.auth.signOut());

  document.querySelector('#bootstrap')?.addEventListener('click', async () => {
    await api('/api/mi-negocio/bootstrap', { method: 'POST', body: JSON.stringify({ name: 'Postres Experiencia' }) });
    await loadBusiness();
    render();
  });

  document.querySelector('#product-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    try {
      button.disabled = true;
      const data = Object.fromEntries(new FormData(event.currentTarget));
      await api('/api/products', { method: 'POST', body: JSON.stringify(data) });
      await loadBusiness();
      render();
    } finally { if (button?.isConnected) button.disabled = false; }
  });

  document.querySelector('#ingredient-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    try {
      button.disabled = true;
      const data = Object.fromEntries(new FormData(event.currentTarget));
      await api('/api/ingredients', { method: 'POST', body: JSON.stringify(data) });
      await loadBusiness();
      render();
    } finally { if (button?.isConnected) button.disabled = false; }
  });

  document.querySelector('#send-mission')?.addEventListener('click', sendMission);
  document.querySelector('#mission')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMission(); }
  });

  document.querySelector('#new-thread')?.addEventListener('click', async () => {
    await api('/api/reiniciar', { method: 'POST', body: '{}' });
    const messages = document.querySelector('#messages');
    if (messages) messages.innerHTML = '<div class="message assistant">Nueva conversación iniciada. Mi Negocio permanece intacto.</div>';
  });
}

async function sendMission() {
  const input = document.querySelector('#mission');
  const button = document.querySelector('#send-mission');
  const messages = document.querySelector('#messages');
  const status = document.querySelector('#global-status');
  const text = input?.value.trim();
  if (!text || !messages) return;

  messages.insertAdjacentHTML('beforeend', `<div class="message user">${esc(text)}</div>`);
  input.value = '';
  input.disabled = true;
  button.disabled = true;
  status.textContent = 'Equipo trabajando';
  status.className = 'status busy';
  const pending = document.createElement('div');
  pending.className = 'message assistant muted';
  pending.textContent = 'El Director está preparando el plan y activando los especialistas necesarios…';
  messages.appendChild(pending);
  messages.scrollTop = messages.scrollHeight;

  try {
    const data = await api('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: text,
    });
    pending.className = 'message assistant';
    pending.textContent = data.respuesta;
    status.textContent = 'Disponible';
    status.className = 'status';
  } catch (error) {
    pending.className = 'message assistant danger';
    pending.textContent = `Error: ${error.message}`;
    status.textContent = 'Revisar error';
    status.className = 'status error';
  } finally {
    input.disabled = false;
    button.disabled = false;
    input.focus();
    messages.scrollTop = messages.scrollHeight;
  }
}

init();
