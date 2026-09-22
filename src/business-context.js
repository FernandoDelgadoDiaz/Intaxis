export async function getOwnedBusiness(supabase) {
  const { data, error } = await supabase
    .from('businesses')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function requireBusiness(supabase) {
  const business = await getOwnedBusiness(supabase);
  if (!business) {
    const error = new Error('Primero inicializá Mi Negocio.');
    error.statusCode = 409;
    throw error;
  }
  return business;
}

export async function loadBusinessSnapshot(supabase, businessId) {
  const queries = [
    supabase.from('products').select('*').eq('business_id', businessId).order('name'),
    supabase.from('ingredients').select('*').eq('business_id', businessId).order('name'),
    supabase.from('recipes').select('*').eq('business_id', businessId).order('created_at'),
    supabase.from('recipe_items').select('*').eq('business_id', businessId),
    supabase.from('inventory_movements').select('*').eq('business_id', businessId).order('occurred_at'),
    supabase.from('capacity_settings').select('*').eq('business_id', businessId).order('valid_from', { ascending: false }).limit(10),
    supabase.from('business_decisions').select('*').eq('business_id', businessId).order('effective_at', { ascending: false }).limit(30),
    supabase.from('business_hypotheses').select('*').eq('business_id', businessId).order('updated_at', { ascending: false }).limit(30),
    supabase.from('agent_runs')
      .select('id,mission,status,specialist_count,estimated_model_cost_usd,usage_complete,technology_cost_class,completed_at')
      .eq('business_id', businessId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(30),
  ];

  const [products, ingredients, recipes, recipeItems, movements, capacity, decisions, hypotheses, technologyRuns] = await Promise.all(queries);
  for (const result of [products, ingredients, recipes, recipeItems, movements, capacity, decisions, hypotheses, technologyRuns]) {
    if (result.error) throw result.error;
  }

  const stockByIngredient = new Map();
  for (const movement of movements.data || []) {
    stockByIngredient.set(
      movement.ingredient_id,
      Number(stockByIngredient.get(movement.ingredient_id) || 0) + Number(movement.quantity_delta || 0),
    );
  }

  const recentTechnologyRuns = technologyRuns.data || [];
  const knownTechnologyCostUsd = recentTechnologyRuns.reduce(
    (sum, item) => sum + Number(item.estimated_model_cost_usd || 0),
    0,
  );

  return {
    products: products.data || [],
    ingredients: (ingredients.data || []).map((item) => ({ ...item, current_stock: Number(stockByIngredient.get(item.id) || 0) })),
    recipes: recipes.data || [],
    recipe_items: recipeItems.data || [],
    capacity: capacity.data || [],
    decisions: decisions.data || [],
    hypotheses: hypotheses.data || [],
    technology_costs: {
      recent_runs: recentTechnologyRuns,
      known_model_cost_usd: Number(knownTechnologyCostUsd.toFixed(8)),
      all_usage_complete: recentTechnologyRuns.every((item) => item.usage_complete === true),
      note: 'Costo conocido de tokens de modelo para las últimas misiones completadas; no equivale al costo tecnológico total ni a la factura final.',
    },
  };
}

export function contextForAgent(business, snapshot) {
  return JSON.stringify({
    negocio: {
      id: business.id,
      nombre: business.name,
      ubicacion: `${business.city}, ${business.province}, ${business.country}`,
      etapa: business.stage,
      moneda: business.currency,
    },
    productos: snapshot.products.map((item) => ({ id: item.id, nombre: item.name, estado: item.status, precio: item.sell_price, moneda: item.currency, porcion_gramos: item.portion_grams })),
    insumos: snapshot.ingredients.map((item) => ({ id: item.id, nombre: item.name, unidad: item.unit, costo_unitario: item.cost_per_unit, stock_actual: item.current_stock, punto_reposicion: item.reorder_point, observado_el: item.cost_observed_at, fuente_costo: item.cost_source })),
    recetas: snapshot.recipes,
    componentes_receta: snapshot.recipe_items,
    capacidad: snapshot.capacity,
    decisiones: snapshot.decisions.filter((item) => item.status === 'active').slice(0, 15),
    hipotesis: snapshot.hypotheses.filter((item) => ['open', 'testing'].includes(item.status)).slice(0, 15),
    costo_tecnologico: snapshot.technology_costs,
  }, null, 2);
}
