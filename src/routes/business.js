import { Router } from 'express';
import { authenticatedUser } from '../supabase.js';
import { getOwnedBusiness, requireBusiness, loadBusinessSnapshot } from '../business-context.js';

export const businessRouter = Router();
const clean = (value) => String(value || '').trim();
const jsonObject = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const offerModes = new Set(['product', 'service', 'mixed']);

businessRouter.get('/mi-negocio', async (req, res) => {
  const { supabase } = await authenticatedUser(req);
  const business = await getOwnedBusiness(supabase);
  if (!business) return res.json({ business: null, snapshot: null });
  res.json({ business, snapshot: await loadBusinessSnapshot(supabase, business.id) });
});

businessRouter.post('/mi-negocio/bootstrap', async (req, res) => {
  const { supabase, user } = await authenticatedUser(req);
  const existing = await getOwnedBusiness(supabase);
  if (existing) return res.json({ business: existing, created: false });

  const name = clean(req.body?.name);
  const city = clean(req.body?.city);
  const province = clean(req.body?.province);
  const country = clean(req.body?.country);
  const timezone = clean(req.body?.timezone);
  const currency = clean(req.body?.currency);
  if (!name || !city || !province || !country || !timezone || !currency) {
    return res.status(400).json({ error: 'Para crear una PyME se necesitan nombre, ubicación, zona horaria y moneda.' });
  }

  const { data, error } = await supabase.from('businesses').insert({
    owner_user_id: user.id,
    name,
    city,
    province,
    country,
    timezone,
    stage: clean(req.body?.stage) || 'validacion',
    currency,
  }).select('*').single();
  if (error) throw error;

  const profile = req.body?.profile;
  if (profile && typeof profile === 'object' && !Array.isArray(profile)) {
    const profileResult = await supabase.from('business_profiles').upsert({
      business_id: data.id,
      industry: clean(profile.industry) || null,
      business_model: clean(profile.business_model) || null,
      offer_mode: offerModes.has(profile.offer_mode) ? profile.offer_mode : 'mixed',
      target_market: jsonObject(profile.target_market),
      discovery_context: jsonObject(profile.discovery_context),
      operational_context: jsonObject(profile.operational_context),
      terminology: jsonObject(profile.terminology),
      vertical_config: jsonObject(profile.vertical_config),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'business_id' });
    if (profileResult.error) throw profileResult.error;
  }

  res.status(201).json({ business: data, created: true });
});

businessRouter.put('/mi-negocio/profile', async (req, res) => {
  const { supabase } = await authenticatedUser(req);
  const business = await requireBusiness(supabase);
  const mode = offerModes.has(req.body?.offer_mode) ? req.body.offer_mode : 'mixed';
  const { data, error } = await supabase.from('business_profiles').upsert({
    business_id: business.id,
    industry: clean(req.body?.industry) || null,
    business_model: clean(req.body?.business_model) || null,
    offer_mode: mode,
    target_market: jsonObject(req.body?.target_market),
    discovery_context: jsonObject(req.body?.discovery_context),
    operational_context: jsonObject(req.body?.operational_context),
    terminology: jsonObject(req.body?.terminology),
    vertical_config: jsonObject(req.body?.vertical_config),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'business_id' }).select('*').single();
  if (error) throw error;
  res.json({ profile: data });
});

businessRouter.post('/products', async (req, res) => {
  const { supabase } = await authenticatedUser(req);
  const business = await requireBusiness(supabase);
  const name = clean(req.body?.name);
  if (!name) return res.status(400).json({ error: 'El producto necesita nombre.' });
  const { data, error } = await supabase.from('products').insert({
    business_id: business.id, name, description: clean(req.body?.description) || null,
    status: req.body?.status || 'draft',
    sell_price: req.body?.sell_price === '' || req.body?.sell_price == null ? null : Number(req.body.sell_price),
    portion_grams: req.body?.portion_grams === '' || req.body?.portion_grams == null ? null : Number(req.body.portion_grams),
  }).select('*').single();
  if (error) throw error;
  res.status(201).json(data);
});

businessRouter.post('/ingredients', async (req, res) => {
  const { supabase } = await authenticatedUser(req);
  const business = await requireBusiness(supabase);
  const name = clean(req.body?.name), unit = clean(req.body?.unit);
  if (!name || !unit) return res.status(400).json({ error: 'El insumo necesita nombre y unidad.' });
  const { data, error } = await supabase.from('ingredients').insert({
    business_id: business.id, name, unit,
    cost_per_unit: req.body?.cost_per_unit === '' || req.body?.cost_per_unit == null ? null : Number(req.body.cost_per_unit),
    cost_source: clean(req.body?.cost_source) || null,
    cost_observed_at: req.body?.cost_per_unit ? new Date().toISOString() : null,
    reorder_point: req.body?.reorder_point === '' || req.body?.reorder_point == null ? null : Number(req.body.reorder_point),
  }).select('*').single();
  if (error) throw error;
  const initialStock = Number(req.body?.initial_stock || 0);
  if (initialStock > 0) {
    const { error: movementError } = await supabase.from('inventory_movements').insert({ business_id: business.id, ingredient_id: data.id, quantity_delta: initialStock, reason: 'initial', note: 'Stock inicial' });
    if (movementError) throw movementError;
  }
  res.status(201).json(data);
});

businessRouter.post('/inventory/movements', async (req, res) => {
  const { supabase } = await authenticatedUser(req);
  const business = await requireBusiness(supabase);
  const quantity = Number(req.body?.quantity_delta);
  if (!req.body?.ingredient_id || !Number.isFinite(quantity) || quantity === 0) return res.status(400).json({ error: 'Movimiento de stock inválido.' });
  const { data, error } = await supabase.from('inventory_movements').insert({ business_id: business.id, ingredient_id: req.body.ingredient_id, quantity_delta: quantity, reason: req.body?.reason || 'adjustment', note: clean(req.body?.note) || null }).select('*').single();
  if (error) throw error;
  res.status(201).json(data);
});

businessRouter.post('/recipes', async (req, res) => {
  const { supabase } = await authenticatedUser(req);
  const business = await requireBusiness(supabase);
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!req.body?.product_id || items.length === 0) return res.status(400).json({ error: 'La receta necesita producto y al menos un insumo.' });
  const { data: existing, error: existingError } = await supabase.from('recipes').select('version').eq('business_id', business.id).eq('product_id', req.body.product_id).order('version', { ascending: false }).limit(1);
  if (existingError) throw existingError;
  const { data: recipe, error: recipeError } = await supabase.from('recipes').insert({ business_id: business.id, product_id: req.body.product_id, version: (existing?.[0]?.version || 0) + 1, status: req.body?.status || 'draft', yield_units: Number(req.body?.yield_units || 1), notes: clean(req.body?.notes) || null }).select('*').single();
  if (recipeError) throw recipeError;
  const rows = items.map((item) => ({ business_id: business.id, recipe_id: recipe.id, ingredient_id: item.ingredient_id, quantity: Number(item.quantity), waste_pct: Number(item.waste_pct || 0) }));
  const { error: itemsError } = await supabase.from('recipe_items').insert(rows);
  if (itemsError) throw itemsError;
  res.status(201).json(recipe);
});

businessRouter.post('/capacity', async (req, res) => {
  const { supabase } = await authenticatedUser(req);
  const business = await requireBusiness(supabase);
  const value = Number(req.body?.daily_capacity_units);
  if (!Number.isInteger(value) || value < 0) return res.status(400).json({ error: 'Capacidad inválida.' });
  const { data, error } = await supabase.from('capacity_settings').upsert({ business_id: business.id, valid_from: req.body?.valid_from || new Date().toISOString().slice(0, 10), daily_capacity_units: value, notes: clean(req.body?.notes) || null }, { onConflict: 'business_id,valid_from' }).select('*').single();
  if (error) throw error;
  res.status(201).json(data);
});

businessRouter.post('/decisions', async (req, res) => {
  const { supabase } = await authenticatedUser(req);
  const business = await requireBusiness(supabase);
  const title = clean(req.body?.title), decision = clean(req.body?.decision);
  if (!title || !decision) return res.status(400).json({ error: 'La decisión necesita título y contenido.' });
  const { data, error } = await supabase.from('business_decisions').insert({ business_id: business.id, title, decision, rationale: clean(req.body?.rationale) || null, source: clean(req.body?.source) || 'Propietario', status: 'active' }).select('*').single();
  if (error) throw error;
  res.status(201).json(data);
});

businessRouter.post('/hypotheses', async (req, res) => {
  const { supabase } = await authenticatedUser(req);
  const business = await requireBusiness(supabase);
  const title = clean(req.body?.title), statement = clean(req.body?.statement);
  if (!title || !statement) return res.status(400).json({ error: 'La hipótesis necesita título y enunciado.' });
  const { data, error } = await supabase.from('business_hypotheses').insert({ business_id: business.id, title, statement, validation_method: clean(req.body?.validation_method) || null, success_criteria: clean(req.body?.success_criteria) || null, status: 'open' }).select('*').single();
  if (error) throw error;
  res.status(201).json(data);
});
