import fs from 'node:fs';

const context = fs.readFileSync(new URL('../src/business-context.js', import.meta.url), 'utf8');
const agents = fs.readFileSync(new URL('../src/agents.js', import.meta.url), 'utf8');

const requiredContextTokens = [
  "from('product_discovery_blueprints')",
  'development_offers',
  'desarrollo_ofertas',
  'formulacion_banco',
  'instrucciones_humanas',
  'contexto_reciente',
];
for (const token of requiredContextTokens) {
  if (!context.includes(token)) throw new Error(`Falta integración de contexto de piloto: ${token}`);
}

const requiredAgentTokens = [
  'MAX_SPECIALISTS_PER_MISSION = 4',
  'REGLA ESPECIAL · PREPARAR PILOTO',
  'SALIDA OBLIGATORIA PARA PILOTO',
  'El propietario no debe hacer las cuentas',
  'Producción y Abastecimiento',
  'Caja y Rentabilidad',
];
for (const token of requiredAgentTokens) {
  if (!agents.includes(token)) throw new Error(`Falta orquestación agentic de piloto: ${token}`);
}

console.log('pilot orchestration guard: ok');
