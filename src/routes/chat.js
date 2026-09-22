import { Router } from 'express';
import { authenticatedUser } from '../supabase.js';
import { requireBusiness, loadBusinessSnapshot, contextForAgent } from '../business-context.js';
import {
  deleteAgentSession,
  getAgentTeam,
  planDirectorMission,
  runSpecialist,
  synthesizeDirectorMission,
} from '../agents.js';

export const chatRouter = Router();
const clean = (value) => String(value || '').trim();

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runWorker()));
  return results;
}

function failedSpecialistResult(message) {
  return {
    summary: 'El especialista no pudo completar su análisis.',
    findings: [],
    evidence: [],
    risks: ['La síntesis final tendrá menor evidencia en esta disciplina.'],
    recommendation: 'No tomar una decisión irreversible basándose en esta disciplina hasta completar el análisis.',
    data_gaps: [String(message || 'Error del especialista')],
    confidence: 'low',
    authorization_required: 'Ninguna',
  };
}

chatRouter.get('/team', async (_req, res) => {
  const team = await getAgentTeam();
  res.json({
    director: team.director,
    specialists: Object.values(team).filter((item) => item.key !== 'director'),
  });
});

chatRouter.post('/chat', async (req, res) => {
  const mission = clean(req.body?.mensaje);
  if (!mission) return res.status(400).json({ error: 'Escribí una misión para el Director.' });
  if (mission.length > 6000) return res.status(400).json({ error: 'La misión supera los 6000 caracteres.' });

  const { supabase } = await authenticatedUser(req);
  const business = await requireBusiness(supabase);
  const { data: run, error: runError } = await supabase
    .from('agent_runs')
    .insert({ business_id: business.id, mission, status: 'running' })
    .select('*')
    .single();

  if (runError?.code === '23505') return res.status(409).json({ error: 'El Director ya tiene una misión en ejecución.' });
  if (runError) throw runError;

  try {
    let { data: thread, error: threadError } = await supabase
      .from('agent_threads')
      .select('*')
      .eq('business_id', business.id)
      .eq('active', true)
      .maybeSingle();
    if (threadError) throw threadError;

    if (!thread) {
      const created = await supabase
        .from('agent_threads')
        .insert({ business_id: business.id, active: true })
        .select('*')
        .single();
      if (created.error) throw created.error;
      thread = created.data;
    }

    await supabase.from('agent_runs').update({ thread_id: thread.id }).eq('id', run.id);

    const businessContext = contextForAgent(
      business,
      await loadBusinessSnapshot(supabase, business.id),
    );

    const planning = await planDirectorMission({
      providerSessionId: thread.provider_session_id,
      mission,
      businessContext,
    });

    const providerSessionId = planning.sessionId || thread.provider_session_id;
    if (providerSessionId !== thread.provider_session_id) {
      const threadUpdate = await supabase
        .from('agent_threads')
        .update({ provider_session_id: providerSessionId, updated_at: new Date().toISOString() })
        .eq('id', thread.id);
      if (threadUpdate.error) throw threadUpdate.error;
    }

    const team = await getAgentTeam();
    const plannedSpecialists = planning.plan.specialists;

    const planUpdate = await supabase
      .from('agent_runs')
      .update({
        delegation_plan: planning.plan,
        specialist_count: plannedSpecialists.length,
      })
      .eq('id', run.id);
    if (planUpdate.error) throw planUpdate.error;

    const specialistResults = await mapWithConcurrency(plannedSpecialists, 3, async (assignment) => {
      const specialist = team[assignment.key];
      if (!specialist?.id) {
        return {
          key: assignment.key,
          name: assignment.key,
          task: assignment.task,
          agentId: '',
          sessionId: null,
          result: failedSpecialistResult('El agente persistente no está disponible.'),
        };
      }

      const { data: trace, error: traceError } = await supabase
        .from('specialist_runs')
        .insert({
          business_id: business.id,
          agent_run_id: run.id,
          specialist_key: assignment.key,
          specialist_name: specialist.name,
          openai_agent_id: specialist.id,
          assigned_task: assignment.task,
          status: 'running',
        })
        .select('*')
        .single();
      if (traceError) throw traceError;

      try {
        const result = await runSpecialist({
          key: assignment.key,
          task: assignment.task,
          mission,
          businessContext,
        });

        const completed = await supabase
          .from('specialist_runs')
          .update({
            openai_session_id: result.sessionId,
            result: result.result,
            status: 'completed',
            completed_at: new Date().toISOString(),
          })
          .eq('id', trace.id);
        if (completed.error) throw completed.error;
        return result;
      } catch (error) {
        const fallback = failedSpecialistResult(error?.message || error);
        await supabase
          .from('specialist_runs')
          .update({
            result: fallback,
            status: 'failed',
            error_message: String(error?.message || error).slice(0, 2000),
            completed_at: new Date().toISOString(),
          })
          .eq('id', trace.id);

        return {
          key: assignment.key,
          name: specialist.name,
          task: assignment.task,
          agentId: specialist.id,
          sessionId: null,
          result: fallback,
        };
      }
    });

    const synthesis = await synthesizeDirectorMission({
      providerSessionId,
      mission,
      businessContext,
      plan: planning.plan,
      specialistResults,
    });

    const complete = await supabase
      .from('agent_runs')
      .update({
        result_summary: synthesis.response,
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', run.id);
    if (complete.error) throw complete.error;

    res.json({
      respuesta: synthesis.response,
      threadId: thread.id,
      delegationPlan: planning.plan,
      specialists: specialistResults.map((item) => ({
        key: item.key,
        name: item.name,
        task: item.task,
        agentId: item.agentId,
        sessionId: item.sessionId,
        confidence: item.result?.confidence || 'low',
      })),
    });
  } catch (error) {
    await supabase
      .from('agent_runs')
      .update({
        status: 'failed',
        error_message: String(error?.message || error).slice(0, 2000),
        completed_at: new Date().toISOString(),
      })
      .eq('id', run.id);
    throw error;
  }
});

chatRouter.post('/reiniciar', async (req, res) => {
  const { supabase } = await authenticatedUser(req);
  const business = await requireBusiness(supabase);
  const { data: thread, error } = await supabase
    .from('agent_threads')
    .select('*')
    .eq('business_id', business.id)
    .eq('active', true)
    .maybeSingle();
  if (error) throw error;

  if (thread) {
    await supabase
      .from('agent_threads')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', thread.id);
    try {
      await deleteAgentSession(thread.provider_session_id);
    } catch (deleteError) {
      console.warn(deleteError?.message);
    }
  }

  res.json({ ok: true });
});
