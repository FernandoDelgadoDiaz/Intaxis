import { Router } from 'express';
import { authenticatedUser } from '../supabase.js';
import { requireBusiness } from '../business-context.js';
import { approveAndExecuteAction } from '../autonomy.js';

export const autonomyRouter = Router();
const clean = (value) => String(value ?? '').trim();

function policyPatch(body = {}) {
  const patch = { updated_at: new Date().toISOString() };
  if (body.mode != null) {
    if (!['autonomous', 'approval', 'blocked'].includes(body.mode)) throw new Error('Modo de autonomía inválido.');
    patch.mode = body.mode;
  }
  if (body.min_confidence != null) {
    const value = Number(body.min_confidence);
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('Confianza mínima inválida.');
    patch.min_confidence = value;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'max_amount_ars')) {
    if (body.max_amount_ars == null || body.max_amount_ars === '') patch.max_amount_ars = null;
    else {
      const value = Number(body.max_amount_ars);
      if (!Number.isFinite(value) || value < 0) throw new Error('Límite monetario inválido.');
      patch.max_amount_ars = value;
    }
  }
  if (body.conditions && typeof body.conditions === 'object' && !Array.isArray(body.conditions)) patch.conditions = body.conditions;
  return patch;
}

autonomyRouter.get('/autonomy/status', async (req, res) => {
  const { supabase } = await authenticatedUser(req);
  const business = await requireBusiness(supabase);
  const [policies, actions, connections, campaigns, content, orders] = await Promise.all([
    supabase.from('autonomy_policies').select('*').eq('business_id', business.id).eq('active', true).order('action_type'),
    supabase.from('agent_action_requests').select('*').eq('business_id', business.id).order('created_at', { ascending: false }).limit(50),
    supabase.from('channel_connections').select('id,provider,display_name,status,capabilities,connected_at,last_sync_at').eq('business_id', business.id).order('provider'),
    supabase.from('marketing_campaigns').select('id,name,objective,status,budget_ars,started_at,ended_at').eq('business_id', business.id).order('created_at', { ascending: false }).limit(20),
    supabase.from('content_items').select('id,campaign_id,provider,content_type,status,concept,hypothesis,published_at').eq('business_id', business.id).order('created_at', { ascending: false }).limit(30),
    supabase.from('sales_orders').select('id,status,source_provider,total_ars,requested_for,created_at').eq('business_id', business.id).order('created_at', { ascending: false }).limit(50),
  ]);
  for (const result of [policies, actions, connections, campaigns, content, orders]) if (result.error) throw result.error;

  const actionRows = actions.data || [];
  const autonomousCompleted = actionRows.filter((row) => row.requires_human === false && row.status === 'completed').length;
  const completed = actionRows.filter((row) => row.status === 'completed').length;
  const humanPending = actionRows.filter((row) => row.status === 'awaiting_approval').length;

  res.json({
    business: { id: business.id, name: business.name },
    policies: policies.data || [],
    actions: actionRows,
    channels: connections.data || [],
    campaigns: campaigns.data || [],
    content: content.data || [],
    orders: orders.data || [],
    autonomy: {
      autonomous_completed: autonomousCompleted,
      completed_actions: completed,
      awaiting_human: humanPending,
      autonomy_rate: completed ? Number((autonomousCompleted / completed).toFixed(4)) : null,
      definition: 'Acciones completadas sin intervención humana / acciones completadas.',
    },
  });
});

autonomyRouter.patch('/autonomy/policies/:actionType', async (req, res) => {
  const { supabase } = await authenticatedUser(req);
  const business = await requireBusiness(supabase);
  const actionType = clean(req.params.actionType);
  const patch = policyPatch(req.body || {});
  const { data, error } = await supabase.from('autonomy_policies')
    .update(patch)
    .eq('business_id', business.id)
    .eq('action_type', actionType)
    .select('*')
    .single();
  if (error) throw error;
  res.json(data);
});

autonomyRouter.post('/autonomy/actions/:id/approve', async (req, res) => {
  const { supabase, user } = await authenticatedUser(req);
  const business = await requireBusiness(supabase);
  const result = await approveAndExecuteAction({
    supabase,
    business,
    userId: user.id,
    requestId: req.params.id,
  });
  res.json(result);
});
