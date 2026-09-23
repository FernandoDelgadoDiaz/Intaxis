import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

const agents = read('../src/agents.js');
const autonomy = read('../src/autonomy.js');
const facts = read('../src/business-fact-actions.js');
const team = read('../src/team.js');
const vision = read('../docs/PRODUCT_VISION.md');
const migration = read('../supabase/migrations/0018_agentic_fact_ingestion.sql');

const required = [
  [agents, 'record_business_inputs', 'Director no puede proponer persistencia de hechos'],
  [agents, 'materialize_development_recipe', 'Director no puede materializar receta de desarrollo'],
  [agents, 'cerrar un loop existente tiene prioridad', 'La orquestación no aplica el filtro de visión'],
  [autonomy, 'executeRecordBusinessInputs', 'Autonomy no ejecuta persistencia de hechos'],
  [autonomy, 'executeMaterializeDevelopmentRecipe', 'Autonomy no ejecuta materialización de receta'],
  [facts, 'source_action_request_id', 'Persistencia de hechos no es trazable/idempotente'],
  [facts, "status: 'draft'", 'La receta de desarrollo no queda protegida como draft'],
  [facts, 'source_blueprint_id', 'La receta no conserva origen del blueprint'],
  [team, "SPEC_VERSION = '5'", 'Los agentes persistentes no forzarán actualización de instrucciones'],
  [team, 'FILTRO DE VISIÓN AGENTIC OBLIGATORIO', 'El Director no tiene filtro de visión permanente'],
  [vision, 'Filtro obligatorio de decisiones', 'PRODUCT_VISION no contiene el filtro rector'],
  [vision, 'cerrar un loop existente tiene prioridad', 'PRODUCT_VISION no prioriza cerrar loops'],
  [migration, 'record_business_inputs', 'La migración no siembra política de hechos'],
  [migration, 'materialize_development_recipe', 'La migración no siembra política de recetas draft'],
  [migration, 'inventory_movements_action_ingredient_uq', 'La migración no protege idempotencia de stock'],
];

for (const [text, token, message] of required) {
  if (!text.includes(token)) throw new Error(`${message}: falta ${token}`);
}

console.log('agentic fact ingestion + vision filter guard: ok');
