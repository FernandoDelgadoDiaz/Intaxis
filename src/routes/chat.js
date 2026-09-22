import { Router } from 'express';
import { authenticatedUser } from '../supabase.js';
import { requireBusiness, loadBusinessSnapshot, contextForAgent } from '../business-context.js';
import { createAgentSession, continueAgentSession, deleteAgentSession } from '../agents.js';

export const chatRouter = Router();
const clean = (value) => String(value || '').trim();

chatRouter.post('/chat', async (req, res) => {
  const mission = clean(req.body?.mensaje);
  if (!mission) return res.status(400).json({ error: 'Escribí una misión para el Director.' });
  if (mission.length > 6000) return res.status(400).json({ error: 'La misión supera los 6000 caracteres.' });
  const { supabase } = await authenticatedUser(req);
  const business = await requireBusiness(supabase);
  const { data: run, error: runError } = await supabase.from('agent_runs').insert({ business_id: business.id, mission, status: 'running' }).select('*').single();
  if (runError?.code === '23505') return res.status(409).json({ error: 'El Director ya tiene una misión en ejecución.' });
  if (runError) throw runError;
  try {
    let { data: thread, error: threadError } = await supabase.from('agent_threads').select('*').eq('business_id', business.id).eq('active', true).maybeSingle();
    if (threadError) throw threadError;
    if (!thread) {
      const created = await supabase.from('agent_threads').insert({ business_id: business.id, active: true }).select('*').single();
      if (created.error) throw created.error;
      thread = created.data;
    }
    await supabase.from('agent_runs').update({ thread_id: thread.id }).eq('id', run.id);
    const businessContext = contextForAgent(business, await loadBusinessSnapshot(supabase, business.id));
    const result = thread.provider_session_id
      ? await continueAgentSession({ providerSessionId: thread.provider_session_id, mission, businessContext })
      : await createAgentSession({ mission, businessContext });
    const providerSessionId = result.sessionId || thread.provider_session_id;
    if (providerSessionId !== thread.provider_session_id) {
      const updated = await supabase.from('agent_threads').update({ provider_session_id: providerSessionId, updated_at: new Date().toISOString() }).eq('id', thread.id);
      if (updated.error) throw updated.error;
    }
    const complete = await supabase.from('agent_runs').update({ result_summary: result.response, status: 'completed', completed_at: new Date().toISOString() }).eq('id', run.id);
    if (complete.error) throw complete.error;
    res.json({ respuesta: result.response, threadId: thread.id });
  } catch (error) {
    await supabase.from('agent_runs').update({ status: 'failed', error_message: String(error?.message || error).slice(0, 2000), completed_at: new Date().toISOString() }).eq('id', run.id);
    throw error;
  }
});

chatRouter.post('/reiniciar', async (req, res) => {
  const { supabase } = await authenticatedUser(req);
  const business = await requireBusiness(supabase);
  const { data: thread, error } = await supabase.from('agent_threads').select('*').eq('business_id', business.id).eq('active', true).maybeSingle();
  if (error) throw error;
  if (thread) {
    await supabase.from('agent_threads').update({ active: false, updated_at: new Date().toISOString() }).eq('id', thread.id);
    try { await deleteAgentSession(thread.provider_session_id); } catch (deleteError) { console.warn(deleteError?.message); }
  }
  res.json({ ok: true });
});
