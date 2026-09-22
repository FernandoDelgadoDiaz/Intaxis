import { Router } from 'express';
import { authenticatedUser } from '../supabase.js';
import { requireBusiness } from '../business-context.js';

export const opportunityDevelopmentRouter = Router();

async function loadRun(supabase, businessId, runId) {
  const result = await supabase.from('product_discovery_runs').select('*')
    .eq('business_id', businessId).eq('id', runId).maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

opportunityDevelopmentRouter.post('/discovery/:id/develop', async (req, res) => {
  const { supabase } = await authenticatedUser(req);
  const business = await requireBusiness(supabase);
  const run = await loadRun(supabase, business.id, req.params.id);
  if (!run) return res.status(404).json({ error: 'La investigación no existe.' });
  if (run.status !== 'approved') return res.status(409).json({ error: 'Primero confirmá la selección estratégica.' });

  const selected = await supabase.from('product_discovery_candidates').select('id,rank,name,status')
    .eq('business_id', business.id).eq('discovery_run_id', run.id).eq('status', 'selected').order('rank');
  if (selected.error) throw selected.error;
  if (!(selected.data || []).length) return res.status(409).json({ error: 'No hay oportunidades seleccionadas para desarrollar.' });

  if (['completed', 'partial'].includes(run.development_status)) {
    return res.json({ ok: true, alreadyCompleted: true, developmentStatus: run.development_status, agentRunId: run.development_agent_run_id });
  }

  if (run.development_agent_run_id && req.body?.retry !== true) {
    const existing = await supabase.from('agent_runs').select('id,status,error_message')
      .eq('business_id', business.id).eq('id', run.development_agent_run_id).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data && ['queued', 'running', 'completed'].includes(existing.data.status)) {
      return res.json({
        ok: true,
        reused: true,
        agentRunId: existing.data.id,
        agentRunStatus: existing.data.status,
        developmentStatus: run.development_status,
      });
    }
  }

  const mission = `[INTERNAL:DEVELOP_SELECTED_OPPORTUNITIES] Desarrollar técnicamente ${selected.data.length} oportunidades seleccionadas del Descubrimiento ${run.id}. Flujo interno sin publicación, gasto, contacto a terceros ni compromiso comercial.`;
  const created = await supabase.from('agent_runs').insert({
    business_id: business.id,
    mission,
    status: 'queued',
    delegation_plan: {
      workflow: 'develop_selected_opportunities',
      sequential: true,
      specialists: ['product_experience', 'production_supply', 'quality_compliance'],
    },
    specialist_count: 3,
    technology_cost_class: 'research_growth',
  }).select('*').single();
  if (created.error) throw created.error;

  const updated = await supabase.from('product_discovery_runs').update({
    development_status: 'queued',
    development_stage: 'queued',
    development_agent_run_id: created.data.id,
    development_started_at: null,
    development_completed_at: null,
    development_error_message: null,
    updated_at: new Date().toISOString(),
  }).eq('business_id', business.id).eq('id', run.id);
  if (updated.error) throw updated.error;

  await supabase.from('business_events').insert({
    business_id: business.id,
    event_type: 'opportunity_development.queued',
    source: 'discovery_selection',
    external_id: `development:${run.id}:${created.data.id}`,
    payload: {
      discovery_run_id: run.id,
      agent_run_id: created.data.id,
      candidate_ids: selected.data.map((item) => item.id),
    },
    status: 'processed',
    processed_at: new Date().toISOString(),
  }).then(() => {}).catch(() => {});

  res.status(202).json({
    ok: true,
    agentRunId: created.data.id,
    developmentStatus: 'queued',
    candidates: selected.data.map((item) => ({ id: item.id, rank: item.rank, name: item.name })),
  });
});
