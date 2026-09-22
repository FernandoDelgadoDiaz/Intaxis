import { Router } from 'express';
import { authenticatedUser } from '../supabase.js';
import { requireBusiness } from '../business-context.js';

export const operationRouter = Router();
const clean = (value) => String(value ?? '').trim();

async function currentAccess(supabase) {
  const { data, error } = await supabase.rpc('current_business_access');
  if (error) throw error;
  return Array.isArray(data) ? data[0] || null : data || null;
}

function assertOwner(access) {
  if (!access || access.role !== 'owner') {
    const error = new Error('Esta acción requiere rol propietario.');
    error.statusCode = 403;
    throw error;
  }
}

async function loadOwnerOperationData(supabase, businessId) {
  const [tasks, members, invites] = await Promise.all([
    supabase.from('operation_tasks').select('*').eq('business_id', businessId).order('created_at', { ascending: false }).limit(100),
    supabase.from('business_members').select('id,user_id,role,display_name,active,created_at').eq('business_id', businessId).order('created_at'),
    supabase.from('business_invites').select('id,email,role,token,status,expires_at,created_at').eq('business_id', businessId).order('created_at', { ascending: false }).limit(30),
  ]);
  for (const result of [tasks, members, invites]) if (result.error) throw result.error;
  return { tasks: tasks.data || [], members: members.data || [], invites: invites.data || [] };
}

async function loadOperatorOperationData(supabase, businessId) {
  const { data, error } = await supabase
    .from('operation_tasks')
    .select('*')
    .eq('business_id', businessId)
    .neq('status', 'cancelled')
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return { tasks: data || [], members: [], invites: [] };
}

operationRouter.get('/access', async (req, res) => {
  const { supabase } = await authenticatedUser(req);
  const access = await currentAccess(supabase);
  res.json({ access });
});

operationRouter.post('/operation/claim-invite', async (req, res) => {
  const { supabase } = await authenticatedUser(req);
  const token = clean(req.body?.token);
  if (!token) return res.status(400).json({ error: 'Falta el token de invitación.' });
  const { data, error } = await supabase.rpc('claim_business_invite', { p_token: token });
  if (error) throw error;
  res.json({ ok: true, access: Array.isArray(data) ? data[0] || null : data || null });
});

operationRouter.get('/operation', async (req, res) => {
  const { supabase } = await authenticatedUser(req);
  const access = await currentAccess(supabase);
  if (!access) return res.status(403).json({ error: 'No tenés acceso a una empresa activa.' });
  const detail = access.role === 'owner'
    ? await loadOwnerOperationData(supabase, access.business_id)
    : await loadOperatorOperationData(supabase, access.business_id);
  res.json({ access, ...detail });
});

operationRouter.post('/operation/invites', async (req, res) => {
  const { supabase, user } = await authenticatedUser(req);
  const access = await currentAccess(supabase);
  assertOwner(access);
  const email = clean(req.body?.email).toLowerCase();
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Ingresá un correo válido.' });

  const { data, error } = await supabase
    .from('business_invites')
    .insert({ business_id: access.business_id, email, role: 'operator', created_by: user.id })
    .select('id,email,role,token,status,expires_at,created_at')
    .single();
  if (error) throw error;
  res.status(201).json({ invite: data, inviteUrl: `${req.protocol}://${req.get('host')}/?invite=${data.token}` });
});

function defaultChecklist(taskType) {
  if (taskType === 'production') {
    return [
      { label: 'Área, manos y utensilios listos', required: true, done: false },
      { label: 'Insumos y envases verificados', required: true, done: false },
      { label: 'Preparación realizada según receta', required: true, done: false },
      { label: 'Armado y cierre completados', required: true, done: false },
      { label: 'Frío / almacenamiento asegurado', required: true, done: false },
    ];
  }
  return [
    { label: 'Tarea revisada', required: true, done: false },
    { label: 'Ejecución completada', required: true, done: false },
    { label: 'Resultado registrado', required: true, done: false },
  ];
}

async function buildRecipeSnapshot(supabase, businessId, productId, taskQuantity) {
  if (!productId) return { productName: null, recipeSnapshot: {}, inputsSnapshot: [] };

  const productResult = await supabase.from('products').select('id,name').eq('business_id', businessId).eq('id', productId).single();
  if (productResult.error) throw productResult.error;
  const product = productResult.data;

  const recipeResult = await supabase
    .from('recipes')
    .select('id,version,status,yield_units,notes')
    .eq('business_id', businessId)
    .eq('product_id', productId)
    .neq('status', 'retired')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recipeResult.error) throw recipeResult.error;
  const recipe = recipeResult.data;
  if (!recipe) return { productName: product.name, recipeSnapshot: {}, inputsSnapshot: [] };

  const itemsResult = await supabase
    .from('recipe_items')
    .select('ingredient_id,quantity,waste_pct')
    .eq('business_id', businessId)
    .eq('recipe_id', recipe.id);
  if (itemsResult.error) throw itemsResult.error;
  const ingredientIds = (itemsResult.data || []).map((item) => item.ingredient_id);
  let ingredients = [];
  if (ingredientIds.length) {
    const ingredientResult = await supabase
      .from('ingredients')
      .select('id,name,unit')
      .eq('business_id', businessId)
      .in('id', ingredientIds);
    if (ingredientResult.error) throw ingredientResult.error;
    ingredients = ingredientResult.data || [];
  }
  const byId = new Map(ingredients.map((item) => [item.id, item]));
  const scale = Number(taskQuantity || 0) > 0 ? Number(taskQuantity) / Number(recipe.yield_units || 1) : 1;
  const inputsSnapshot = (itemsResult.data || []).map((item) => {
    const ingredient = byId.get(item.ingredient_id);
    const base = Number(item.quantity || 0) * scale;
    const required = base * (1 + Number(item.waste_pct || 0) / 100);
    return {
      ingredient_id: item.ingredient_id,
      name: ingredient?.name || 'Insumo',
      unit: ingredient?.unit || '',
      quantity: Number(required.toFixed(4)),
      waste_pct: Number(item.waste_pct || 0),
    };
  });

  return {
    productName: product.name,
    recipeSnapshot: {
      recipe_id: recipe.id,
      version: recipe.version,
      status: recipe.status,
      yield_units: Number(recipe.yield_units || 1),
      notes: recipe.notes || null,
    },
    inputsSnapshot,
  };
}

operationRouter.post('/operation/tasks', async (req, res) => {
  const { supabase, user } = await authenticatedUser(req);
  const access = await currentAccess(supabase);
  assertOwner(access);
  const business = await requireBusiness(supabase);
  const taskType = clean(req.body?.task_type) || 'production';
  const title = clean(req.body?.title);
  const quantity = req.body?.quantity === '' || req.body?.quantity == null ? null : Number(req.body.quantity);
  if (!title) return res.status(400).json({ error: 'La tarea necesita un título.' });
  if (quantity != null && (!Number.isFinite(quantity) || quantity < 0)) return res.status(400).json({ error: 'Cantidad inválida.' });

  const snapshot = await buildRecipeSnapshot(supabase, business.id, req.body?.product_id || null, quantity);
  const checklist = Array.isArray(req.body?.checklist) && req.body.checklist.length
    ? req.body.checklist.map((item) => ({ label: clean(item.label), required: item.required !== false, done: false })).filter((item) => item.label)
    : defaultChecklist(taskType);

  const { data, error } = await supabase
    .from('operation_tasks')
    .insert({
      business_id: business.id,
      task_type: taskType,
      title,
      product_id: req.body?.product_id || null,
      product_name: snapshot.productName,
      quantity,
      unit: clean(req.body?.unit) || 'unidades',
      priority: clean(req.body?.priority) || 'normal',
      due_at: req.body?.due_at || null,
      assigned_user_id: req.body?.assigned_user_id || null,
      instructions: clean(req.body?.instructions) || null,
      checklist,
      recipe_snapshot: snapshot.recipeSnapshot,
      inputs_snapshot: snapshot.inputsSnapshot,
      created_by: user.id,
    })
    .select('*')
    .single();
  if (error) throw error;

  await supabase.from('operation_events').insert({ business_id: business.id, task_id: data.id, actor_user_id: user.id, event_type: 'created' });
  res.status(201).json(data);
});

operationRouter.post('/operation/tasks/:id/action', async (req, res) => {
  const { supabase } = await authenticatedUser(req);
  const action = clean(req.body?.action);
  if (!action) return res.status(400).json({ error: 'Falta la acción.' });
  const { data, error } = await supabase.rpc('operator_task_action', {
    p_task_id: req.params.id,
    p_action: action,
    p_payload: req.body?.payload || {},
  });
  if (error) throw error;
  res.json(Array.isArray(data) ? data[0] || null : data || null);
});
