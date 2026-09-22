import fs from 'node:fs';

const team = fs.readFileSync(new URL('../src/team.js', import.meta.url), 'utf8');
const cost = fs.readFileSync(new URL('../src/ai-cost.js', import.meta.url), 'utf8');

const expected = {
  director: 'gpt-5.6-sol',
  market_growth: 'gpt-5.6-sol',
  product_experience: 'gpt-5.6-sol',
  finance_profitability: 'gpt-5.6-sol',
  sales_customers: 'gpt-5.6-terra',
  production_supply: 'gpt-5.6-terra',
  quality_compliance: 'gpt-5.6-sol',
  information_decisions: 'gpt-5.6-sol',
};

for (const [role, model] of Object.entries(expected)) {
  const marker = `${role}: '${model}'`;
  if (!team.includes(marker)) throw new Error(`Routing de ${role} no cumple la política reliability-first.`);
}

if (!team.includes("model_policy: 'reliability-first-v1'")) {
  throw new Error('Falta metadata reliability-first-v1.');
}

if (!team.includes("const SPEC_VERSION = '4'")) {
  throw new Error('La política reliability-first debe reconciliar los agentes persistentes con SPEC_VERSION 4.');
}

if (!cost.includes("'gpt-5.6-sol': { input: 4, cachedInput: 0.4, output: 20 }")) {
  throw new Error('Falta pricing de gpt-5.6-sol en el ledger de costo.');
}

console.log('Model policy check OK');
