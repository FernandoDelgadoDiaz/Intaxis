import { createClient } from '@supabase/supabase-js';

const query = new URLSearchParams(window.location.search);
const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));

const callbackError =
  query.get('error_description') ||
  hash.get('error_description') ||
  query.get('error') ||
  hash.get('error');

if (callbackError) {
  throw new Error(decodeURIComponent(callbackError.replace(/\+/g, ' ')));
}

const accessToken = hash.get('access_token');
const refreshToken = hash.get('refresh_token');
const authCode = query.get('code');
const hasImplicitSession = Boolean(accessToken && refreshToken);
const hasPkceCode = Boolean(authCode);

if (hasImplicitSession || hasPkceCode) {
  const configResponse = await fetch('/api/config');
  if (!configResponse.ok) throw new Error('No se pudo cargar la configuración de autenticación.');

  const config = await configResponse.json();
  if (!config.supabaseUrl || !config.supabasePublishableKey) {
    throw new Error('La infraestructura de autenticación todavía no está configurada.');
  }

  const authClient = createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  if (hasImplicitSession) {
    const { error } = await authClient.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
  } else {
    const { error } = await authClient.auth.exchangeCodeForSession(authCode);
    if (error) throw error;
  }

  const cleanQuery = new URLSearchParams(window.location.search);
  for (const key of [
    'code',
    'error',
    'error_code',
    'error_description',
    'provider_token',
    'provider_refresh_token',
  ]) {
    cleanQuery.delete(key);
  }

  const cleanSearch = cleanQuery.toString();
  const cleanUrl = `${window.location.pathname}${cleanSearch ? `?${cleanSearch}` : ''}`;
  window.history.replaceState({}, '', cleanUrl);
}
