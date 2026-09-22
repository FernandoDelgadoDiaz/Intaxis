// Agentic Pymes · costo variable de IA
// Tarifas estándar de contexto corto verificadas contra OpenAI el 2026-09-22.
// Valores por 1 millón de tokens. Las tarifas cambian: mantener esta tabla versionada.
// Este estimador NO incluye web search, cache writes, sandbox, terceros, impuestos,
// recargos regionales ni el multiplicador de contexto largo. Por eso es costo modelo estimado,
// no factura final.

export const PRICING_VERSION = 'openai-standard-short-context-2026-09-22';

export const MODEL_PRICING_USD_PER_MILLION = Object.freeze({
  'gpt-6-astra': { input: 10, cachedInput: 1, output: 50 },
  'gpt-5.6-terra': { input: 2, cachedInput: 0.2, output: 12 },
  'gpt-5.6-luna': { input: 0.2, cachedInput: 0.02, output: 1.2 },
});

const asNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export function normalizeUsage(usage) {
  if (!usage || typeof usage !== 'object') return null;

  const inputTokens = asNumber(usage.input_tokens);
  const cachedInputTokens = Math.min(
    inputTokens,
    asNumber(usage.input_tokens_details?.cached_tokens),
  );
  const outputTokens = asNumber(usage.output_tokens);
  const reasoningTokens = Math.min(
    outputTokens,
    asNumber(usage.output_tokens_details?.reasoning_tokens),
  );
  const totalTokens = asNumber(usage.total_tokens) || inputTokens + outputTokens;

  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningTokens,
    totalTokens,
  };
}

export function estimateModelCostUsd(model, usage) {
  const normalized = normalizeUsage(usage);
  const price = MODEL_PRICING_USD_PER_MILLION[model];
  if (!normalized || !price) return null;

  const uncachedInputTokens = Math.max(
    normalized.inputTokens - normalized.cachedInputTokens,
    0,
  );

  // Los reasoning tokens ya están incluidos dentro de output_tokens: no se suman dos veces.
  const cost = (
    uncachedInputTokens * price.input +
    normalized.cachedInputTokens * price.cachedInput +
    normalized.outputTokens * price.output
  ) / 1_000_000;

  return {
    ...normalized,
    uncachedInputTokens,
    estimatedModelCostUsd: Number(cost.toFixed(8)),
    pricingVersion: PRICING_VERSION,
  };
}

export function sumKnownCosts(items) {
  return Number(
    items
      .map((item) => Number(item?.estimatedModelCostUsd))
      .filter(Number.isFinite)
      .reduce((sum, value) => sum + value, 0)
      .toFixed(8),
  );
}
