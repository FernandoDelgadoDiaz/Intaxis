import { createClient } from '@supabase/supabase-js';

const root = document.querySelector('#app');
let clientPromise;
let launching = false;

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
  if (button && !launching) button.textContent = 'Iniciar investigación';
}

function showStatus(text, tone = 'normal') {
  const button = researchButton();
  const host = button?.parentElement;
  if (!host) return;
  let status = host.querySelector('[data-research-launch-status]');
  if (!status) {
    status = document.createElement('p');
    status.dataset.researchLaunchStatus = 'true';
    status.className = 'discovery-note';
    status.style.marginTop = '10px';
    host.appendChild(status);
  }
  status.textContent = text;
  status.style.color = tone === 'error' ? '#b42318' : '';
}

async function latestDiscoveryId() {
  const data = await api('/api/discovery');
  return data?.discovery?.run?.id || null;
}

async function waitForResearch(previousId) {
  const started = Date.now();
  while (Date.now() - started < 5 * 60 * 1000) {
    await new Promise((resolve) => setTimeout(resolve, 8000));
    const currentId = await latestDiscoveryId().catch(() => null);
    if (currentId && currentId !== previousId) {
      showStatus('Investigación terminada. Cargando resultados…');
      document.querySelector('[data-discovery-nav]')?.click();
      return;
    }
  }
  showStatus('La investigación sigue en segundo plano. Podés salir y volver a Descubrir más tarde; el resultado queda guardado.');
}

async function startResearch(button) {
  if (launching) return;
  launching = true;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Iniciando…';
  showStatus('Preparando el contexto real de Mi Negocio…');

  try {
    const [context, previousId] = await Promise.all([
      api('/api/mi-negocio'),
      latestDiscoveryId().catch(() => null),
    ]);
    const mission = buildMission(context);
    showStatus('Director y especialistas trabajando. Podés dejar esta pantalla; la ejecución continúa en segundo plano.');
    await api('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: mission,
    });
    button.textContent = 'Investigación iniciada ✓';
    waitForResearch(previousId).catch(() => {});
  } catch (error) {
    showStatus(error.message, 'error');
    button.disabled = false;
    button.textContent = original || 'Iniciar investigación';
    launching = false;
  }
}

document.addEventListener('click', (event) => {
  const button = event.target.closest?.('#prepare-discovery-mission');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  startResearch(button);
}, true);

const observer = new MutationObserver(() => queueMicrotask(improveButtonLabel));
observer.observe(root, { childList: true });
setTimeout(improveButtonLabel, 250);
