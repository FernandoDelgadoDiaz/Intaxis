import { createClient } from '@supabase/supabase-js';

const previousFetch = window.fetch.bind(window);
let clientPromise;
let cache = null;
let cacheAt = 0;
const CACHE_MS = 15000;
const DIRECT_TIMEOUT_MS = 7000;

function urlOf(input) {
  return typeof input === 'string' ? input : input?.url || '';
}

function methodOf(input, init) {
  return String(init?.method || input?.method || 'GET').toUpperCase();
}

function discoveryVisible() {
  return Boolean(
    document.querySelector('[data-discovery-nav].active') ||
    document.querySelector('[data-discovery-screen]') ||
    /Descubrimiento/i.test(document.querySelector('.topbar-title h2')?.textContent || '')
  );
}

function withTimeout(promise, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} tardó demasiado.`)), DIRECT_TIMEOUT_MS);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

async function directClient() {
  if (clientPromise) return clientPromise;
  clientPromise = (async () => {
    const response = await withTimeout(previousFetch('/api/config'), 'La configuración');
    if (!response.ok) throw new Error(`No se pudo leer la configuración (${response.status}).`);
    const config = await response.json();
    return createClient(config.supabaseUrl, config.supabasePublishableKey);
  })();
  return clientPromise;
}

async function accessAndProfile(db) {
  const accessResult = await withTimeout(db.rpc('current_business_access'), 'El acceso al negocio');
  if (accessResult.error) throw accessResult.error;
  const access = Array.isArray(accessResult.data) ? accessResult.data[0] || null : accessResult.data || null;
  if (!access?.business_id) throw new Error('No se encontró un negocio activo.');

  const profileResult = await withTimeout(
    db.from('business_profiles').select('*').eq('business_id', access.business_id).maybeSingle(),
    'El perfil del negocio',
  );
  if (profileResult.error) throw profileResult.error;

  return { access, profile: profileResult.data || null };
}

async function readDiscoveryDirect() {
  if (cache && Date.now() - cacheAt < CACHE_MS) return cache;
  const db = await directClient();
  const { access, profile } = await accessAndProfile(db);

  const runResult = await withTimeout(
    db.from('product_discovery_runs')
      .select('*')
      .eq('business_id', access.business_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    'La investigación',
  );
  if (runResult.error) throw runResult.error;

  let discovery = null;
  if (runResult.data) {
    const run = runResult.data;
    const [candidateResult, evidenceResult] = await Promise.all([
      withTimeout(
        db.from('product_discovery_candidates').select('*').eq('business_id', access.business_id).eq('discovery_run_id', run.id).order('rank'),
        'Los candidatos',
      ),
      withTimeout(
        db.from('product_discovery_evidence').select('*').eq('business_id', access.business_id).eq('discovery_run_id', run.id).order('created_at'),
        'La evidencia',
      ),
    ]);
    if (candidateResult.error) throw candidateResult.error;
    if (evidenceResult.error) throw evidenceResult.error;

    const candidates = candidateResult.data || [];
    const candidateIds = candidates.map((item) => item.id);
    let blueprints = [];
    if (candidateIds.length) {
      const blueprintResult = await withTimeout(
        db.from('product_discovery_blueprints').select('*').eq('business_id', access.business_id).in('candidate_id', candidateIds),
        'Las fichas técnicas',
      );
      if (blueprintResult.error) throw blueprintResult.error;
      blueprints = blueprintResult.data || [];
    }
    discovery = { run, candidates, evidence: evidenceResult.data || [], blueprints };
  }

  cache = {
    business: {
      id: access.business_id,
      name: access.business_name,
      stage: access.stage,
      city: access.city,
      province: access.province,
      country: access.country,
    },
    profile,
    discovery,
  };
  cacheAt = Date.now();
  return cache;
}

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Agentic-Source': 'supabase-direct' },
  });
}

window.fetch = async (input, init = {}) => {
  const url = urlOf(input);
  const method = methodOf(input, init);
  if (method !== 'GET' || !discoveryVisible()) return previousFetch(input, init);

  if (url === '/api/discovery' || url.startsWith('/api/discovery?')) {
    const data = await readDiscoveryDirect();
    return jsonResponse({ discovery: data.discovery });
  }

  if (url === '/api/mi-negocio' || url.startsWith('/api/mi-negocio?')) {
    const data = await readDiscoveryDirect();
    return jsonResponse({ business: data.business, snapshot: { business_profile: data.profile } });
  }

  return previousFetch(input, init);
};

document.addEventListener('click', (event) => {
  if (!event.target.closest?.('#approve-discovery-selection')) return;
  cache = null;
  cacheAt = 0;
}, true);
