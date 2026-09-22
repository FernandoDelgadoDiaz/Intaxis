import { createClient } from '@supabase/supabase-js';

const root = document.querySelector('#app');
let supabase;
let session = null;
let state = { business: null, snapshot: null };
let activeView = 'director';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

async function init() {
  try {
    const configResponse = await fetch('/api/config');
    const config = await configResponse.json();
    if (!config.supabaseUrl || !config.supabasePublishableKey) {
      throw new Error('La infraestructura nueva todavía no está configurada.');
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
    root.innerHTML = `<div class="shell"><div class="card login"><h2>Agentic Pymes</h2><div class="notice">${esc(error.message)}</div></div></div>`;
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
    <div class="shell">
      <section class="card login">
        <div class="brand"><div class="logo">AP</div><div><h1>Agentic Pymes</h1><p>Sistema operativo empresarial agentic</p></div></div>
        <div class="notice" style="margin-top:24px">Ingresá con tu correo. Supabase enviará un enlace seguro; no guardamos contraseñas en la aplicación.</div>
        <form id="login-form">
          <div class="field"><label>Correo</label><input id="login-email" type="email" autocomplete="email" required placeholder="tu@email.com"></div>
          <button class="primary" type="submit">Enviar enlace de acceso</button>
          <div id="login-status" class="muted"></div>
        </form>
      </section>
    </div>`;
}

function shell(content) {
  return `
    <div class="shell">
      <section class="card layout">
        <aside class="sidebar">
          <div class="brand"><div class="logo">AP</div><div><h1>Agentic Pymes</h1><p>${esc(state.business?.name || 'Mi negocio')} · ${esc(state.business?.stage || 'sin inicializar')}</p></div></div>
          <nav class="nav">
            <button data-view="director" class="${activeView === 'director' ? 'active' : ''}">Director</button>
            <button data-view="business" class="${activeView === 'business' ? 'active' : ''}">Mi Negocio</button>
          </nav>
          <div class="side-note">Los especialistas trabajan detrás. Investigar puede ser autónomo; publicar, gastar o contactar terceros requiere autorización.</div>
        </aside>
        <main class="main">
          <header class="topbar"><div><h2>${activeView === 'director' ? 'Director' : 'Mi Negocio'}</h2><p>${esc(session?.user?.email || '')}</p></div><div class="actions"><span class="status" id="global-status">Disponible</span><button class="secondary" id="logout">Salir</button></div></header>
          <div class="content">${content}</div>
        </main>
      </section>
    </div>`;
}

function bootstrapView() {
  return shell(`<div class="panel" style="max-width:720px"><h3>Inicializar Mi Negocio</h3><p class="muted">Esto creará la memoria estructurada del primer negocio piloto dentro de Agentic Pymes.</p><button class="primary" id="bootstrap">Crear negocio piloto</button></div>`);
}

function directorView() {
  return shell(`
    <div class="chat">
      <div class="messages" id="messages">
        <div class="message assistant">Mi Negocio está conectado. El Director recibirá productos, insumos, stock, recetas, capacidad, decisiones e hipótesis antes de cada misión.</div>
      </div>
      <div>
        <div class="composer"><textarea id="mission" placeholder="Ej.: Analizá qué deberíamos validar antes del primer piloto y usá los datos reales de Mi Negocio."></textarea><button class="primary" id="send-mission">Enviar</button></div>
        <div class="actions"><button class="secondary" id="new-thread">Nueva conversación</button></div>
      </div>
    </div>`);
}

function businessView() {
  const s = state.snapshot || { products: [], ingredients: [], recipes: [], capacity: [], decisions: [], hypotheses: [] };
  return shell(`
    <div class="grid">
      <section class="panel span-4"><div class="muted">Productos</div><div class="metric">${s.products.length}</div></section>
      <section class="panel span-4"><div class="muted">Insumos</div><div class="metric">${s.ingredients.length}</div></section>
      <section class="panel span-4"><div class="muted">Recetas</div><div class="metric">${s.recipes.length}</div></section>

      <section class="panel span-6"><h3>Agregar producto</h3><form id="product-form"><div class="field"><label>Nombre</label><input name="name" required placeholder="Chocotorta"></div><div class="form-row"><div class="field"><label>Estado</label><select name="status"><option value="draft">Borrador</option><option value="test">Prueba</option><option value="active">Activo</option></select></div><div class="field"><label>Precio de venta</label><input name="sell_price" type="number" min="0" step="0.01"></div></div><div class="field"><label>Descripción</label><textarea name="description"></textarea></div><button class="primary" type="submit">Guardar producto</button></form></section>

      <section class="panel span-6"><h3>Agregar insumo</h3><form id="ingredient-form"><div class="form-row"><div class="field"><label>Nombre</label><input name="name" required placeholder="Dulce de leche"></div><div class="field"><label>Unidad</label><input name="unit" required placeholder="g / ml / unidad"></div></div><div class="form-row"><div class="field"><label>Costo por unidad</label><input name="cost_per_unit" type="number" min="0" step="0.0001"></div><div class="field"><label>Stock inicial</label><input name="initial_stock" type="number" min="0" step="0.0001"></div></div><div class="field"><label>Fuente del costo</label><input name="cost_source" placeholder="Proveedor / ticket / cotización"></div><button class="primary" type="submit">Guardar insumo</button></form></section>

      <section class="panel span-6"><h3>Productos</h3><div class="list">${s.products.length ? s.products.map((p) => `<div class="item"><strong>${esc(p.name)}</strong><small>${esc(p.status)} · ${p.sell_price == null ? 'sin precio' : `$ ${Number(p.sell_price).toLocaleString('es-AR')}`}</small></div>`).join('') : '<div class="empty">Todavía no cargaste productos.</div>'}</div></section>

      <section class="panel span-6"><h3>Insumos y stock</h3><div class="list">${s.ingredients.length ? s.ingredients.map((i) => `<div class="item"><strong>${esc(i.name)}</strong><small>Stock: ${Number(i.current_stock || 0).toLocaleString('es-AR')} ${esc(i.unit)} · Costo: ${i.cost_per_unit == null ? 'pendiente' : `$ ${Number(i.cost_per_unit).toLocaleString('es-AR')}/${esc(i.unit)}`}</small></div>`).join('') : '<div class="empty">Todavía no cargaste insumos.</div>'}</div></section>

      <section class="panel span-6"><h3>Decisiones vigentes</h3><div class="list">${s.decisions.length ? s.decisions.slice(0,8).map((d) => `<div class="item"><strong>${esc(d.title)}</strong><small>${esc(d.decision)}</small></div>`).join('') : '<div class="empty">Sin decisiones registradas.</div>'}</div></section>
      <section class="panel span-6"><h3>Hipótesis abiertas</h3><div class="list">${s.hypotheses.length ? s.hypotheses.slice(0,8).map((h) => `<div class="item"><strong>${esc(h.title)}</strong><small>${esc(h.statement)}</small></div>`).join('') : '<div class="empty">Sin hipótesis registradas.</div>'}</div></section>
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
      status.textContent = 'Enviando…';
      await sendMagicLink(document.querySelector('#login-email').value.trim());
      status.textContent = 'Revisá tu correo para ingresar.';
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
    const data = Object.fromEntries(new FormData(event.currentTarget));
    await api('/api/products', { method: 'POST', body: JSON.stringify(data) });
    await loadBusiness();
    render();
  });

  document.querySelector('#ingredient-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    await api('/api/ingredients', { method: 'POST', body: JSON.stringify(data) });
    await loadBusiness();
    render();
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
  status.textContent = 'Equipo trabajando…';
  const pending = document.createElement('div');
  pending.className = 'message assistant muted';
  pending.textContent = 'Investigación y análisis en curso…';
  messages.appendChild(pending);
  messages.scrollTop = messages.scrollHeight;

  try {
    const data = await api('/api/chat', { method: 'POST', body: JSON.stringify({ mensaje: text }) });
    pending.className = 'message assistant';
    pending.textContent = data.respuesta;
    status.textContent = 'Disponible';
  } catch (error) {
    pending.className = 'message assistant danger';
    pending.textContent = `Error: ${error.message}`;
    status.textContent = 'Revisar error';
  } finally {
    input.disabled = false;
    button.disabled = false;
    input.focus();
    messages.scrollTop = messages.scrollHeight;
  }
}

init();
