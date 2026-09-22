import { createClient } from '@supabase/supabase-js';

const root = document.querySelector('#app');
let clientPromise;
let launching = false;
let activeRunId = null;
let lastProgress = null;

async function client() {
  if (!clientPromise) {
    clientPromise = fetch('/api/config')
      .then(async (response) => {
        if (!response.ok) throw new Error(`Error ${response.status}`);
        return response.json();
      })
      .then((config) => createClient(config.supabaseUrl, config.supabasePublishableKey));
  }
  return clientPromise;
}

async function token() {
  const supabase = await client();
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || null;
}

async function api(path, options = {}) {
  const accessToken = await token();
  if (!accessToken) throw new Error('Necesitás iniciar sesión.');
  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {}),
    },
  });
  const type = response.headers.get('content-type') || '';
  if (!response.ok) {
    const body = type.includes('application/json') ? await response.json().catch(() => ({})) : {};
    throw new Error(body.error || `Error ${response.status}`);
  }
  return type.includes('application/json') ? response.json() : response;
}

function stringify(value) {
  try { return JSON.stringify(value || {}); } catch { return '{}'; }
}

function offerWords(profile) {
  const terms = profile?.terminology || {};
  const mode = profile?.offer_mode || 'mixed';
  return {
    plural: terms.offer_plural || (mode === 'service' ? 'servicios' : mode === 'product' ? 'productos' : 'ofertas'),
  };
}

function buildMission(context) {
  const business = context?.business || {};
  const profile = context?.snapshot?.business_profile || null;
  const discovery = profile?.discovery_context || {};
  const target = profile?.target_market || {};
  const vertical = profile?.vertical_config || {};
  const { plural } = offerWords(profile);

  return [
    `Investigá en profundidad oportunidades de mercado para ${business.name || 'esta PyME'}, ubicada en ${business.city || 'su mercado local'}, ${business.province || ''}, ${business.country || ''}.`,
    profile?.industry ? `Rubro: ${profile.industry}.` : '',
    profile?.business_model ? `Modelo de negocio: ${profile.business_model}.` : '',
    `El objetivo es proponer exactamente tres ${plural} o líneas de oportunidad comparables, ordenadas del 1 al 3 como hipótesis de mayor a menor aceptación comercial inicial.`,
    'Usá fuentes actuales y reales mediante búsqueda web. Relevá el mercado local/nacional y también mercados internacionales relevantes como referencia adelantada.',
    'No tomes likes o visualizaciones aisladas como equivalentes a ventas y no inventes métricas privadas de competidores. Conservá URLs reales y fechas de la evidencia.',
    'Evaluá señales de interés, competencia, tendencia, diferenciación, ajuste al mercado objetivo, atractivo/presentación cuando corresponda, factibilidad operativa, riesgos específicos del rubro y complejidad probable de costos.',
    `Contexto de descubrimiento configurado por la PyME: ${stringify(discovery)}.`,
    `Mercado objetivo configurado: ${stringify(target)}.`,
    `Configuración vertical relevante: ${stringify(vertical)}.`,
    'Si el rubro es de alimentos, incluí además presentación, sabores, conservación y dificultad productiva. Si es un servicio, reemplazá esos criterios por experiencia, capacidad de prestación, recursos, tiempos y riesgo operativo. No fuerces criterios que no correspondan al rubro.',
    'Si la evidencia es suficiente, generá la acción market_research para guardar el estudio en Descubrimiento. No publiques, no gastes dinero y no contactes terceros.',
  ].filter(Boolean).join(' ');
}

function researchButton() {
  return document.querySelector('#prepare-discovery-mission');
}

function improveButtonLabel() {
  const button = researchButton();
  if (!button) return;
  if (launching && activeRunId) button.textContent = 'Investigación en curso…';
  else button.textContent = 'Iniciar investigación';
  if (lastProgress) renderProgress();
}

function renderProgress() {
  const button = researchButton();
  const host = button?.parentElement;
  if (!host || !lastProgress) return;
  let status = host.querySelector('[data-research-launch-status]');
  if (!status) {
    status = document.createElement('p');
    status.dataset.researchLaunchStatus = 'true';
    status.className = 'discovery-note';
    status.style.marginTop = '10px';
    host.appendChild(status);
  }
  status.textContent = lastProgress.text;
  status.style.color = lastProgress.tone === 'error' ? '#b42318' : lastProgress.tone === 'success' ? '#067647' : '';
}

function showStatus(text, tone = 'normal') {
  lastProgress = { text, tone };
  renderProgress();
}

function setButtonState(label, disabled = true) {
  const button = researchButton();
  if (!button) return;
  button.disabled = disabled;
  button.textContent = label;
}

async function latestDiscoveryId() {
  const data = await api('/api/discovery');
  return data?.discovery?.run?.id || null;
}

function isDiscoveryMission(run) {
  const mission = String(run?.mission || '');
  return /oportunidades de mercado|market_research|Descubrimiento/i.test(mission);
}

async function activeResearchRun() {
  const data = await api('/api/chat/runs');
  return (data?.runs || []).find((run) => ['queued', 'running'].includes(run.status) && isDiscoveryMission(run)) || null;
}

function runningStatus(run) {
  if (run.status === 'queued') return 'En cola · esperando que arranque el motor de ejecución…';
  if (run.status === 'running' && !run.delegation_plan) return 'Director analizando la misión y decidiendo qué especialistas activar…';
  if (run.status === 'running' && Number(run.specialist_count || 0) > 0) {
    const count = Number(run.specialist_count || 0);
    return `Director trabajando · ${count} especialista${count === 1 ? '' : 's'} activado${count === 1 ? '' : 's'}…`;
  }
  if (run.status === 'running') return 'Director integrando evidencia y preparando la decisión…';
  return '';
}

async function startBackground(runId) {
  await api('/.netlify/functions/agent-run-background', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ runId }),
  });
}

async function waitForResearch(previousId, runId) {
  const started = Date.now();
  let completedWithoutDiscoveryAt = null;

  while (Date.now() - started < 15 * 60 * 1000) {
    await new Promise((resolve) => setTimeout(resolve, document.hidden ? 8000 : 3000));

    const [detail, currentId] = await Promise.all([
      api(`/api/chat/runs/${encodeURIComponent(runId)}`).catch(() => null),
      latestDiscoveryId().catch(() => null),
    ]);

    if (currentId && currentId !== previousId) {
      showStatus('Investigación terminada ✓ Cargando resultados…', 'success');
      setButtonState('Investigación terminada ✓', true);
      activeRunId = null;
      launching = false;
      document.querySelector('[data-discovery-nav]')?.click();
      return;
    }

    const run = detail?.run;
    if (!run) continue;

    if (run.status === 'failed') {
      showStatus(`La investigación falló: ${run.error_message || 'sin detalle del error.'}`, 'error');
      setButtonState('Reintentar investigación', false);
      activeRunId = null;
      launching = false;
      return;
    }

    if (run.status === 'completed') {
      const failedAction = (detail.actions || []).find((item) => item.action_type === 'market_research' && item.status === 'failed');
      if (failedAction) {
        showStatus(`El análisis terminó, pero no pudo guardarse el estudio: ${failedAction.error_message || failedAction.policy_reason || 'faltó evidencia suficiente.'}`, 'error');
        setButtonState('Reintentar investigación', false);
        activeRunId = null;
        launching = false;
        return;
      }

      if (!completedWithoutDiscoveryAt) completedWithoutDiscoveryAt = Date.now();
      showStatus('Director terminó el análisis · verificando que el estudio haya quedado guardado…');
      if (Date.now() - completedWithoutDiscoveryAt > 20000) {
        showStatus('La misión terminó sin generar un nuevo estudio de Descubrimiento. Revisá la respuesta del Director antes de reintentar.', 'error');
        setButtonState('Reintentar investigación', false);
        activeRunId = null;
        launching = false;
        return;
      }
      continue;
    }

    showStatus(runningStatus(run));
    if (run.status === 'queued' && Date.now() - started > 30000) {
      showStatus('La misión sigue en cola. El motor de background todavía no confirmó el arranque.', 'error');
    }
  }

  showStatus('La investigación superó el tiempo de seguimiento en pantalla. Su estado real queda guardado y puede revisarse al volver.', 'error');
  setButtonState('Revisar / reintentar', false);
  activeRunId = null;
  launching = false;
}

async function followRun(run, previousId) {
  launching = true;
  activeRunId = run.id;
  setButtonState('Investigación en curso…', true);
  showStatus(runningStatus(run));

  if (run.status === 'queued') {
    showStatus('Misión encontrada en cola · iniciando el motor de ejecución…');
    await startBackground(run.id);
    showStatus('Motor iniciado · esperando el plan del Director…');
  }

  waitForResearch(previousId, run.id).catch((error) => {
    showStatus(error.message || 'No se pudo seguir el estado de la investigación.', 'error');
    setButtonState('Reintentar investigación', false);
    activeRunId = null;
    launching = false;
  });
}

async function recoverExistingResearch() {
  if (launching) return;
  const [run, previousId] = await Promise.all([
    activeResearchRun().catch(() => null),
    latestDiscoveryId().catch(() => null),
  ]);
  if (!run) return;
  await followRun(run, previousId);
}

async function startResearch(button) {
  if (launching) return;
  launching = true;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Iniciando…';
  showStatus('Preparando el contexto real de Mi Negocio…');

  try {
    const [existing, previousId] = await Promise.all([
      activeResearchRun().catch(() => null),
      latestDiscoveryId().catch(() => null),
    ]);

    if (existing) {
      launching = false;
      await followRun(existing, previousId);
      return;
    }

    const context = await api('/api/mi-negocio');
    const mission = buildMission(context);
    const queued = await api('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: mission,
    });

    activeRunId = queued.runId;
    setButtonState('Investigación en curso…', true);
    showStatus('En cola · iniciando motor de ejecución…');
    await startBackground(queued.runId);
    showStatus('Motor iniciado · esperando el plan del Director…');
    waitForResearch(previousId, queued.runId).catch((error) => {
      showStatus(error.message || 'No se pudo seguir el estado de la investigación.', 'error');
      setButtonState('Reintentar investigación', false);
      activeRunId = null;
      launching = false;
    });
  } catch (error) {
    showStatus(error.message, 'error');
    button.disabled = false;
    button.textContent = original || 'Iniciar investigación';
    activeRunId = null;
    launching = false;
  }
}

document.addEventListener('click', (event) => {
  const button = event.target.closest?.('#prepare-discovery-mission');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  startResearch(button);
}, true);

const observer = new MutationObserver(() => queueMicrotask(improveButtonLabel));
observer.observe(root, { childList: true });
setTimeout(() => {
  improveButtonLabel();
  recoverExistingResearch().catch(() => {});
}, 350);
