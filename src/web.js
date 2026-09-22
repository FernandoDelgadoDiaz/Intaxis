import { createClient } from '@supabase/supabase-js';

const root = document.querySelector('#app');
let supabase;
let session = null;
let state = { business: null, snapshot: null, access: null, operation: null, inviteUrl: null };
let activeView = 'director';

const initialInvite = new URLSearchParams(window.location.search).get('invite');
if (initialInvite) localStorage.setItem('agentic_pending_invite', initialInvite);

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const fmtNumber = (value, maximumFractionDigits = 2) => Number(value || 0).toLocaleString('es-AR', { maximumFractionDigits });
const fmtUsd = (value) => `US$ ${Number(value || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
const stageLabel = (value) => ({ concepto: 'Concepto', validacion: 'Validación', producto: 'Producto', costeo: 'Costeo', viabilidad: 'Viabilidad', piloto: 'Piloto', lanzamiento: 'Lanzamiento', seguimiento: 'Seguimiento', crecimiento: 'Crecimiento' }[value] || value || 'Sin etapa');
const productStatusLabel = (value) => ({ draft: 'Borrador', test: 'Prueba', active: 'Activo', paused: 'Pausado', retired: 'Retirado' }[value] || value);
const taskStatusLabel = (value) => ({ pending: 'Pendiente', in_progress: 'En curso', blocked: 'Bloqueada', completed: 'Terminada', cancelled: 'Cancelada' }[value] || value);
const priorityLabel = (value) => ({ low: 'Baja', normal: 'Normal', high: 'Alta', urgent: 'Urgente' }[value] || value);
const fmtDateTime = (value) => value ? new Date(value).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Sin horario';

async function init() {
  try {
    const configResponse = await fetch('/api/config');
    const config = await configResponse.json();
    if (!config.supabaseUrl || !config.supabasePublishableKey) throw new Error('La infraestructura todavía no está configurada.');
    supabase = createClient(config.supabaseUrl, config.supabasePublishableKey);
    const current = await supabase.auth.getSession();
    session = current.data.session;
    if (session) {
      await claimPendingInvite();
      await loadAppState();
    }
    supabase.auth.onAuthStateChange((_event, nextSession) => {
      session = nextSession;
      if (session) {
        Promise.resolve().then(claimPendingInvite).then(loadAppState).then(render).catch(showFatal);
      } else {
        state = { business: null, snapshot: null, access: null, operation: null, inviteUrl: null };
        render();
      }
    });
    render();
  } catch (error) {
    showFatal(error);
  }
}

function showFatal(error) {
  root.innerHTML = `<div class="auth-shell"><div class="auth-panel"><div class="login-card"><div class="brand"><div class="logo">AP</div><div class="brand-copy"><h1>Agentic Pymes</h1><p>Operación empresarial asistida</p></div></div><div class="notice danger">${esc(error.message)}</div></div></div></div>`;
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

async function claimPendingInvite() {
  const token = localStorage.getItem('agentic_pending_invite');
  if (!session || !token) return;
  await api('/api/operation/claim-invite', { method: 'POST', body: JSON.stringify({ token }) });
  localStorage.removeItem('agentic_pending_invite');
  if (window.location.search.includes('invite=')) window.history.replaceState({}, '', window.location.pathname);
}

async function loadAppState() {
  const accessData = await api('/api/access');
  const access = accessData.access || null;
  state.access = access;

  if (access?.role === 'operator') {
    const operation = await api('/api/operation');
    state.business = {
      id: access.business_id,
      name: access.business_name,
      stage: access.stage,
      city: access.city,
      province: access.province,
      country: access.country,
    };
    state.snapshot = null;
    state.operation = operation;
    activeView = 'operator';
    return;
  }

  const own = await api('/api/mi-negocio');
  state.business = own.business;
  state.snapshot = own.snapshot;
  state.operation = own.business ? await api('/api/operation').catch(() => null) : null;
  if (!['director', 'business', 'operation'].includes(activeView)) activeView = 'director';
}

async function refreshOperation() {
  if (!session || !state.access) return;
  state.operation = await api('/api/operation');
}

async function sendMagicLink(email) {
  const invite = localStorage.getItem('agentic_pending_invite');
  const redirect = invite ? `${window.location.origin}/?invite=${encodeURIComponent(invite)}` : window.location.origin;
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } });
  if (error) throw error;
}

function loginView() {
  const invited = Boolean(localStorage.getItem('agentic_pending_invite'));
  return `
    <div class="auth-shell">
      <section class="auth-showcase">
        <div class="auth-copy">
          <div class="auth-kicker">Sistema operativo empresarial</div>
          <h1>${invited ? 'Tu trabajo, claro y ordenado.' : 'Decisiones mejores.<br>Operación más simple.'}</h1>
          <p>${invited ? 'Recibiste una invitación para operar dentro de Agentic Pymes. Ingresá con el mismo correo al que fue enviada.' : 'Agentic Pymes conecta los datos reales de tu negocio con un Director y especialistas que investigan, analizan y proponen acciones medibles.'}</p>
          <div class="auth-points">
            <div class="auth-point"><strong>${invited ? 'Tareas concretas' : 'Mi Negocio'}</strong>${invited ? 'Vas a ver sólo lo que necesitás ejecutar.' : 'Una fuente de verdad para productos, costos y capacidad.'}</div>
            <div class="auth-point"><strong>${invited ? 'Receta y pasos' : 'Equipo especialista'}</strong>${invited ? 'Cada tarea conserva instrucciones y receta vigentes.' : 'Se activa sólo cuando puede cambiar la decisión.'}</div>
            <div class="auth-point"><strong>${invited ? 'Problemas visibles' : 'Control humano'}</strong>${invited ? 'Podés detener una tarea y reportar una incidencia.' : 'Gastar, publicar o comprometer requiere autorización.'}</div>
          </div>
        </div>
      </section>
      <section class="auth-panel">
        <div class="login-card">
          <div class="brand"><div class="logo">AP</div><div class="brand-copy"><h1>Agentic Pymes</h1><p>${invited ? 'Acceso de operario' : 'Gestión inteligente para PyMEs'}</p></div></div>
          <h2>${invited ? 'Aceptar invitación' : 'Ingresá a tu empresa'}</h2>
          <p class="muted">Usamos un enlace seguro enviado por correo. No necesitás recordar otra contraseña.</p>
          <form id="login-form">
            <div class="field"><label>Correo electrónico</label><input id="login-email" type="email" autocomplete="email" required placeholder="tu@email.com"></div>
            <button class="primary" type="submit">Enviar enlace de acceso</button>
            <div id="login-status" class="muted"></div>
          </form>
          <div class="login-help">El acceso se limita según tu rol. Un operario no recibe acceso al Director, costos, finanzas ni información estratégica.</div>
        </div>
      </section>
    </div>`;
}

function navButton(view, label, icon) {
  return `<button data-view="${view}" class="${activeView === view ? 'active' : ''}"><span class="nav-icon">${icon}</span><span>${label}</span></button>`;
}

function shell(content) {
  const business = state.business;
  const viewTitle = ({ director: 'Director', business: 'Mi Negocio', operation: 'Operación' })[activeView] || 'Agentic Pymes';
  const viewSubtitle = activeView === 'director' ? 'Coordinación y decisiones' : activeView === 'operation' ? 'Tareas, equipo y ejecución' : `${esc(business?.name || '')} · ${esc(business?.city || '')}`;
  return `
    <div class="shell">
      <section class="app-frame">
        <aside class="sidebar">
          <div class="brand"><div class="logo">AP</div><div class="brand-copy"><h1>Agentic Pymes</h1><p>Centro de operaciones</p></div></div>
          <div class="business-chip"><span class="eyebrow">Empresa activa</span><strong>${esc(business?.name || 'Sin inicializar')}</strong><small>${esc(stageLabel(business?.stage))} · ${esc(business?.city || '')}</small></div>
          <nav class="nav">
            ${navButton('director', 'Director', 'D')}
            ${navButton('business', 'Mi Negocio', 'N')}
            ${navButton('operation', 'Operación', 'O')}
          </nav>
          <div class="sidebar-spacer"></div>
          <div class="side-note"><strong>Roles separados</strong>El propietario decide y administra. El operario recibe tareas, receta, checklist e incidencias sin ver costos ni estrategia.</div>
        </aside>
        <main class="main">
          <header class="topbar">
            <div class="topbar-title"><h2>${viewTitle}</h2><p>${viewSubtitle}</p></div>
            <div class="actions"><span class="status" id="global-status">Disponible</span><button class="secondary" id="logout">Salir</button></div>
          </header>
          <div class="content">${content}</div>
        </main>
      </section>
    </div>
    <nav class="mobile-nav owner-mobile-nav">
      <button data-view="director" class="${activeView === 'director' ? 'active' : ''}">Director</button>
      <button data-view="business" class="${activeView === 'business' ? 'active' : ''}">Negocio</button>
      <button data-view="operation" class="${activeView === 'operation' ? 'active' : ''}">Operación</button>
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
        <div class="director-hero"><div><span class="eyebrow">Dirección empresarial</span><h3>¿Qué necesitás decidir hoy?</h3><p>El Director usa los datos de Mi Negocio y activa sólo a los especialistas cuyo análisis puede cambiar la decisión.</p></div><div class="hero-badge">AI</div></div>
        <div class="messages" id="messages"><div class="message assistant">Mi Negocio está conectado. Podés plantear una decisión, un problema o una oportunidad. El equipo distinguirá datos reales, evidencia externa y faltantes antes de recomendar.</div></div>
        <div class="composer-card"><div class="composer"><textarea id="mission" placeholder="Ej.: Analizá qué deberíamos validar antes del primer piloto y usá únicamente los datos reales de Mi Negocio."></textarea><button class="primary" id="send-mission">Enviar misión</button></div><div class="composer-foot"><small>Enter para enviar · Shift + Enter para nueva línea</small><button class="ghost" id="new-thread">Nueva conversación</button></div></div>
      </section>
      <aside class="context-rail">
        ${contextCard('Estado del negocio', 'Contexto disponible para el Director', `<div class="context-stat"><span>Productos</span><strong>${s.products.length}</strong></div><div class="context-stat"><span>Insumos</span><strong>${s.ingredients.length}</strong></div><div class="context-stat"><span>Recetas</span><strong>${s.recipes.length}</strong></div><div class="context-stat"><span>Capacidad diaria</span><strong>${capacity == null ? 'Pendiente' : `${fmtNumber(capacity, 0)} u.`}</strong></div>`)}
        ${contextCard('Aprendizaje', 'Decisiones e hipótesis vigentes', `<div class="context-stat"><span>Decisiones</span><strong>${(s.decisions || []).filter((item) => item.status === 'active').length}</strong></div><div class="context-stat"><span>Hipótesis abiertas</span><strong>${openHypotheses}</strong></div>`)}
        ${contextCard('Costo tecnológico', 'Tokens de modelo conocidos', `<div class="context-stat"><span>Últimas misiones</span><strong>${fmtUsd(techCost)}</strong></div><div class="context-stat"><span>Medición</span><strong>${s.technology_costs?.all_usage_complete ? 'Completa' : 'En progreso'}</strong></div>`)}
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
    <div class="grid metrics-grid" style="margin-bottom:14px">${metricCard('Productos', s.products.length, 'Portafolio cargado')}${metricCard('Insumos', s.ingredients.length, 'Con costo y stock')}${metricCard('Capacidad diaria', capacity == null ? '—' : fmtNumber(capacity, 0), capacity == null ? 'Pendiente de cargar' : 'unidades por día')}${metricCard('Costo IA conocido', fmtUsd(techCost), 'Estimación de tokens')}</div>
    <div class="grid">
      <section class="panel span-6"><div class="panel-head"><div><h3>Agregar producto</h3><p class="panel-subtitle">Definí qué vendés y en qué etapa está.</p></div><span class="pill neutral">Producto</span></div><form id="product-form"><div class="field"><label>Nombre</label><input name="name" required placeholder="Chocotorta"></div><div class="form-row"><div class="field"><label>Estado</label><select name="status"><option value="draft">Borrador</option><option value="test">Prueba</option><option value="active">Activo</option></select></div><div class="field"><label>Precio de venta</label><input name="sell_price" type="number" min="0" step="0.01" placeholder="0"></div></div><div class="field"><label>Descripción</label><textarea name="description" placeholder="Presentación, tamaño, propuesta de valor..."></textarea></div><button class="primary" type="submit">Guardar producto</button></form></section>
      <section class="panel span-6"><div class="panel-head"><div><h3>Agregar insumo</h3><p class="panel-subtitle">Registrá costo y stock real para costear correctamente.</p></div><span class="pill neutral">Insumo</span></div><form id="ingredient-form"><div class="form-row"><div class="field"><label>Nombre</label><input name="name" required placeholder="Dulce de leche"></div><div class="field"><label>Unidad</label><input name="unit" required placeholder="g / ml / unidad"></div></div><div class="form-row"><div class="field"><label>Costo por unidad</label><input name="cost_per_unit" type="number" min="0" step="0.0001" placeholder="0"></div><div class="field"><label>Stock inicial</label><input name="initial_stock" type="number" min="0" step="0.0001" placeholder="0"></div></div><div class="field"><label>Fuente del costo</label><input name="cost_source" placeholder="Proveedor, ticket o cotización"></div><button class="primary" type="submit">Guardar insumo</button></form></section>
      <section class="panel span-6"><div class="panel-head"><div><h3>Productos</h3><p class="panel-subtitle">Portafolio actual del negocio.</p></div><span class="pill neutral">${s.products.length}</span></div><div class="list">${s.products.length ? s.products.map((p) => `<div class="item"><div class="item-row"><strong>${esc(p.name)}</strong><span class="pill ${p.status === 'active' ? 'success' : 'neutral'}">${esc(productStatusLabel(p.status))}</span></div><small>${p.sell_price == null ? 'Precio pendiente' : `$ ${Number(p.sell_price).toLocaleString('es-AR')} ${esc(p.currency || 'ARS')}`}${p.description ? ` · ${esc(p.description)}` : ''}</small></div>`).join('') : '<div class="empty">Todavía no cargaste productos.</div>'}</div></section>
      <section class="panel span-6"><div class="panel-head"><div><h3>Insumos y stock</h3><p class="panel-subtitle">Disponibilidad y costo registrado.</p></div><span class="pill neutral">${s.ingredients.length}</span></div><div class="list">${s.ingredients.length ? s.ingredients.map((i) => `<div class="item"><div class="item-row"><strong>${esc(i.name)}</strong><span class="pill neutral">${fmtNumber(i.current_stock)} ${esc(i.unit)}</span></div><small>${i.cost_per_unit == null ? 'Costo pendiente' : `$ ${Number(i.cost_per_unit).toLocaleString('es-AR')}/${esc(i.unit)}`}${i.cost_source ? ` · ${esc(i.cost_source)}` : ''}</small></div>`).join('') : '<div class="empty">Todavía no cargaste insumos.</div>'}</div></section>
      <section class="panel span-6"><div class="panel-head"><div><h3>Decisiones vigentes</h3><p class="panel-subtitle">Criterios que el equipo debe respetar.</p></div><span class="pill neutral">${activeDecisions.length}</span></div><div class="list">${activeDecisions.length ? activeDecisions.slice(0,8).map((d) => `<div class="item"><strong>${esc(d.title)}</strong><small>${esc(d.decision)}</small></div>`).join('') : '<div class="empty">Sin decisiones registradas.</div>'}</div></section>
      <section class="panel span-6"><div class="panel-head"><div><h3>Hipótesis abiertas</h3><p class="panel-subtitle">Supuestos que todavía necesitan evidencia.</p></div><span class="pill neutral">${openHypotheses.length}</span></div><div class="list">${openHypotheses.length ? openHypotheses.slice(0,8).map((h) => `<div class="item"><strong>${esc(h.title)}</strong><small>${esc(h.statement)}</small></div>`).join('') : '<div class="empty">Sin hipótesis registradas.</div>'}</div></section>
    </div>`);
}

function ownerOperationView() {
  const op = state.operation || { tasks: [], members: [], invites: [] };
  const products = state.snapshot?.products || [];
  const operators = (op.members || []).filter((item) => item.role === 'operator' && item.active);
  const tasks = op.tasks || [];
  const pending = tasks.filter((item) => item.status === 'pending').length;
  const working = tasks.filter((item) => item.status === 'in_progress').length;
  const blocked = tasks.filter((item) => item.status === 'blocked').length;
  return shell(`
    <div class="page-intro"><div><span class="eyebrow">Ejecución</span><h3>Operación diaria</h3><p>Convertí decisiones en tareas concretas. Cada tarea conserva instrucciones, receta e insumos sin exponer costos al operario.</p></div><span class="pill success">${operators.length} operario${operators.length === 1 ? '' : 's'}</span></div>
    <div class="grid metrics-grid" style="margin-bottom:14px">${metricCard('Pendientes', pending, 'Esperando inicio')}${metricCard('En curso', working, 'Ejecutándose ahora')}${metricCard('Bloqueadas', blocked, 'Requieren atención')}${metricCard('Equipo', operators.length, 'Operarios activos')}</div>
    <div class="grid">
      <section class="panel span-7"><div class="panel-head"><div><h3>Nueva tarea operativa</h3><p class="panel-subtitle">La receta vigente se copia a la tarea para preservar qué debía ejecutarse.</p></div><span class="pill neutral">Asignación</span></div>
        <form id="task-form">
          <div class="field"><label>Tarea</label><input name="title" required placeholder="Producir piloto de chocotortas"></div>
          <div class="form-row"><div class="field"><label>Tipo</label><select name="task_type"><option value="production">Producción</option><option value="preparation">Preparación</option><option value="quality">Calidad</option><option value="delivery">Entrega</option><option value="other">Otra</option></select></div><div class="field"><label>Prioridad</label><select name="priority"><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option><option value="low">Baja</option></select></div></div>
          <div class="form-row"><div class="field"><label>Producto</label><select name="product_id"><option value="">Sin producto</option>${products.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></div><div class="field"><label>Cantidad</label><input name="quantity" type="number" min="0" step="0.001" placeholder="20"></div></div>
          <div class="form-row"><div class="field"><label>Fecha / hora objetivo</label><input name="due_at" type="datetime-local"></div><div class="field"><label>Asignar a</label><select name="assigned_user_id"><option value="">Disponible para cualquier operario</option>${operators.map((m) => `<option value="${esc(m.user_id)}">${esc(m.display_name || `Operario · ${m.user_id.slice(0, 8)}`)}</option>`).join('')}</select></div></div>
          <div class="field"><label>Instrucciones</label><textarea name="instructions" placeholder="Indicaciones especiales para esta tarea"></textarea></div>
          <button class="primary" type="submit">Crear tarea</button><div id="task-status" class="muted"></div>
        </form>
      </section>
      <section class="panel span-5"><div class="panel-head"><div><h3>Invitar operario</h3><p class="panel-subtitle">Generá un enlace individual. El operario ingresa con su propio correo.</p></div><span class="pill neutral">7 días</span></div>
        <form id="invite-form"><div class="field"><label>Correo del operario</label><input name="email" type="email" required placeholder="operario@email.com"></div><button class="primary" type="submit">Generar invitación</button><div id="invite-status" class="muted"></div></form>
        ${state.inviteUrl ? `<div class="invite-result"><strong>Enlace listo</strong><input value="${esc(state.inviteUrl)}" readonly><button class="secondary" id="copy-invite">Copiar enlace</button></div>` : ''}
        <div class="list compact-list">${(op.invites || []).slice(0,6).map((i) => `<div class="item"><strong>${esc(i.email)}</strong><small>${esc(i.status)} · vence ${fmtDateTime(i.expires_at)}</small></div>`).join('') || '<div class="empty compact-empty">Sin invitaciones todavía.</div>'}</div>
      </section>
      <section class="panel span-12"><div class="panel-head"><div><h3>Tareas operativas</h3><p class="panel-subtitle">Estado real de la ejecución.</p></div><span class="pill neutral">${tasks.length}</span></div><div class="operation-table">${tasks.length ? tasks.map(ownerTaskRow).join('') : '<div class="empty">Todavía no hay tareas operativas.</div>'}</div></section>
    </div>`);
}

function ownerTaskRow(task) {
  return `<div class="operation-row"><div><div class="item-row"><strong>${esc(task.title)}</strong><span class="pill task-${esc(task.status)}">${esc(taskStatusLabel(task.status))}</span></div><small>${task.product_name ? `${esc(task.product_name)} · ` : ''}${task.quantity == null ? '' : `${fmtNumber(task.quantity)} ${esc(task.unit)} · `}${fmtDateTime(task.due_at)}</small>${task.issue_note ? `<div class="inline-issue">Incidencia: ${esc(task.issue_note)}</div>` : ''}</div><span class="pill priority-${esc(task.priority)}">${esc(priorityLabel(task.priority))}</span></div>`;
}

function operatorTaskCard(task) {
  const checklist = Array.isArray(task.checklist) ? task.checklist : [];
  const inputs = Array.isArray(task.inputs_snapshot) ? task.inputs_snapshot : [];
  const recipeVersion = task.recipe_snapshot?.version;
  const inProgress = task.status === 'in_progress';
  return `<article class="operator-task task-state-${esc(task.status)}" data-task-id="${esc(task.id)}">
    <div class="operator-task-head"><div><span class="eyebrow">${esc(priorityLabel(task.priority))} · ${esc(taskStatusLabel(task.status))}</span><h2>${esc(task.title)}</h2></div><span class="task-quantity">${task.quantity == null ? '—' : fmtNumber(task.quantity)}<small>${esc(task.unit)}</small></span></div>
    <div class="operator-meta"><span>${task.product_name ? esc(task.product_name) : 'Tarea general'}</span><span>${fmtDateTime(task.due_at)}</span>${recipeVersion ? `<span>Receta v${esc(recipeVersion)}</span>` : ''}</div>
    ${task.instructions ? `<div class="operator-instructions"><strong>Indicaciones</strong><p>${esc(task.instructions)}</p></div>` : ''}
    ${inputs.length ? `<section class="operator-section"><h3>Insumos necesarios</h3><div class="operator-inputs">${inputs.map((item) => `<div><span>${esc(item.name)}</span><strong>${fmtNumber(item.quantity, 4)} ${esc(item.unit)}</strong></div>`).join('')}</div></section>` : ''}
    <section class="operator-section"><h3>Pasos</h3><div class="operator-checklist">${checklist.length ? checklist.map((item, index) => `<button class="check-step ${item.done ? 'done' : ''}" data-check-index="${index}" data-done="${item.done ? 'true' : 'false'}" ${inProgress ? '' : 'disabled'}><span>${item.done ? '✓' : index + 1}</span><strong>${esc(item.label)}</strong></button>`).join('') : '<div class="muted">Sin checklist.</div>'}</div></section>
    ${task.status === 'blocked' ? `<div class="operator-alert"><strong>Tarea detenida</strong><p>${esc(task.issue_note || 'Se informó una incidencia.')}</p></div>` : ''}
    <div class="operator-actions">
      ${task.status === 'pending' ? `<button class="primary big-action" data-task-action="start">Comenzar tarea</button>` : ''}
      ${task.status === 'blocked' ? `<button class="primary big-action" data-task-action="start">Reanudar tarea</button>` : ''}
    </div>
    ${inProgress ? `<div class="operator-two-col"><form class="issue-form"><h3>Informar problema</h3><select name="code"><option value="missing_input">Falta insumo</option><option value="missing_packaging">Falta envase/material</option><option value="quality">Calidad / estado</option><option value="equipment">Equipo / herramienta</option><option value="recipe">Duda o diferencia de receta</option><option value="other">Otro</option></select><textarea name="note" required placeholder="Contá brevemente qué impide continuar"></textarea><button class="secondary danger-button" type="submit">Detener e informar</button></form><form class="complete-form"><h3>Finalizar tarea</h3><div class="field"><label>Resultado producido</label><input name="output" type="number" min="0" step="0.001" value="${task.quantity ?? ''}" required></div><div class="field"><label>Merma / descarte</label><input name="waste" type="number" min="0" step="0.001" value="0"></div><button class="primary" type="submit">Marcar como terminada</button></form></div>` : ''}
  </article>`;
}

function operatorView() {
  const tasks = (state.operation?.tasks || []).filter((task) => task.status !== 'completed' && task.status !== 'cancelled');
  const completed = (state.operation?.tasks || []).filter((task) => task.status === 'completed').slice(0, 5);
  const urgent = tasks.filter((task) => task.priority === 'urgent').length;
  return `
    <div class="operator-shell">
      <header class="operator-header"><div class="brand"><div class="logo">AP</div><div class="brand-copy"><h1>${esc(state.business?.name || 'Agentic Pymes')}</h1><p>Modo operario</p></div></div><button class="secondary" id="logout">Salir</button></header>
      <main class="operator-main">
        <div class="operator-welcome"><div><span class="eyebrow">Trabajo de hoy</span><h1>${tasks.length ? `${tasks.length} tarea${tasks.length === 1 ? '' : 's'} por resolver` : 'Todo al día'}</h1><p>${urgent ? `${urgent} tarea${urgent === 1 ? '' : 's'} urgente${urgent === 1 ? '' : 's'}. ` : ''}Seguí los pasos, registrá el resultado y detené la tarea si aparece un problema.</p></div><div class="operator-status-dot">${tasks.length}</div></div>
        <div id="operator-status" class="operator-status-line"></div>
        <section class="operator-task-list">${tasks.length ? tasks.map(operatorTaskCard).join('') : '<div class="operator-empty"><strong>No tenés tareas pendientes.</strong><span>Cuando el propietario asigne trabajo, aparecerá acá.</span></div>'}</section>
        ${completed.length ? `<section class="operator-history"><h3>Terminadas recientemente</h3>${completed.map((task) => `<div class="history-row"><span>${esc(task.title)}</span><strong>${fmtNumber(task.reported_output)} ${esc(task.unit)}</strong></div>`).join('')}</section>` : ''}
      </main>
    </div>`;
}

function render() {
  if (!session) root.innerHTML = loginView();
  else if (state.access?.role === 'operator') root.innerHTML = operatorView();
  else if (!state.business) root.innerHTML = bootstrapView();
  else if (activeView === 'director') root.innerHTML = directorView();
  else if (activeView === 'business') root.innerHTML = businessView();
  else root.innerHTML = ownerOperationView();
  bind();
}

async function reloadAndRender() {
  await loadAppState();
  render();
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

  document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', async () => {
    activeView = button.dataset.view;
    if (activeView === 'operation') await refreshOperation();
    render();
  }));

  document.querySelector('#logout')?.addEventListener('click', () => supabase.auth.signOut());

  document.querySelector('#bootstrap')?.addEventListener('click', async () => {
    await api('/api/mi-negocio/bootstrap', { method: 'POST', body: JSON.stringify({ name: 'Postres Experiencia' }) });
    await reloadAndRender();
  });

  document.querySelector('#product-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    await api('/api/products', { method: 'POST', body: JSON.stringify(data) });
    await reloadAndRender();
  });

  document.querySelector('#ingredient-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    await api('/api/ingredients', { method: 'POST', body: JSON.stringify(data) });
    await reloadAndRender();
  });

  document.querySelector('#task-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.querySelector('#task-status');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      status.textContent = 'Creando tarea…';
      await api('/api/operation/tasks', { method: 'POST', body: JSON.stringify(data) });
      state.operation = await api('/api/operation');
      render();
    } catch (error) { status.textContent = error.message; }
  });

  document.querySelector('#invite-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.querySelector('#invite-status');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      status.textContent = 'Generando invitación…';
      const result = await api('/api/operation/invites', { method: 'POST', body: JSON.stringify(data) });
      state.inviteUrl = result.inviteUrl;
      state.operation = await api('/api/operation');
      render();
    } catch (error) { status.textContent = error.message; }
  });

  document.querySelector('#copy-invite')?.addEventListener('click', async () => {
    if (state.inviteUrl) await navigator.clipboard.writeText(state.inviteUrl);
    const button = document.querySelector('#copy-invite');
    if (button) button.textContent = 'Copiado';
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

  document.querySelectorAll('[data-task-action]').forEach((button) => button.addEventListener('click', async () => {
    const card = button.closest('[data-task-id]');
    await runTaskAction(card?.dataset.taskId, button.dataset.taskAction, {});
  }));

  document.querySelectorAll('[data-check-index]').forEach((button) => button.addEventListener('click', async () => {
    const card = button.closest('[data-task-id]');
    await runTaskAction(card?.dataset.taskId, 'checklist', { index: Number(button.dataset.checkIndex), done: button.dataset.done !== 'true' });
  }));

  document.querySelectorAll('.issue-form').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const card = form.closest('[data-task-id]');
    const data = Object.fromEntries(new FormData(form));
    await runTaskAction(card?.dataset.taskId, 'issue', data);
  }));

  document.querySelectorAll('.complete-form').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const card = form.closest('[data-task-id]');
    const data = Object.fromEntries(new FormData(form));
    await runTaskAction(card?.dataset.taskId, 'complete', data);
  }));
}

async function runTaskAction(taskId, action, payload) {
  if (!taskId) return;
  const status = document.querySelector('#operator-status');
  try {
    if (status) status.textContent = 'Actualizando tarea…';
    await api(`/api/operation/tasks/${taskId}/action`, { method: 'POST', body: JSON.stringify({ action, payload }) });
    await refreshOperation();
    render();
  } catch (error) {
    if (status) status.textContent = error.message;
    else alert(error.message);
  }
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
    const data = await api('/api/chat', { method: 'POST', headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: text });
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
