import { authenticatedUser } from '../../src/supabase.js';
import { requireBusiness } from '../../src/business-context.js';
import { processSelectedOpportunityDevelopment } from '../../src/opportunity-development.js';

function bodyFromEvent(event) {
  const raw = event?.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : String(event?.body || '');
  return raw ? JSON.parse(raw) : {};
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
  } catch (error) {
    console.error('opportunity-development-background failed', {
      discoveryRunId,
      agentRunId,
      message: error?.message || String(error),
    });
  }
};
