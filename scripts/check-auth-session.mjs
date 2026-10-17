import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AUTH_BROWSER_OPTIONS, AUTH_WEB_BUILD, createBrowserAuthClient } from '../src/auth-session.js';

assert.equal(AUTH_BROWSER_OPTIONS.flowType, 'implicit', 'Email magic links must remain cross-browser compatible');
assert.equal(AUTH_BROWSER_OPTIONS.detectSessionInUrl, true, 'Magic-link tokens must be read from the redirect');
assert.equal(AUTH_BROWSER_OPTIONS.persistSession, true, 'Sessions must persist in the browser');
assert.equal(AUTH_BROWSER_OPTIONS.autoRefreshToken, true, 'Sessions must refresh automatically');
assert.match(AUTH_WEB_BUILD, /^agentic-auth-implicit-/);

let calls = 0;
const fakeFactory = (url, key, options) => {
  calls += 1;
  assert.equal(url, 'https://example.supabase.co');
  assert.equal(key, 'public-key');
  assert.deepEqual(options.auth, AUTH_BROWSER_OPTIONS);
  return { auth: { getSession: async () => ({ data: { session: { access_token: 'test-token' } } }) } };
};
const first = createBrowserAuthClient(fakeFactory, 'https://example.supabase.co', 'public-key');
const reopened = createBrowserAuthClient(fakeFactory, 'https://example.supabase.co', 'public-key');
assert.equal((await reopened.auth.getSession()).data.session.access_token, 'test-token');
assert.equal(first !== reopened, true);
assert.equal(calls, 2);

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const web = fs.readFileSync(new URL('../src/web.js', import.meta.url), 'utf8');
assert.doesNotMatch(html, /src\/auth-callback\.js/, 'Never load a second competing auth client');
assert.match(web, /createBrowserAuthClient\(createClient/, 'The app must use the shared auth config');
assert.match(web, /getSession\(\)/, 'The app must recover session on reload');
assert.match(web, /data-auth-build="\$\{AUTH_WEB_BUILD\}"/, 'A build marker must appear in the web bundle');

console.log('Auth configuration and persistent session recovery contract verified');
