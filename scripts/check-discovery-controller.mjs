import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const required = '/src/discovery-integrated.js';
const forbidden = [
  '/src/network-resilience.js',
  '/src/discovery-launcher.js',
  '/src/discovery-direct-data.js',
  '/src/discovery-safe.js',
  '/src/discovery-selection-fix.js',
];

if (!html.includes(required)) throw new Error(`Falta ${required} en index.html`);
for (const entry of forbidden) {
  if (html.includes(entry)) throw new Error(`Controlador antiguo todavía cargado: ${entry}`);
}

const source = fs.readFileSync(new URL('../src/discovery-integrated.js', import.meta.url), 'utf8');
for (const marker of ['current_business_access', 'product_discovery_runs', 'confirm_discovery_selection', 'TIMEOUT_MS']) {
  if (!source.includes(marker)) throw new Error(`Falta contrato de Descubrimiento: ${marker}`);
}

console.log('Discovery single-controller contract OK');
