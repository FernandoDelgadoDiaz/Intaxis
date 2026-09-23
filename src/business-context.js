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

const clipped = (value, max = 1800) => {
  const text = String(value || '').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

export async function loadBusinessSnapshot(supabase, businessId) {
  const queries = [
    supabase.from('business_profiles').select('*').eq('business_id', businessId).maybeSingle(),
    supabase.from('products').select('*').eq('business_id', businessId).order('name'),
    supabase.from('ingredients').select('*').eq('business_id', businessId).order('name'),
    supabase.from('recipes').select('*').eq('business_id', businessId).order('created_at'),
    supabase.from('recipe_items').select('*').eq('business_id', businessId),
    supabase.from('inventory_movements').select('*').eq('business_id', businessId).order('occurred_at'),
    supabase.from('capacity_settings').select('*').eq('business_id', businessId).order('valid_from', { ascending: false }).limit(10),
    supabase.from('business_decisions').select('*').eq('business_id', businessId).order('effective_at', { ascending: false }).limit(30),
    supabase.from('business_hypotheses').select('*').eq('business_id', businessId).order('updated_at', { ascending: false }).limit(30),
    supabase.from('autonomy_policies')
      .select('id,action_type,mode,min_confidence,max_amount_ars,conditions,active,updated_at')
      .eq('business_id', businessId)
      .eq('active', true)
      .order('action_type'),
    supabase.from('product_discovery_candidates')
      .select('id,name,rank,status,discovery_run_id')
      .eq('business_id', businessId),
    supabase.from('product_discovery_blueprints')
      .select('id,candidate_id,portion_grams,yield_units,ingredients,human_instructions,instructions,packaging,quality_notes,approval_status,development_status,costing,operating_conditions,updated_at')
      .eq('business_id', businessId),
    supabase.from('agent_runs')
      .select('id,mission,result_summary,status,specialist_count,estimated_model_cost_usd,usage_complete,technology_cost_class,completed_at')
      .eq('business_id', businessId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(30),
  ];

  const [
    profile,
    products,
    ingredients,
    recipes,
    recipeItems,
    movements,
    capacity,
    decisions,
    hypotheses,
    autonomyPolicies,
    discoveryCandidates,
    discoveryBlueprints,
    technologyRuns,
  ] = await Promise.all(queries);

  for (const result of [
    profile,
    products,
    ingredients,
    recipes,
    recipeItems,
    movements,
    capacity,
    decisions,
    hypotheses,
    autonomyPolicies,
    discoveryCandidates,
    discoveryBlueprints,
    technologyRuns,
  ]) {
    if (result.error) throw result.error;
  }

  const stockByIngredient = new Map();
  for (const movement of movements.data || []) {
    stockByIngredient.set(
      movement.ingredient_id,
      Number(stockByIngredient.get(movement.ingredient_id) || 0) + Number(movement.quantity_delta || 0),
    );
  }

  const candidatesById = new Map((discoveryCandidates.data || []).map((item) => [item.id, item]));
  const blueprintsByCandidate = new Map((discoveryBlueprints.data || []).map((item) => [item.candidate_id, item]));
  const developmentOffers = (products.data || [])
    .filter((product) => product.source_discovery_candidate_id)
    .map((product) => {
      const candidate = candidatesById.get(product.source_discovery_candidate_id) || null;
      const blueprint = blueprintsByCandidate.get(product.source_discovery_candidate_id) || null;
      if (!blueprint) return null;
      return {
        product_id: product.id,
        product_name: product.name,
        candidate_id: product.source_discovery_candidate_id,
        candidate_rank: candidate?.rank ?? null,
        candidate_status: candidate?.status || null,
        blueprint_id: blueprint.id,
        portion_grams: blueprint.portion_grams == null ? null : Number(blueprint.portion_grams),
        yield_units: blueprint.yield_units == null ? null : Number(blueprint.yield_units),
        ingredients: Array.isArray(blueprint.ingredients) ? blueprint.ingredients : [],
        human_instructions: Array.isArray(blueprint.human_instructions) ? blueprint.human_instructions : [],
        technical_instructions: Array.isArray(blueprint.instructions) ? blueprint.instructions : [],
        packaging: blueprint.packaging || {},
        costing: blueprint.costing || {},
        operating_conditions: blueprint.operating_conditions || {},
        quality_notes: blueprint.quality_notes || null,
        approval_status: blueprint.approval_status || null,
        development_status: blueprint.development_status || null,
        updated_at: blueprint.updated_at || null,
      };
    })
    .filter(Boolean);

  const recentTechnologyRuns = technologyRuns.data || [];
  const knownTechnologyCostUsd = recentTechnologyRuns.reduce(
    (sum, item) => sum + Number(item.estimated_model_cost_usd || 0),
    0,
  );

  return {
    business_profile: profile.data || null,
    products: products.data || [],
    ingredients: (ingredients.data || []).map((item) => ({ ...item, current_stock: Number(stockByIngredient.get(item.id) || 0) })),
    recipes: recipes.data || [],
    recipe_items: recipeItems.data || [],
    development_offers: developmentOffers,
    capacity: capacity.data || [],
    decisions: decisions.data || [],
    hypotheses: hypotheses.data || [],
    autonomy_policies: autonomyPolicies.data || [],
    recent_context: recentTechnologyRuns.slice(0, 3).map((item) => ({
      id: item.id,
      mission: clipped(item.mission, 1200),
      result_summary: clipped(item.result_summary, 1800),
      completed_at: item.completed_at,
    })),
    technology_costs: {
      recent_runs: recentTechnologyRuns.map(({ result_summary, ...item }) => item),
      known_model_cost_usd: Number(knownTechnologyCostUsd.toFixed(8)),
      all_usage_complete: recentTechnologyRuns.every((item) => item.usage_complete === true),
      note: 'Costo conocido de tokens de modelo para las últimas misiones completadas; no equivale al costo tecnológico total ni a la factura final.',
    },
  };
}

export function contextForAgent(business, snapshot) {
  const profile = snapshot.business_profile || null;
  return JSON.stringify({
    negocio: {
      id: business.id,
      nombre: business.name,
      ubicacion: `${business.city}, ${business.province}, ${business.country}`,
      etapa: business.stage,
      moneda: business.currency,
      perfil: profile ? {
        industria: profile.industry,
        modelo_negocio: profile.business_model,
        modo_oferta: profile.offer_mode,
        mercado_objetivo: profile.target_market || {},
        contexto_descubrimiento: profile.discovery_context || {},
        contexto_operativo: profile.operational_context || {},
        terminologia: profile.terminology || {},
        configuracion_vertical: profile.vertical_config || {},
      } : null,
    },
    productos: snapshot.products.map((item) => ({
      id: item.id,
      nombre: item.name,
      estado_comercial: item.status,
      origen: item.origin || 'manual',
      fase_desarrollo: item.development_phase || 'manual',
      precio: item.sell_price,
      moneda: item.currency,
      porcion_gramos: item.portion_grams,
      presentacion_recomendada: item.visual_strategy?.recommended_presentation || null,
      imagen_real_disponible: Boolean(item.primary_media?.url),
      imagen_aspiracional_disponible: Boolean(item.aspirational_media?.url),
    })),
    desarrollo_ofertas: (snapshot.development_offers || []).map((item) => ({
      product_id: item.product_id,
      producto: item.product_name,
      candidate_id: item.candidate_id,
      blueprint_id: item.blueprint_id,
      porcion_gramos: item.portion_grams,
      rendimiento_base_unidades: item.yield_units,
      formulacion_banco: item.ingredients,
      instrucciones_humanas: item.human_instructions,
      instrucciones_tecnicas: item.technical_instructions,
      envase: item.packaging,
      costeo: item.costing,
      condiciones_operativas: item.operating_conditions,
      estado_calidad: item.approval_status,
      estado_desarrollo: item.development_status,
      notas_calidad: item.quality_notes,
      actualizado_el: item.updated_at,
      regla: 'Esta formulación es una base de desarrollo/prueba. Puede escalarse matemáticamente para un piloto, pero no debe presentarse como receta comercial aprobada ni como vida útil validada.',
    })),
    insumos: snapshot.ingredients.map((item) => ({ id: item.id, nombre: item.name, unidad: item.unit, costo_unitario: item.cost_per_unit, stock_actual: item.current_stock, punto_reposicion: item.reorder_point, observado_el: item.cost_observed_at, fuente_costo: item.cost_source })),
    recetas: snapshot.recipes,
    componentes_receta: snapshot.recipe_items,
    capacidad: snapshot.capacity,
    contexto_reciente: snapshot.recent_context || [],
    politicas_autonomia: (snapshot.autonomy_policies || []).map((item) => ({
      action_type: item.action_type,
      mode: item.mode,
      min_confidence: Number(item.min_confidence),
      max_amount_ars: item.max_amount_ars == null ? null : Number(item.max_amount_ars),
      conditions: item.conditions || {},
      updated_at: item.updated_at,
    })),
    decisiones: snapshot.decisions.filter((item) => item.status === 'active').slice(0, 15),
    hipotesis: snapshot.hypotheses.filter((item) => ['open', 'testing'].includes(item.status)).slice(0, 15),
    costo_tecnologico: snapshot.technology_costs,
  }, null, 2);
}
