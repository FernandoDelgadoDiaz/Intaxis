const previousFetch = window.fetch.bind(window);

const RESILIENT_PATHS = ['/api/discovery', '/api/mi-negocio'];
const TIMEOUT_MS = 9000;

function requestUrl(input) {
  return typeof input === 'string' ? input : input?.url || '';
}

function requestMethod(input, init) {
  return String(init?.method || input?.method || 'GET').toUpperCase();
}

function isResilientRead(input, init) {
  if (requestMethod(input, init) !== 'GET') return false;
  const url = requestUrl(input);
  return RESILIENT_PATHS.some((path) => url === path || url.startsWith(`${path}?`));
}

async function timedFetch(input, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await previousFetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

window.fetch = async (input, init = {}) => {
  if (!isResilientRead(input, init) || init?.signal) return previousFetch(input, init);

  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await timedFetch(input, init);
      if (response.status >= 500 && attempt === 0) continue;
      return response;
    } catch (error) {
      lastError = error;
      const retryable = error?.name === 'AbortError' || error instanceof TypeError;
      if (!retryable || attempt === 1) break;
    }
  }

  if (lastError?.name === 'AbortError') {
    throw new Error('La carga tardó demasiado. Verificá la conexión y reintentá.');
  }
  throw lastError || new Error('No se pudo completar la carga.');
};

function ensureDiscoveryRetry() {
  const screen = document.querySelector('[data-discovery-screen].discovery-empty');
  if (!screen || !/No se pudo cargar Descubrimiento/i.test(screen.textContent || '')) return;
  if (screen.querySelector('[data-discovery-retry]')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'primary';
  button.dataset.discoveryRetry = 'true';
  button.textContent = 'Reintentar carga';
  button.style.marginTop = '14px';
  screen.appendChild(button);
}

document.addEventListener('click', (event) => {
  const retry = event.target.closest?.('[data-discovery-retry]');
  if (!retry) return;
  event.preventDefault();
  retry.disabled = true;
  retry.textContent = 'Reintentando…';
  document.querySelector('[data-discovery-nav]')?.click();
}, true);

const observer = new MutationObserver(() => queueMicrotask(ensureDiscoveryRetry));
observer.observe(document.querySelector('#app'), { childList: true, subtree: true });
