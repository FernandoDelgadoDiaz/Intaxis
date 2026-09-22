import fs from 'node:fs';

const background = fs.readFileSync(new URL('../netlify/functions/opportunity-development-background.js', import.meta.url), 'utf8');
const route = fs.readFileSync(new URL('../src/routes/offer-enrichment.js', import.meta.url), 'utf8');
const queue = fs.readFileSync(new URL('../src/offer-enrichment-queue.js', import.meta.url), 'utf8');

for (const marker of [
  "queueOfferEnrichment",
  "offer-enrichment-background",
  "handoffToEnrichment",
]) {
  if (!background.includes(marker)) throw new Error(`Falta handoff automático: ${marker}`);
}

if (!route.includes("queueOfferEnrichment")) {
  throw new Error('La ruta de enrichment no reutiliza el servicio de cola compartido.');
}

for (const marker of [
  "enrichment_status: 'queued'",
  "enrichment_agent_run_id: created.data.id",
  "workflow: 'enrich_selected_offers'",
]) {
  if (!queue.includes(marker)) throw new Error(`Falta contrato de cola de enrichment: ${marker}`);
}

console.log('Autonomous enrichment handoff contract OK');
