import { authenticatedUser } from '../../src/supabase.js';
import { requireBusiness } from '../../src/business-context.js';
import { processSelectedOpportunityDevelopment } from '../../src/opportunity-development.js';
import { queueOfferEnrichment } from '../../src/offer-enrichment-queue.js';

function bodyFromEvent(event) {
  const raw = event?.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : String(event?.body || '');
  return raw ? JSON.parse(raw) : {};
}

function requestOrigin(event) {
  const rawUrl = String(event?.rawUrl || '').trim();
  if (/^https:\/\//i.test(rawUrl)) return new URL(rawUrl).origin;
  const host = event?.headers?.host || event?.headers?.Host;
  const protocol = event?.headers?.['x-forwarded-proto'] || event?.headers?.['X-Forwarded-Proto'] || 'https';
  return host ? `${protocol}://${host}` : null;
}

async function handoffToEnrichment({ event, authorization, supabase, business, discoveryRunId }) {
  const queued = await queueOfferEnrichment({
    supabase,
    business,
    discoveryRunId,
    retry: false,
  });

  const shouldDispatch = queued.agentRunId
    && !queued.alreadyCompleted
    && (!queued.reused || queued.agentRunStatus === 'queued');
  if (!shouldDispatch) return queued;

  const origin = requestOrigin(event);
  if (!origin) throw new Error('No se pudo determinar el origen para lanzar el enriquecimiento.');
  const response = await fetch(`${origin}/.netlify/functions/offer-enrichment-background`, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ discoveryRunId, agentRunId: queued.agentRunId }),
  });
  if (!response.ok) throw new Error(`El background de enriquecimiento respondió ${response.status}.`);
  return queued;
}

export const handler = async (event) => {
  let discoveryRunId = null;
  let agentRunId = null;
  try {
    const payload = bodyFromEvent(event);
    discoveryRunId = String(payload?.discoveryRunId || '').trim();
    agentRunId = String(payload?.agentRunId || '').trim();
    if (!discoveryRunId || !agentRunId) throw new Error('Faltan discoveryRunId o agentRunId.');

    const authorization = event?.headers?.authorization || event?.headers?.Authorization || '';
    const req = { headers: { authorization } };
    const { supabase } = await authenticatedUser(req);
    const business = await requireBusiness(supabase);

    await processSelectedOpportunityDevelopment({
      supabase,
      business,
      discoveryRunId,
      agentRunId,
    });

    try {
      await handoffToEnrichment({ event, authorization, supabase, business, discoveryRunId });
    } catch (handoffError) {
      const message = String(handoffError?.message || handoffError).slice(0, 1200);
      console.error('opportunity-development enrichment handoff failed', { discoveryRunId, message });
      await supabase.from('product_discovery_runs').update({
        enrichment_error_message: `No se pudo iniciar automáticamente el enriquecimiento: ${message}`,
        updated_at: new Date().toISOString(),
      }).eq('business_id', business.id).eq('id', discoveryRunId).then(() => {}).catch(() => {});
    }
  } catch (error) {
    console.error('opportunity-development-background failed', {
      discoveryRunId,
      agentRunId,
      message: error?.message || String(error),
    });
  }
};
