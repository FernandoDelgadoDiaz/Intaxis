import fs from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.length ? rest.join('=') : true];
  }),
);

const REQUIRE_ORDER = ['conversation', 'recipe', 'facts', 'trace'];

function ids(rows = []) {
  return new Set(rows.map((row) => row.id).filter(Boolean));
}

function deltaRows(before = [], after = []) {
  const previous = ids(before);
  return after.filter((row) => !previous.has(row.id));
}

function count(snapshot, key) {
  return Number(snapshot?.counts?.[key] || 0);
}

function hasPilotMission(run) {
  return String(run?.mission || '')
    .toLocaleLowerCase('es')
    .replace(/[.!?]+$/g, '')
    .trim()
    .includes('quiero hacer 3 chocotortas');
}

function actionAddsPhysicalStock(action) {
  if (action?.action_type !== 'record_business_inputs') return false;
  const items = Array.isArray(action?.payload?.items) ? action.payload.items : [];
  return items.some((item) => Number(item?.quantity_added || 0) > 0);
}

function stageResult(name, checks) {
  const failed = checks.filter((check) => !check.pass && !check.warning);
  const warnings = checks.filter((check) => check.warning);
  return {
    name,
    pass: failed.length === 0,
    checks,
    failed: failed.map((check) => check.message),
    warnings: warnings.map((check) => check.message),
  };
}

export function evaluate(before, after) {
  if (!before || !after) throw new Error('Se requieren snapshots before y after.');
  if (before.schema_version !== after.schema_version) {
    throw new Error(`Schema de snapshot incompatible: ${before.schema_version} vs ${after.schema_version}.`);
  }
  if (before.business?.id !== after.business?.id) {
    throw new Error('Los snapshots pertenecen a negocios distintos.');
  }
  if (before.target?.product_id !== after.target?.product_id) {
    throw new Error('Los snapshots apuntan a productos distintos.');
  }

  const newRuns = deltaRows(before.pilot_runs, after.pilot_runs);
  const completedPilotRuns = newRuns.filter((run) => hasPilotMission(run) && run.status === 'completed');
  const failedPilotRuns = newRuns.filter((run) => hasPilotMission(run) && run.status === 'failed');
  const newActions = deltaRows(before.relevant_actions, after.relevant_actions);
  const failedActions = newActions.filter((action) => ['failed', 'blocked'].includes(action.status));
  const newMaterialize = newActions.filter(
    (action) => action.action_type === 'materialize_development_recipe' && action.status === 'completed',
  );
  const newFacts = newActions.filter(
    (action) => action.action_type === 'record_business_inputs' && action.status === 'completed',
  );

  const blueprintId = after.target?.blueprint_id;
  const recipe = (after.target_recipes || []).find(
    (row) => row.source_blueprint_id === blueprintId && row.status === 'draft',
  );
  const recipeItems = recipe
    ? (after.target_recipe_items || []).filter((row) => row.recipe_id === recipe.id)
    : [];

  const expectedPhysicalStock = newFacts.some(actionAddsPhysicalStock);
  const inventoryDelta = count(after, 'inventory_movements') - count(before, 'inventory_movements');
  const ingredientDelta = count(after, 'ingredients') - count(before, 'ingredients');

  const completedRunIds = new Set(completedPilotRuns.map((run) => run.id));
  const traceUsage = (after.pilot_ai_usage_events || []).filter((row) => completedRunIds.has(row.agent_run_id));
  const traceSpecialists = (after.pilot_specialist_runs || []).filter((row) => completedRunIds.has(row.agent_run_id));
  const badUsageCost = traceUsage.filter(
    (row) => row.usage_available && row.estimated_model_cost_usd == null,
  );

  const conversation = stageResult('conversation', [
    {
      pass: Boolean(after.observations?.target_product_present),
      message: 'El producto Chocotorta objetivo debe seguir presente.',
    },
    {
      pass: completedPilotRuns.length >= 1,
      message: 'Debe existir un nuevo agent_run completado iniciado desde “Quiero hacer 3 chocotortas”.',
    },
    {
      pass: failedPilotRuns.length === 0,
      message: 'No debe haber un pilot run fallido para la intención inicial.',
    },
    {
      pass: Number(after.observations?.active_thread_count || 0) === 1,
      message: 'Debe mantenerse exactamente un thread activo para continuidad conversacional.',
    },
    {
      pass: failedActions.length === 0,
      message: 'No debe haber acciones relevantes nuevas fallidas o bloqueadas.',
    },
  ]);

  const recipeStage = stageResult('recipe', [
    {
      pass: Boolean(recipe),
      message: 'Debe existir una receta draft trazada al blueprint real de Chocotorta.',
    },
    {
      pass: recipeItems.length >= 5,
      message: 'La receta materializada debe tener al menos los 5 componentes previstos.',
    },
    {
      pass: newMaterialize.length >= 1 || Boolean(recipe && !(before.target_recipes || []).some((row) => row.id === recipe.id)),
      message: 'La materialización debe quedar evidenciada por una acción completada o por una receta nueva trazable.',
    },
  ]);

  const factsStage = stageResult('facts', [
    {
      pass: newFacts.length >= 1,
      message: 'Debe completarse al menos una acción record_business_inputs después de que el dueño aporte un hecho real.',
    },
    {
      pass: ingredientDelta > 0 || count(after, 'ingredients') > 0,
      message: 'Los hechos/receta deben quedar reflejados en ingredientes persistentes.',
    },
    {
      pass: !expectedPhysicalStock || inventoryDelta > 0,
      message: 'Si el dueño declaró ingreso físico de stock, debe existir movimiento de inventario.',
    },
  ]);

  const traceStage = stageResult('trace', [
    {
      pass: traceUsage.length > 0,
      message: 'El pilot run completado debe dejar ai_usage_events para medir costo tecnológico.',
    },
    {
      pass: badUsageCost.length === 0,
      message: 'Todo uso marcado usage_available debe conservar costo estimado.',
    },
    {
      pass: true,
      warning: traceSpecialists.length > 3,
      message: `Se invocaron ${traceSpecialists.length} especialistas en el/los pilot run(s); revisar si todos cambiaron materialmente la decisión.`,
    },
  ]);

  return {
    generated_at: new Date().toISOString(),
    business_id: after.business.id,
    target_product_id: after.target.product_id,
    stages: { conversation, recipe: recipeStage, facts: factsStage, trace: traceStage },
    deltas: {
      agent_runs: count(after, 'agent_runs') - count(before, 'agent_runs'),
      specialist_runs: count(after, 'specialist_runs') - count(before, 'specialist_runs'),
      ai_usage_events: count(after, 'ai_usage_events') - count(before, 'ai_usage_events'),
      ingredients: ingredientDelta,
      recipes: count(after, 'recipes') - count(before, 'recipes'),
      recipe_items: count(after, 'recipe_items') - count(before, 'recipe_items'),
      inventory_movements: inventoryDelta,
      agent_action_requests: count(after, 'agent_action_requests') - count(before, 'agent_action_requests'),
    },
    efficiency: {
      specialists_for_completed_pilot_runs: traceSpecialists.length,
      usage_events_for_completed_pilot_runs: traceUsage.length,
      estimated_model_cost_usd: traceUsage.reduce(
        (sum, row) => sum + Number(row.estimated_model_cost_usd || 0),
        0,
      ),
    },
  };
}

function requiredStages(requirement) {
  if (requirement === 'full') return REQUIRE_ORDER;
  const index = REQUIRE_ORDER.indexOf(requirement);
  if (index === -1) {
    throw new Error(`--require debe ser uno de: ${[...REQUIRE_ORDER, 'full'].join(', ')}.`);
  }
  return REQUIRE_ORDER.slice(0, index + 1);
}

function printReport(report, requirement) {
  const required = new Set(requiredStages(requirement));
  console.log(`Pilot acceptance · require=${requirement}`);
  for (const name of REQUIRE_ORDER) {
    const stage = report.stages[name];
    const marker = stage.pass ? 'PASS' : required.has(name) ? 'FAIL' : 'PENDING';
    console.log(`${marker} · ${name}`);
    for (const check of stage.checks) {
      const symbol = check.warning ? 'WARN' : check.pass ? 'ok' : 'x';
      console.log(`  ${symbol} · ${check.message}`);
    }
  }
  console.log(`Deltas: ${JSON.stringify(report.deltas)}`);
  console.log(`Efficiency: ${JSON.stringify(report.efficiency)}`);
}

function syntheticSnapshots() {
  const before = {
    schema_version: 1,
    business: { id: 'business-1' },
    target: { product_id: 'product-1', blueprint_id: 'blueprint-1' },
    counts: {
      products: 3,
      ingredients: 0,
      recipes: 0,
      recipe_items: 0,
      inventory_movements: 0,
      agent_action_requests: 0,
      agent_runs: 0,
      specialist_runs: 0,
      ai_usage_events: 0,
    },
    observations: { target_product_present: true, active_thread_count: 1 },
    relevant_actions: [],
    pilot_runs: [],
    pilot_specialist_runs: [],
    pilot_ai_usage_events: [],
    target_recipes: [],
    target_recipe_items: [],
  };

  const after = structuredClone(before);
  after.counts = {
    ...before.counts,
    ingredients: 5,
    recipes: 1,
    recipe_items: 5,
    inventory_movements: 3,
    agent_action_requests: 2,
    agent_runs: 1,
    specialist_runs: 1,
    ai_usage_events: 3,
  };
  after.relevant_actions = [
    {
      id: 'action-facts',
      action_type: 'record_business_inputs',
      status: 'completed',
      payload: { items: [{ name: 'Queso crema', quantity_added: 580 }] },
    },
    {
      id: 'action-recipe',
      action_type: 'materialize_development_recipe',
      status: 'completed',
      payload: {},
    },
  ];
  after.pilot_runs = [
    { id: 'run-1', mission: 'Quiero hacer 3 chocotortas.', status: 'completed' },
  ];
  after.target_recipes = [
    { id: 'recipe-1', status: 'draft', source_blueprint_id: 'blueprint-1' },
  ];
  after.target_recipe_items = Array.from({ length: 5 }, (_, index) => ({
    id: `item-${index}`,
    recipe_id: 'recipe-1',
  }));
  after.pilot_specialist_runs = [
    { id: 'specialist-1', agent_run_id: 'run-1', specialist_key: 'production_supply' },
  ];
  after.pilot_ai_usage_events = [
    { id: 'usage-1', agent_run_id: 'run-1', usage_available: true, estimated_model_cost_usd: 0.01 },
    { id: 'usage-2', agent_run_id: 'run-1', usage_available: true, estimated_model_cost_usd: 0.02 },
    { id: 'usage-3', agent_run_id: 'run-1', usage_available: true, estimated_model_cost_usd: 0.01 },
  ];
  after.observations = { target_product_present: true, active_thread_count: 1 };
  return { before, after };
}

if (args['self-test']) {
  const { before, after } = syntheticSnapshots();
  const report = evaluate(before, after);
  const failed = requiredStages('full').filter((name) => !report.stages[name].pass);
  if (failed.length) throw new Error(`Self-test falló: ${failed.join(', ')}`);
  console.log('pilot acceptance checker self-test: ok');
  process.exit(0);
}

const beforePath = args.before;
const afterPath = args.after;
const requirement = args.require || 'full';
if (!beforePath || !afterPath) {
  throw new Error(
    'Uso: node scripts/check-pilot-acceptance.mjs --before=before.json --after=after.json --require=conversation|recipe|facts|trace|full',
  );
}

const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
const after = JSON.parse(fs.readFileSync(afterPath, 'utf8'));
const report = evaluate(before, after);
printReport(report, requirement);

const failedRequired = requiredStages(requirement).filter((name) => !report.stages[name].pass);
if (failedRequired.length) {
  console.error(`Acceptance FAIL: ${failedRequired.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log(`Acceptance PASS: ${requirement}`);
}
