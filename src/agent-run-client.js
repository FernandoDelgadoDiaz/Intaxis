import { createClient } from '@supabase/supabase-js';

let supabase;
let configPromise;
let observedMessagesNode = null;
const pollers = new Set();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const text = await response.text();
  let body = null;
  if (type.includes('application/json') && text) {
    try { body = JSON.parse(text); } catch { body = null; }
  }
  if (!response.ok) throw new Error(body?.error || `Error ${response.status}`);
  if (body) return body;
  return { ok: true, status: response.status };
}

function addMessage(container, role, text, extraClass = '') {
  const node = document.createElement('div');
  node.className = `message ${role}${extraClass ? ` ${extraClass}` : ''}`;
  node.textContent = text;
  container.appendChild(node);
}

function statusForRun(run) {
  if (run.status === 'queued') return 'Misión recibida. El Director está por comenzar…';
  if (run.status === 'running') return 'El Director y los especialistas están trabajando. Podés dejar la pantalla en reposo; el trabajo continúa en segundo plano.';
  if (run.status === 'failed') return `Error: ${run.error_message || 'La misión no pudo completarse.'}`;
  if (run.status === 'cancelled') return 'Misión cancelada.';
  return run.result_summary || 'Misión completada.';
}

function renderRuns(runs) {
  const messages = document.querySelector('#messages');
  if (!messages) return;

  observedMessagesNode = messages;
  messages.replaceChildren();
  addMessage(messages, 'assistant', 'Mi Negocio está conectado. Podés plantear una decisión, un problema o una oportunidad. El equipo distinguirá datos reales, evidencia externa y faltantes antes de decidir.');

  [...runs].reverse().forEach((run) => {
    addMessage(messages, 'user', run.mission || 'Misión');
    const extra = run.status === 'failed' ? 'danger' : ['queued', 'running'].includes(run.status) ? 'muted' : '';
    addMessage(messages, 'assistant', statusForRun(run), extra);
  });
  messages.scrollTop = messages.scrollHeight;

  const active = runs.find((run) => ['queued', 'running'].includes(run.status));
  const status = document.querySelector('#global-status');
  const input = document.querySelector('#mission');
  const button = document.querySelector('#send-mission');
  if (active) {
    if (status) {
      status.textContent = active.status === 'queued' ? 'En cola' : 'Equipo trabajando';
      status.className = 'status busy';
    }
    if (input) input.disabled = true;
    if (button) button.disabled = true;
    ensurePolling(active.id);
  } else {
    if (status && !status.classList.contains('error')) {
      status.textContent = 'Disponible';
      status.className = 'status';
    }
    if (input) input.disabled = false;
    if (button) button.disabled = false;
  }
}

async function hydrateChat() {
  if (!document.querySelector('#messages')) return;
  try {
    const data = await request('/api/chat/runs');
    renderRuns(data.runs || []);
  } catch {
    // La vista principal maneja autenticación/errores globales.
  }
}

async function pollRun(runId) {
  const deadline = Date.now() + 15 * 60 * 1000;
  try {
    while (Date.now() < deadline) {
      await sleep(document.hidden ? 5000 : 2200);
      try {
        const data = await request(`/api/chat/runs/${encodeURIComponent(runId)}`);
        const run = data.run;
        if (!run) continue;
        await hydrateChat();
        if (['completed', 'failed', 'cancelled'].includes(run.status)) return;
      } catch {
        if (!navigator.onLine) continue;
      }
    }
    await hydrateChat();
  } finally {
    pollers.delete(runId);
  }
}

function ensurePolling(runId) {
  if (!runId || pollers.has(runId)) return;
  pollers.add(runId);
  pollRun(runId).catch(() => pollers.delete(runId));
}

async function sendMissionAsync() {
  const input = document.querySelector('#mission');
  const button = document.querySelector('#send-mission');
  const status = document.querySelector('#global-status');
  const text = input?.value?.trim();
  if (!text || !input || !button) return;

  input.disabled = true;
  button.disabled = true;
  if (status) {
    status.textContent = 'Enviando misión';
    status.className = 'status busy';
  }

  try {
    const queued = await request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: text,
    });
    input.value = '';
    await hydrateChat();

    await request('/.netlify/functions/agent-run-background', {
      method: 'POST',
      body: JSON.stringify({ runId: queued.runId }),
    });
    ensurePolling(queued.runId);
  } catch (error) {
    const messages = document.querySelector('#messages');
    if (messages) addMessage(messages, 'assistant', `Error: ${error.message}`, 'danger');
    if (status) {
      status.textContent = 'Revisar error';
      status.className = 'status error';
    }
    input.disabled = false;
    button.disabled = false;
  }
}

// Capture phase prevents the old synchronous handler from firing.
document.addEventListener('click', (event) => {
  const button = event.target.closest?.('#send-mission');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  sendMissionAsync();
}, true);

document.addEventListener('keydown', (event) => {
  if (event.target?.id !== 'mission' || event.key !== 'Enter' || event.shiftKey) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  sendMissionAsync();
}, true);

const observer = new MutationObserver(() => {
  const current = document.querySelector('#messages');
  if (!current) {
    observedMessagesNode = null;
    return;
  }
  if (current !== observedMessagesNode) {
    observedMessagesNode = current;
    hydrateChat();
  }
});
observer.observe(document.querySelector('#app'), { childList: true, subtree: true });

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) hydrateChat();
});
window.addEventListener('focus', hydrateChat);
window.addEventListener('online', hydrateChat);

setTimeout(hydrateChat, 250);
