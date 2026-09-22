import fs from 'node:fs';

const ui = fs.readFileSync(new URL('../src/discovery-integrated.js', import.meta.url), 'utf8');
const launcher = fs.readFileSync(new URL('../src/discovery-launcher.js', import.meta.url), 'utf8');

for (const marker of [
  'Qué demuestra:',
  'No demuestra:',
  'Abrir página del comercio',
  'Referencia de formato',
  'Oferta local',
  'sourceSpecificity',
]) {
  if (!ui.includes(marker)) throw new Error(`Falta semántica visible de evidencia: ${marker}`);
}

for (const marker of [
  'URL profunda del producto',
  'evidence_role',
  'source_specificity',
  'local_offer',
  'format_reference',
]) {
  if (!launcher.includes(marker)) throw new Error(`Falta contrato de investigación trazable: ${marker}`);
}

console.log('Evidence semantics contract OK');
