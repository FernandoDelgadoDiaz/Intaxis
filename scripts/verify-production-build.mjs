import fs from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.length ? rest.join('=') : true];
  }),
);

function expectedBuildFromSource() {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const match = source.match(/export const BUILD_VERSION\s*=\s*['"]([^'"]+)['"]/);
  if (!match?.[1]) throw new Error('No se pudo derivar BUILD_VERSION desde src/app.js.');
  return match[1];
}

const baseUrl = String(args.url || process.env.PRODUCTION_URL || 'https://intaxis.netlify.app').replace(/\/$/, '');
const expected = String(
  args.expected || process.env.EXPECTED_BUILD_VERSION || expectedBuildFromSource(),
);
const candidates = [`${baseUrl}/api/estado`, `${baseUrl}/.netlify/functions/api/estado`];

let lastError;
for (const url of candidates) {
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'agentic-pymes-build-verifier/1' },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      lastError = new Error(`${url}: HTTP ${response.status}`);
      continue;
    }
    const body = await response.json();
    if (body?.build !== expected) {
      throw new Error(`Producción responde build=${body?.build ?? 'desconocido'}; esperado=${expected}.`);
    }
    if (body?.disponible !== true || body?.persistencia !== 'supabase') {
      throw new Error(`Estado productivo inesperado: ${JSON.stringify(body)}.`);
    }
    console.log(`production build verified: ${body.build} · ${url}`);
    process.exit(0);
  } catch (error) {
    lastError = error;
  }
}

throw new Error(`No se pudo verificar producción. ${lastError?.message || 'Sin detalle.'}`);
