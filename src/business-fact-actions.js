const clean = (value) => String(value ?? '').trim();
const upperCurrency = (value) => clean(value || 'ARS').toUpperCase();
const finitePositive = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};
const finiteNonNegative = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

function dataError(message) {
  const error = new Error(message);
  error.code = 'AUTONOMY_DATA_GAP';
  return error;
}

function normalizeInputItem(item) {
  const name = clean(item?.name);
  const unit = clean(item?.unit);
  const currency = upperCurrency(item?.currency);
  const quantityAdded = finiteNonNegative(item?.quantity_added);
  const unitCost = finiteNonNegative(item?.unit_cost);
  const totalCost = finiteNonNegative(item?.total_cost);
  const source = clean(item?.source);
  const observedAt = clean(item?.observed_at) || new Date().toISOString();
  const note = clean(item?.note) || null;

  if (!name || !unit) throw dataError('Cada hecho de insumo necesita nombre y unidad.');
  if (!/^[A-Z]{3}$/.test(currency)) throw dataError(`Moneda inválida para ${name}.`);
  if (quantityAdded == null && unitCost == null && totalCost == null) {
    throw dataError(`${name} no contiene stock ni costo verificable para registrar.`);
  }
  if (totalCost != null && (!quantityAdded || quantityAdded <= 0) && unitCost == null) {
    throw dataError(`Para ${name}, un costo total requiere cantidad agregada o costo unitario explícito.`);
  }
  const computedUnitCost = unitCost != null
    ? unitCost
    : totalCost != null && quantityAdded > 0
      ? totalCost / quantityAdded
      : null;

  return {
    name,
    unit,
    currency,
    quantity_added: quantityAdded || 0,
    unit_cost: computedUnitCost == null ? null : Number(computedUnitCost.toFixed(8)),
    total_cost: totalCost,
    source: source || 'Dato explícito del propietario',
    observed_at: observedAt,
    note,
  };
}

export async function executeRecordBusinessInputs({ supabase, business, request }) {
  const rawItems = Array.isArray(request?.payload?.items) ? request.payload.items : [];
  if (!rawItems.length) throw dataError('No hay hechos de insumos para registrar.');
  if (rawItems.length > 30) throw dataError('Una acción puede registrar como máximo 30 hechos de insumos.');

  const normalized = rawItems.map(normalizeInputItem);
  const grouped = new Map();
  for (const item of normalized) {
    const key = item.name.toLocaleLowerCase('es');
    if (!grouped.has(key)) {
      grouped.set(key, { ...item });
      continue;
    }
    const previous = grouped.get(key);
    if (previous.unit !== item.unit || previous.currency !== item.currency) {
      throw dataError(`Los hechos repetidos de ${item.name} usan unidades o monedas incompatibles.`);
    }
    const previousQty = Number(previous.quantity_added || 0);
    const nextQty = Number(item.quantity_added || 0);
    const combinedQty = previousQty + nextQty;
    const previousKnownCost = previous.unit_cost == null ? null : previous.unit_cost * Math.max(previousQty, 1);
    const nextKnownCost = item.unit_cost == null ? null : item.unit_cost * Math.max(nextQty, 1);
    previous.quantity_added = combinedQty;
    if (combinedQty > 0 && previousQty > 0 && nextQty > 0 && previousKnownCost != null && nextKnownCost != null) {
      previous.unit_cost = Number(((previousKnownCost + nextKnownCost) / combinedQty).toFixed(8));
    } else if (item.unit_cost != null) {
      previous.unit_cost = item.unit_cost;
    }
    previous.source = `${previous.source}; ${item.source}`;
    previous.note = [previous.note, item.note].filter(Boolean).join(' · ') || null;
    grouped.set(key, previous);
  }

  const persisted = [];
  for (const item of grouped.values()) {
    const existingResult = await supabase
      .from('ingredients')
      .select('*')
      .eq('business_id', business.id)
      .ilike('name', item.name)
      .limit(1)
      .maybeSingle();
    if (existingResult.error) throw existingResult.error;

    let ingredient = existingResult.data || null;
    if (ingredient && clean(ingredient.unit) !== item.unit) {
      throw dataError(`${item.name} ya existe en Mi Negocio con unidad ${ingredient.unit}; no se cambió automáticamente a ${item.unit}.`);
    }

    const ingredientValues = {
      business_id: business.id,
      name: ingredient?.name || item.name,
      unit: item.unit,
      ...(item.unit_cost == null ? {} : {
        cost_per_unit: item.unit_cost,
        currency: item.currency,
        cost_source: item.source,
        cost_observed_at: item.observed_at,
      }),
      updated_at: new Date().toISOString(),
    };

    if (!ingredient) {
      const created = await supabase.from('ingredients').insert(ingredientValues).select('*').single();
      if (created.error) throw created.error;
      ingredient = created.data;
    } else if (item.unit_cost != null) {
      const updated = await supabase
        .from('ingredients')
        .update(ingredientValues)
        .eq('id', ingredient.id)
        .eq('business_id', business.id)
        .select('*')
        .single();
      if (updated.error) throw updated.error;
      ingredient = updated.data;
    }

    let movementId = null;
    if (item.quantity_added > 0) {
      const previousMovement = await supabase
        .from('inventory_movements')
        .select('id')
        .eq('business_id', business.id)
        .eq('ingredient_id', ingredient.id)
        .eq('source_action_request_id', request.id)
        .maybeSingle();
      if (previousMovement.error) throw previousMovement.error;

      if (previousMovement.data) {
        movementId = previousMovement.data.id;
      } else {
        const movement = await supabase.from('inventory_movements').insert({
          business_id: business.id,
          ingredient_id: ingredient.id,
          quantity_delta: item.quantity_added,
          reason: 'purchase',
          note: item.note || item.source,
          occurred_at: item.observed_at,
          source_action_request_id: request.id,
        }).select('id').single();
        if (movement.error) throw movement.error;
        movementId = movement.data.id;
      }
    }

    persisted.push({
      ingredient_id: ingredient.id,
      name: ingredient.name,
      unit: item.unit,
      quantity_added: item.quantity_added,
      unit_cost: item.unit_cost,
      currency: item.currency,
      movement_id: movementId,
    });
  }

  return {
    recorded: persisted.length,
    items: persisted,
    source: 'owner_facts',
  };
}

export async function executeMaterializeDevelopmentRecipe({ supabase, business, request }) {
  const productId = clean(request?.payload?.product_id);
  const blueprintId = clean(request?.payload?.blueprint_id);
  if (!productId || !blueprintId) throw dataError('Faltan product_id o blueprint_id para materializar la receta de desarrollo.');

  const productResult = await supabase
    .from('products')
    .select('id,name,source_discovery_candidate_id')
    .eq('business_id', business.id)
    .eq('id', productId)
    .maybeSingle();
  if (productResult.error) throw productResult.error;
  if (!productResult.data) throw dataError('El producto no existe en Mi Negocio.');

  const blueprintResult = await supabase
    .from('product_discovery_blueprints')
    .select('id,candidate_id,yield_units,ingredients,approval_status,development_status,updated_at')
    .eq('business_id', business.id)
    .eq('id', blueprintId)
    .maybeSingle();
  if (blueprintResult.error) throw blueprintResult.error;
  const blueprint = blueprintResult.data;
  if (!blueprint) throw dataError('La formulación de desarrollo no existe.');
  if (blueprint.candidate_id !== productResult.data.source_discovery_candidate_id) {
    throw dataError('La formulación no pertenece al producto indicado.');
  }

  const components = Array.isArray(blueprint.ingredients) ? blueprint.ingredients : [];
  if (!components.length) throw dataError('La formulación de desarrollo no contiene ingredientes.');
  if (!finitePositive(blueprint.yield_units)) throw dataError('La formulación no tiene rendimiento base válido.');

  const existingResult = await supabase
    .from('recipes')
    .select('*')
    .eq('business_id', business.id)
    .eq('product_id', productId)
    .eq('source_blueprint_id', blueprintId)
    .maybeSingle();
  if (existingResult.error) throw existingResult.error;

  let recipe = existingResult.data || null;
  if (recipe && ['test', 'approved'].includes(recipe.status)) {
    return {
      recipe_id: recipe.id,
      version: recipe.version,
      status: recipe.status,
      reused: true,
      note: 'La receta ya superó el estado draft; no se modificó automáticamente.',
    };
  }

  const ingredientRows = [];
  for (const component of components) {
    const name = clean(component?.name);
    const unit = clean(component?.unit);
    const quantity = finitePositive(component?.quantity);
    if (!name || !unit || quantity == null) throw dataError('La formulación contiene un ingrediente incompleto.');

    const existingIngredient = await supabase
      .from('ingredients')
      .select('*')
      .eq('business_id', business.id)
      .ilike('name', name)
      .limit(1)
      .maybeSingle();
    if (existingIngredient.error) throw existingIngredient.error;

    let ingredient = existingIngredient.data || null;
    if (ingredient && clean(ingredient.unit) !== unit) {
      throw dataError(`${name} ya existe con unidad ${ingredient.unit}; la formulación usa ${unit}.`);
    }
    if (!ingredient) {
      const created = await supabase.from('ingredients').insert({
        business_id: business.id,
        name,
        unit,
      }).select('*').single();
      if (created.error) throw created.error;
      ingredient = created.data;
    }
    ingredientRows.push({ ingredient, quantity });
  }

  if (!recipe) {
    const versions = await supabase
      .from('recipes')
      .select('version')
      .eq('business_id', business.id)
      .eq('product_id', productId)
      .order('version', { ascending: false })
      .limit(1);
    if (versions.error) throw versions.error;
    const nextVersion = Number(versions.data?.[0]?.version || 0) + 1;
    const createdRecipe = await supabase.from('recipes').insert({
      business_id: business.id,
      product_id: productId,
      version: nextVersion,
      status: 'draft',
      yield_units: Number(blueprint.yield_units),
      notes: `Materializada desde formulación de desarrollo ${blueprintId}. Sigue siendo una receta de prueba, no aprobada para venta.`,
      source_action_request_id: request.id,
      source_blueprint_id: blueprintId,
    }).select('*').single();
    if (createdRecipe.error) throw createdRecipe.error;
    recipe = createdRecipe.data;
  } else {
    const updatedRecipe = await supabase.from('recipes').update({
      yield_units: Number(blueprint.yield_units),
      status: 'draft',
      notes: `Sincronizada desde formulación de desarrollo ${blueprintId} (${blueprint.updated_at || 'sin fecha'}). Sigue siendo una receta de prueba, no aprobada para venta.`,
      source_action_request_id: request.id,
      updated_at: new Date().toISOString(),
    }).eq('id', recipe.id).eq('business_id', business.id).select('*').single();
    if (updatedRecipe.error) throw updatedRecipe.error;
    recipe = updatedRecipe.data;
    const deleted = await supabase.from('recipe_items').delete().eq('business_id', business.id).eq('recipe_id', recipe.id);
    if (deleted.error) throw deleted.error;
  }

  const itemRows = ingredientRows.map(({ ingredient, quantity }) => ({
    business_id: business.id,
    recipe_id: recipe.id,
    ingredient_id: ingredient.id,
    quantity,
    waste_pct: 0,
  }));
  const inserted = await supabase.from('recipe_items').insert(itemRows).select('id');
  if (inserted.error) throw inserted.error;

  return {
    recipe_id: recipe.id,
    version: recipe.version,
    status: recipe.status,
    product_id: productId,
    blueprint_id: blueprintId,
    ingredient_count: itemRows.length,
    approval_status: blueprint.approval_status,
    development_status: blueprint.development_status,
    rule: 'La receta queda draft. Materializar no equivale a aprobar producción comercial ni vida útil.',
  };
}
