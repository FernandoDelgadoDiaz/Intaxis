// Browser-only email magic links use the implicit grant. Unlike PKCE, this
// does not depend on a code verifier stored by the browser that requested
// the email (Gmail/iOS can open the link in a different browser).
export const AUTH_WEB_BUILD = 'agentic-auth-implicit-20261017-r3';
export const AUTH_SESSION_MARKER = 'agentic_auth_had_session';

export const AUTH_BROWSER_OPTIONS = Object.freeze({
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: true,
  flowType: 'implicit',
});

export function createBrowserAuthClient(createClient, url, publishableKey) {
  return createClient(url, publishableKey, {
    auth: { ...AUTH_BROWSER_OPTIONS },
  });
}
