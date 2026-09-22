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
import {
  estimateModelCostUsd,
  normalizeUsage,
  PRICING_VERSION,
  sumKnownCosts,
} from '../ai-cost.js';
import { registerDirectorActions } from '../autonomy.js';

export const chatRouter = Router();
const clean = (value) => String(value || '').trim();

function missionFromRequest(req) {
  if (typeof req.body === 'string') return clean(req.body);
  if (req.body && typeof req.body === 'object') {
    return clean(req.body.mensaje ?? req.body.mission ?? req.body.message);
  }
  return '';
}

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

async function recordUsageEvent({
  supabase,
  businessId,
  agentRunId,
  specialistRunId = null,
  roleKey,
  phase,
  model,
  sessionId,
  turnId,
  usage,
}) {
  const normalized = normalizeUsage(usage);
  const estimate = estimateModelCostUsd(model, usage);
  const row = {
    business_id: businessId,
    agent_run_id: agentRunId,
    specialist_run_id: specialistRunId,
    role_key: roleKey,
    phase,
    model,
    openai_session_id: sessionId || null,
    openai_turn_id: turnId || null,
    input_tokens: normalized?.inputTokens ?? null,
    cached_input_tokens: normalized?.cachedInputTokens ?? null,
    output_tokens: normalized?.outputTokens ?? null,
    reasoning_tokens: normalized?.reasoningTokens ?? null,
    total_tokens: normalized?.totalTokens ?? null,
    estimated_model_cost_usd: estimate?.estimatedModelCostUsd ?? null,
    usage_available: Boolean(normalized),
    pricing_version: PRICING_VERSION,
  };

  const { error } = await supabase.from('ai_usage_events').insert(row);
  if (error) throw error;

  return {
    usageAvailable: Boolean(normalized),
    estimatedModelCostUsd: estimate?.estimatedModelCostUsd ?? null,
    ...normalized,
  };
}

chatRouter.get('/team', async (req, res) => {
  await authenticatedUser(req);
  const team = await getAgentTeam();
  const publicShape = (item) => ({
    key: item.key,
    name: item.name,
    model: item.model,
    purpose: item.purpose,
    activation: item.activation,
  });
  res.json({
    director: publicShape(team.director),
    specialists: Object.values(team)
      .filter((item) => item.key !== 'director')
      .map(publicShape),
  });
});

chatRouter.post('/chat', async (req, res) => {
  const mission = missionFromRequest(req);
  if (!mission) return res.status(400).json({ error: 'Escribí una misión para el Director.' });
  if (mission.length > 6000) return res.status(400).json({ error: 'La misión supera los 6000 caracteres.' });

  const { supabase, user } = await authenticatedUser(req);
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

    const planningUsage = await recordUsageEvent({
      supabase,
      businessId: business.id,
      agentRunId: run.id,
      roleKey: 'director',
      phase: 'director_plan',
      model: planning.model,
      sessionId: planning.sessionId,
      turnId: planning.turnId,
      usage: planning.usage,
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
          model: null,
          task: assignment.task,
          agentId: '',
          sessionId: null,
          usageAvailable: false,
          estimatedModelCostUsd: null,
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
          model: specialist.model,
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

        const cost = await recordUsageEvent({
          supabase,
          businessId: business.id,
          agentRunId: run.id,
          specialistRunId: trace.id,
          roleKey: assignment.key,
          phase: 'specialist',
          model: result.model || specialist.model,
          sessionId: result.sessionId,
          turnId: result.turnId,
          usage: result.usage,
        });

        const completed = await supabase
          .from('specialist_runs')
          .update({
            openai_session_id: result.sessionId,
            openai_turn_id: result.turnId,
            model: result.model || specialist.model,
            result: result.result,
            estimated_model_cost_usd: cost.estimatedModelCostUsd,
            usage_available: cost.usageAvailable,
            status: 'completed',
            completed_at: new Date().toISOString(),
          })
          .eq('id', trace.id);
        if (completed.error) throw completed.error;

        return { ...result, ...cost };
      } catch (error) {
        const fallback = failedSpecialistResult(error?.message || error);
        await recordUsageEvent({
          supabase,
          businessId: business.id,
          agentRunId: run.id,
          specialistRunId: trace.id,
          roleKey: assignment.key,
          phase: 'specialist',
          model: specialist.model,
          sessionId: null,
          turnId: null,
          usage: null,
        });
        await supabase
          .from('specialist_runs')
          .update({
            result: fallback,
            model: specialist.model,
            usage_available: false,
            status: 'failed',
            error_message: String(error?.message || error).slice(0, 2000),
            completed_at: new Date().toISOString(),
          })
          .eq('id', trace.id);

        return {
          key: assignment.key,
          name: specialist.name,
          model: specialist.model,
          task: assignment.task,
          agentId: specialist.id,
          sessionId: null,
          usageAvailable: false,
          estimatedModelCostUsd: null,
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

    const synthesisUsage = await recordUsageEvent({
      supabase,
      businessId: business.id,
      agentRunId: run.id,
      roleKey: 'director',
      phase: 'director_synthesis',
      model: synthesis.model,
      sessionId: synthesis.sessionId,
      turnId: synthesis.turnId,
      usage: synthesis.usage,
    });

    const actionResults = await registerDirectorActions({
      supabase,
      business,
      userId: user.id,
      agentRunId: run.id,
      actions: synthesis.actions,
    });

    const knownCosts = [
      planningUsage,
      synthesisUsage,
      ...specialistResults.map((item) => ({ estimatedModelCostUsd: item.estimatedModelCostUsd })),
    ];
    const totalEstimatedModelCostUsd = sumKnownCosts(knownCosts);
    const usageComplete = planningUsage.usageAvailable &&
      synthesisUsage.usageAvailable &&
      specialistResults.every((item) => item.usageAvailable === true);

    const complete = await supabase
      .from('agent_runs')
      .update({
        result_summary: synthesis.response,
        estimated_model_cost_usd: totalEstimatedModelCostUsd,
        usage_complete: usageComplete,
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', run.id);
    if (complete.error) throw complete.error;

    res.json({
      respuesta: synthesis.response,
      threadId: thread.id,
      delegationPlan: planning.plan,
      technologyCost: {
        estimatedModelCostUsd: totalEstimatedModelCostUsd,
        usageComplete,
        pricingVersion: PRICING_VERSION,
        note: 'Costo estimado de tokens del modelo; no incluye herramientas, cache writes, sandbox, terceros, impuestos ni recargos regionales.',
      },
      actions: actionResults.map((item) => ({
        id: item.id,
        type: item.action_type,
        title: item.title,
        decision: item.policy_decision,
        status: item.status,
        requiresHuman: item.requires_human,
        reason: item.policy_reason,
        executionResult: item.execution_result || null,
        error: item.error_message || null,
      })),
      specialists: specialistResults.map((item) => ({
        key: item.key,
        name: item.name,
        model: item.model,
        task: item.task,
        confidence: item.result?.confidence || 'low',
        estimatedModelCostUsd: item.estimatedModelCostUsd ?? null,
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
