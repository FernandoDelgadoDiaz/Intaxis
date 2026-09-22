import { Router } from 'express';
import { authenticatedUser } from '../supabase.js';
import { requireBusiness } from '../business-context.js';
import { queueOfferEnrichment } from '../offer-enrichment-queue.js';

export const offerEnrichmentRouter = Router();

offerEnrichmentRouter.post('/discovery/:id/enrich', async (req, res) => {
  const { supabase } = await authenticatedUser(req);
  const business = await requireBusiness(supabase);
  const result = await queueOfferEnrichment({
    supabase,
    business,
    discoveryRunId: req.params.id,
    retry: req.body?.retry === true,
  });
  res.status(result.alreadyCompleted || result.reused ? 200 : 202).json(result);
});
