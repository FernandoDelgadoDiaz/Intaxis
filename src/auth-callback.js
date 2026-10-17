import { createClient } from '@supabase/supabase-js';

// Magic links can arrive in Safari, Chrome, or an email application's browser.
// Never leave a blank screen if the callback fails.
const query = new URLSearchParams(window.location.search);
const hash = new URLSearchParams(window.location.hash.slice(1));
const callbackError = query.get('error_description') || hash.get('error_description') ||
  query.get('error') || hash.get('error');
const accessToken = hash.get('access_token');
const refreshToken = hash.get('refresh_token');
const authCode = query.get('code');

function clearAuthParams() {
  const cleanQuery = new URLSearchParams(window.location.search);
  for (const key of ['code', 'error', 'error_code', 'error_description', 'provider_token', 'provider_refresh_token']) {
    cleanQuery.delete(key);
  }
  const remaining = cleanQuery.toString();
  window.history.replaceState({}, '', window.location.pathname + (remaining ? '?' + remaining : ''));
}

function showAuthFailure() {
  clearAuthParams();
  const root = document.querySelector('#app');
  if (!root) return;
  root.innerHTML = `<div class="auth-shell"><section class="auth-panel"><div class="login-card">
    <div class="brand"><div class="logo">AP</div><div class="brand-copy"><h1>Agentic Pymes</h1><p>Acceso seguro</p></div></div>
    <h2>No pudimos completar el ingreso</h2>
    <p>El enlace puede haber vencido, haberse utilizado o no haberse abierto correctamente. Volvé a la aplicación y solicitá uno nuevo.</p>
    <a class="primary" style="display:block;text-align:center;text-decoration:none;padding:14px;border-radius:10px" href="/">Volver al inicio</a>
  </div></section></div>`;
}

async function finishMagicLink() {
  if (callbackError) throw new Error('El proveedor de autenticación rechazó el enlace.');
  if (!((accessToken && refreshToken) || authCode)) return;

  const configResponse = await fetch('/api/config');
  if (!configResponse.ok) throw new Error('No se pudo consultar la configuración.');
  const config = await configResponse.json();
  if (!config.supabaseUrl || !config.supabasePublishableKey) throw new Error('Configuración incompleta.');

  const client = createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { detectSessionInUrl: false, persistSession: true, autoRefreshToken: true },
  });
  const result = accessToken && refreshToken
    ? await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
    : await client.auth.exchangeCodeForSession(authCode);
  if (result.error || !result.data?.session) throw result.error || new Error('Sesión no disponible.');
  clearAuthParams();
  // The main app initializes independently; reload so it sees the persisted session.
  window.location.replace(window.location.pathname + window.location.search);
}

if (callbackError || (accessToken && refreshToken) || authCode) {
  try {
    await finishMagicLink();
  } catch (error) {
    console.error('Magic link callback failed:', error?.message || 'unknown error');
    showAuthFailure();
  }
}
