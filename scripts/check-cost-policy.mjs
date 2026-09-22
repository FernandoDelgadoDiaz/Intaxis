process.env.OPENAI_API_KEY ||= 'test-key-for-static-check';

const { MODEL_BY_ROLE } = await import('../src/team.js');
const { estimateModelCostUsd, PRICING_VERSION } = await import('../src/ai-cost.js');

const expected = {
  director: 'gpt-6-astra',
  market_growth: 'gpt-5.6-terra',
  product_experience: 'gpt-5.6-terra',
  finance_profitability: 'gpt-5.6-terra',
  sales_customers: 'gpt-5.6-luna',
  production_supply: 'gpt-5.6-luna',
  quality_compliance: 'gpt-5.6-terra',
  information_decisions: 'gpt-5.6-terra',
};

for (const [role, model] of Object.entries(expected)) {
  if (MODEL_BY_ROLE[role] !== model) {
    throw new Error(`Routing incorrecto para ${role}: ${MODEL_BY_ROLE[role]} != ${model}`);
  }
}

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
