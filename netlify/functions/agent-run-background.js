import { authenticatedUser } from '../../src/supabase.js';
import { requireBusiness } from '../../src/business-context.js';
import { processQueuedAgentRun } from '../../src/routes/chat.js';

function bodyFromEvent(event) {
  const raw = event?.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : String(event?.body || '');
  return raw ? JSON.parse(raw) : {};
}

export const handler = async (event) => {
  let runId = null;
  try {
    const payload = bodyFromEvent(event);
    runId = String(payload?.runId || '').trim();
    if (!runId) throw new Error('Falta runId.');

    const authorization = event?.headers?.authorization || event?.headers?.Authorization || '';
    const req = { headers: { authorization } };
    const { supabase, user } = await authenticatedUser(req);
    const business = await requireBusiness(supabase);

    await processQueuedAgentRun({ supabase, user, business, runId });
  } catch (error) {
    console.error('agent-run-background failed', { runId, message: error?.message || String(error) });
  }
};
