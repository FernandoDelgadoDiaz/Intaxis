import fs from 'node:fs';
import { estimateModelCostUsd, PRICING_VERSION } from '../src/ai-cost.js';

const teamSource = fs.readFileSync(new URL('../src/team.js', import.meta.url), 'utf8');
const expectedMappings = [
  ["director", "gpt-6-astra"],
  ["market_growth", "gpt-5.6-terra"],
  ["product_experience", "gpt-5.6-terra"],
  ["finance_profitability", "gpt-5.6-terra"],
  ["sales_customers", "gpt-5.6-luna"],
  ["production_supply", "gpt-5.6-luna"],
  ["quality_compliance", "gpt-5.6-terra"],
  ["information_decisions", "gpt-5.6-terra"],
];

for (const [role, model] of expectedMappings) {
  const pattern = new RegExp(`${role}:\\s*['\"]${model.replaceAll('.', '\\.') }['\"]`);
  if (!pattern.test(teamSource)) throw new Error(`Routing faltante o incorrecto: ${role} → ${model}`);
}
if (!teamSource.includes("const SPEC_VERSION = '3'")) throw new Error('SPEC_VERSION debe ser 3 para materializar las instrucciones de Descubrimiento en agentes persistentes.');
if (!teamSource.includes("type: 'web_search'")) throw new Error('Mercado debe conservar búsqueda web live para investigación actual.');
if (!teamSource.includes('URL HTTPS completa y real')) throw new Error('Mercado debe conservar fuentes URL trazables para Descubrimiento.');

const usage = {
  input_tokens: 1_000_000,
  input_tokens_details: { cached_tokens: 250_000 },
  output_tokens: 100_000,
  output_tokens_details: { reasoning_tokens: 20_000 },
  total_tokens: 1_100_000,
};

const luna = estimateModelCostUsd('gpt-5.6-luna', usage);
const terra = estimateModelCostUsd('gpt-5.6-terra', usage);
const astra = estimateModelCostUsd('gpt-6-astra', usage);

if (!luna || !terra || !astra) throw new Error('El estimador no devolvió costos.');
if (!(luna.estimatedModelCostUsd < terra.estimatedModelCostUsd && terra.estimatedModelCostUsd < astra.estimatedModelCostUsd)) {
  throw new Error('La relación de costos Luna < Terra < Astra no se cumple.');
}
if (luna.reasoningTokens !== 20_000 || luna.outputTokens !== 100_000) {
  throw new Error('Los reasoning tokens no deben sumarse nuevamente al output.');
}
if (!PRICING_VERSION.includes('2026-09-22')) throw new Error('La versión de precios debe estar fechada.');

console.log('Cost-efficient routing policy OK');
