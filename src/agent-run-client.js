import { createClient } from '@supabase/supabase-js';

let supabase;
let configPromise;
let observedMessagesNode = null;
const pollers = new Set();
const runDetailsCache = new Map();

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

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
  if (button) {
    const previous = button.textContent;
    button.textContent = 'Copiado';
    setTimeout(() => { button.textContent = previous; }, 1400);
  }
}

function excelRelevant(text) {
  const value = String(text || '');
  const hasMarkdownTable = /^\s*\|.+\|\s*$/m.test(value) && /^\s*\|?\s*:?-{3,}/m.test(value);
  if (hasMarkdownTable) return true;
  const numericLines = value.split(/\r?\n/).filter((line) => /\d/.test(line)).length;
  const businessData = /(costo|precio|margen|stock|capacidad|venta|pedido|cantidad|unidades|conversi[oó]n|rentabilidad|ingreso|gasto|m[eé]trica|porcentaje|%|usd|\$)/i.test(value);
  return businessData && numericLines >= 3;
}

async function exportExcel(text, button) {
  const token = await authToken();
  if (!token) throw new Error('Necesitás iniciar sesión.');
  if (button) button.disabled = true;
  try {
    const response = await fetch('/api/exportar/excel', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ contenido: text }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Error ${response.status}`);
    }
    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition') || '';
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const name = match?.[1] || 'Agentic_Pymes_Informe.xlsx';
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  } finally {
    if (button) button.disabled = false;
  }
}

function addMessage(container, role, text, extraClass = '', options = {}) {
  if (role !== 'assistant' || options.controls === false) {
    const node = document.createElement('div');
    node.className = `message ${role}${extraClass ? ` ${extraClass}` : ''}`;
    node.textContent = text;
    container.appendChild(node);
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'assistant-response';

  const node = document.createElement('div');
  node.className = `message assistant${extraClass ? ` ${extraClass}` : ''}`;
  node.textContent = text;
  wrap.appendChild(node);

  const controls = document.createElement('div');
  controls.className = 'message-actions';

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'message-action';
  copy.textContent = 'Copiar';
  copy.addEventListener('click', () => copyText(text, copy));
  controls.appendChild(copy);

  if (excelRelevant(text)) {
    const excel = document.createElement('button');
    excel.type = 'button';
    excel.className = 'message-action';
    excel.textContent = 'Exportar Excel';
    excel.addEventListener('click', async () => {
      try {
        await exportExcel(text, excel);
      } catch (error) {
        const previous = excel.textContent;
        excel.textContent = error.message || 'Error al exportar';
        setTimeout(() => { excel.textContent = previous; }, 2200);
      }
    });
    controls.appendChild(excel);
  }

  wrap.appendChild(controls);
  container.appendChild(wrap);
}

function executionEvidence(actions) {
  if (!Array.isArray(actions) || !actions.length) return '';
  const lines = ['## Ejecución verificada del motor de autonomía'];
  for (const action of actions) {
    const decision = action.policy_decision || 'sin decisión';
    const status = action.status || 'sin estado';
    const automatic = action.requires_human === false ? 'sin intervención humana' : 'con intervención humana';
    lines.push(`- **${action.action_type || 'acción'}** — ${status}; política: ${decision}; ${automatic}.`);
    if (action.policy_reason) lines.push(`  Motivo: ${action.policy_reason}`);
    if (action.execution_result?.content_item_id) lines.push(`  Borrador creado: ${action.execution_result.content_item_id}`);
    if (action.execution_result?.operation_task_id) lines.push(`  Orden/tarea creada: ${action.execution_result.operation_task_id}`);
    if (action.execution_result?.order_id) lines.push(`  Pedido creado: ${action.execution_result.order_id}`);
    if (action.execution_result?.payment_id) lines.push(`  Pago: ${action.execution_result.payment_id}`);
    if (action.error_message) lines.push(`  Error: ${action.error_message}`);
  }
  return lines.join('\n');
}

function statusForRun(run) {
  if (run.status === 'queued') return 'Misión recibida. El Director está por comenzar…';
  if (run.status === 'running') return 'El Director y los especialistas están trabajando. Podés dejar la pantalla en reposo; el trabajo continúa en segundo plano.';
  if (run.status === 'failed') return `Error: ${run.error_message || 'La misión no pudo completarse.'}`;
  if (run.status === 'cancelled') return 'Misión cancelada.';
  const base = run.result_summary || 'Misión completada.';
  const evidence = executionEvidence(run.actions);
  return evidence ? `${base}\n\n${evidence}` : base;
}

async function enrichCompletedRuns(runs) {
  return Promise.all((runs || []).map(async (run) => {
    if (run.status !== 'completed') return run;
    const cacheKey = `${run.id}:${run.completed_at || ''}`;
    if (runDetailsCache.has(cacheKey)) return { ...run, ...runDetailsCache.get(cacheKey) };
    try {
      const detail = await request(`/api/chat/runs/${encodeURIComponent(run.id)}`);
      const enriched = { actions: detail.actions || [] };
      runDetailsCache.set(cacheKey, enriched);
      return { ...run, ...enriched };
    } catch {
      return run;
    }
  }));
}

function renderRuns(runs) {
  const messages = document.querySelector('#messages');
  if (!messages) return;

  observedMessagesNode = messages;
  messages.replaceChildren();
  addMessage(
    messages,
    'assistant',
    'Mi Negocio está conectado. Podés plantear una decisión, un problema o una oportunidad. El equipo distinguirá datos reales, evidencia externa y faltantes antes de decidir.',
    '',
    { controls: false },
  );

  [...runs].reverse().forEach((run) => {
    addMessage(messages, 'user', run.mission || 'Misión', '', { controls: false });
    const extra = run.status === 'failed' ? 'danger' : ['queued', 'running'].includes(run.status) ? 'muted' : '';
    addMessage(messages, 'assistant', statusForRun(run), extra, { controls: run.status !== 'queued' && run.status !== 'running' });
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
    const runs = await enrichCompletedRuns(data.runs || []);
    renderRuns(runs);
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
        if (['completed', 'failed', 'cancelled'].includes(run.status)) {
          runDetailsCache.set(`${run.id}:${run.completed_at || ''}`, { actions: data.actions || [] });
        }
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
