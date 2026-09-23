import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.length ? rest.join('=') : true];
  }),
);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const BUSINESS_ID = process.env.PILOT_BUSINESS_ID || args.business_id || null;
const BUSINESS_NAME = process.env.PILOT_BUSINESS_NAME || 'Postres Experiencia';
const PRODUCT_ID = process.env.PILOT_PRODUCT_ID || '4d71037b-1854-4b33-97c6-5292b627563a';
const BLUEPRINT_ID = process.env.PILOT_BLUEPRINT_ID || '21cfb607-3f81-40c1-b097-a41e68a912c4';
const PRODUCT_NAME = process.env.PILOT_PRODUCT_NAME || 'Chocotorta en lata transparente';

if (!SUPABASE_URL) throw new Error('Falta SUPABASE_URL.');

let supabase;
if (SERVICE_ROLE_KEY) {
  supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
} else if (PUBLISHABLE_KEY && ACCESS_TOKEN) {
  supabase = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } },
  });
} else {
  throw new Error(
    'Usá SUPABASE_SERVICE_ROLE_KEY o bien SUPABASE_PUBLISHABLE_KEY + SUPABASE_ACCESS_TOKEN. El script es sólo lectura.',
  );
}

async function unwrap(promise, label) {
  const { data, error, count } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return { data, count };
}

async function countFor(table, businessId) {
  const { count } = await unwrap(
    supabase.from(table).select('*', { count: 'exact', head: true }).eq('business_id', businessId),
    `count ${table}`,
  );
  return count ?? 0;
}

async function resolveBusiness() {
  if (BUSINESS_ID) {
    const { data } = await unwrap(
      supabase.from('businesses').select('id,name,city,province,country,stage,currency,timezone').eq('id', BUSINESS_ID).maybeSingle(),
      'business by id',
    );
    if (!data) throw new Error(`No existe o no es accesible PILOT_BUSINESS_ID=${BUSINESS_ID}.`);
    return data;
  }

  const { data } = await unwrap(
    supabase
      .from('businesses')
      .select('id,name,city,province,country,stage,currency,timezone')
      .eq('name', BUSINESS_NAME)
      .order('created_at', { ascending: true })
      .limit(2),
    'business by name',
  );

  if (data.length !== 1) {
    throw new Error(
      `Se esperó 1 negocio llamado "${BUSINESS_NAME}" y aparecieron ${data.length}. Definí PILOT_BUSINESS_ID.`,
    );
  }
  return data[0];
}

const business = await resolveBusiness();
const businessId = business.id;

const [
  productsResult,
  targetProductResult,
  ingredientsResult,
  recipesResult,
  recipeItemsResult,
  movementsResult,
  actionsResult,
  runsResult,
  specialistsResult,
  usageResult,
  threadsResult,
  policiesResult,
] = await Promise.all([
  unwrap(
    supabase.from('products').select('id,name,status,sell_price,currency,portion_grams,created_at,updated_at').eq('business_id', businessId).order('created_at'),
    'products',
  ),
  unwrap(
    supabase.from('products').select('id,name,status,sell_price,currency,portion_grams').eq('business_id', businessId).eq('id', PRODUCT_ID).maybeSingle(),
    'target product',
  ),
  unwrap(
    supabase.from('ingredients').select('id,name,unit,cost_per_unit,currency,cost_source,cost_observed_at,active,created_at,updated_at').eq('business_id', businessId).order('created_at'),
    'ingredients',
  ),
  unwrap(
    supabase.from('recipes').select('id,product_id,version,status,yield_units,source_action_request_id,source_blueprint_id,created_at,updated_at').eq('business_id', businessId).eq('product_id', PRODUCT_ID).order('version'),
    'recipes',
  ),
  unwrap(
    supabase.from('recipe_items').select('id,recipe_id,ingredient_id,quantity,waste_pct,created_at').eq('business_id', businessId).order('created_at'),
    'recipe items',
  ),
  unwrap(
    supabase.from('inventory_movements').select('id,ingredient_id,quantity_delta,reason,note,occurred_at,source_action_request_id,created_at').eq('business_id', businessId).order('occurred_at'),
    'inventory movements',
  ),
  unwrap(
    supabase.from('agent_action_requests').select('id,agent_run_id,action_type,title,confidence,risk_level,payload,estimated_amount_ars,policy_decision,status,requires_human,execution_result,error_message,created_at,completed_at').eq('business_id', businessId).order('created_at', { ascending: false }).limit(100),
    'agent actions',
  ),
  unwrap(
    supabase.from('agent_runs').select('id,thread_id,mission,result_summary,status,error_message,estimated_model_cost_usd,usage_complete,technology_cost_class,started_at,completed_at').eq('business_id', businessId).order('started_at', { ascending: false }).limit(50),
    'agent runs',
  ),
  unwrap(
    supabase.from('specialist_runs').select('id,agent_run_id,specialist_key,specialist_name,status,model,estimated_model_cost_usd,usage_available,error_message,started_at,completed_at').eq('business_id', businessId).order('started_at', { ascending: false }).limit(200),
    'specialist runs',
  ),
  unwrap(
    supabase.from('ai_usage_events').select('id,agent_run_id,specialist_run_id,role_key,phase,model,input_tokens,cached_input_tokens,output_tokens,reasoning_tokens,total_tokens,estimated_model_cost_usd,usage_available,pricing_version,created_at').eq('business_id', businessId).order('created_at', { ascending: false }).limit(500),
    'ai usage events',
  ),
  unwrap(
    supabase.from('agent_threads').select('id,provider_session_id,active,created_at,updated_at').eq('business_id', businessId).order('created_at'),
    'agent threads',
  ),
  unwrap(
    supabase.from('autonomy_policies').select('id,action_type,mode,min_confidence,max_amount_ars,conditions,active,created_at,updated_at').eq('business_id', businessId).order('action_type'),
    'autonomy policies',
  ),
]);

const countTables = [
  'products',
  'ingredients',
  'recipes',
  'recipe_items',
  'inventory_movements',
  'agent_action_requests',
  'agent_runs',
  'specialist_runs',
  'ai_usage_events',
];
const counts = Object.fromEntries(
  await Promise.all(countTables.map(async (table) => [table, await countFor(table, businessId)])),
);

const targetRecipes = recipesResult.data || [];
const targetRecipeIds = new Set(targetRecipes.map((row) => row.id));
const targetRecipeItems = (recipeItemsResult.data || []).filter((row) => targetRecipeIds.has(row.recipe_id));
const relevantActions = (actionsResult.data || []).filter((row) =>
  ['record_business_inputs', 'materialize_development_recipe'].includes(row.action_type),
);
const pilotRuns = (runsResult.data || []).filter((row) =>
  String(row.mission || '').toLocaleLowerCase('es').includes('3 chocotorta'),
);
const pilotRunIds = new Set(pilotRuns.map((row) => row.id));
const pilotSpecialists = (specialistsResult.data || []).filter((row) => pilotRunIds.has(row.agent_run_id));
const pilotUsage = (usageResult.data || []).filter((row) => pilotRunIds.has(row.agent_run_id));

const snapshot = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  purpose: 'acceptance-test-observability',
  read_only: true,
  business,
  target: {
    product_id: PRODUCT_ID,
    product_name: PRODUCT_NAME,
    blueprint_id: BLUEPRINT_ID,
    product: targetProductResult.data,
  },
  counts,
  products: productsResult.data || [],
  ingredients: ingredientsResult.data || [],
  target_recipes: targetRecipes,
  target_recipe_items: targetRecipeItems,
  inventory_movements: movementsResult.data || [],
  relevant_actions: relevantActions,
  pilot_runs: pilotRuns,
  pilot_specialist_runs: pilotSpecialists,
  pilot_ai_usage_events: pilotUsage,
  agent_threads: threadsResult.data || [],
  autonomy_policies: policiesResult.data || [],
  observations: {
    target_product_present: Boolean(targetProductResult.data),
    target_recipe_from_blueprint_present: targetRecipes.some((row) => row.source_blueprint_id === BLUEPRINT_ID),
    active_thread_count: (threadsResult.data || []).filter((row) => row.active).length,
    failed_relevant_actions: relevantActions.filter((row) => ['failed', 'blocked'].includes(row.status)).length,
    pilot_specialist_count: pilotSpecialists.length,
    pilot_usage_event_count: pilotUsage.length,
    pilot_estimated_model_cost_usd: pilotUsage.reduce(
      (sum, row) => sum + Number(row.estimated_model_cost_usd || 0),
      0,
    ),
  },
};

const json = `${JSON.stringify(snapshot, null, 2)}\n`;
const out = args.out || process.env.PILOT_SNAPSHOT_OUT;
if (out) {
  fs.writeFileSync(out, json, 'utf8');
  console.error(`Snapshot guardado en ${out}`);
} else {
  process.stdout.write(json);
}
