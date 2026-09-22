import fs from 'node:fs';

const resume = fs.readFileSync(new URL('../src/offer-enrichment-resume.js', import.meta.url), 'utf8');
const background = fs.readFileSync(new URL('../netlify/functions/offer-enrichment-background.js', import.meta.url), 'utf8');

for (const marker of [
  'hasGroundedVisual',
  'hasHumanInstructions',
  'needsQualityRepair',
  'needsAspirationalMedia',
  "reuse_persisted: ['market_growth', 'product_experience']",
  "workflow: 'resume_offer_enrichment'",
]) {
  if (!resume.includes(marker)) throw new Error(`Falta contrato de reanudación de enrichment: ${marker}`);
}

if (!background.includes('processOfferEnrichmentResumable')) {
  throw new Error('El background de enrichment no usa el procesador reanudable.');
}

console.log('Stage-aware enrichment resume contract OK');
