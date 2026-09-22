-- Agentic Pymes · Autonomy core security hardening
-- Policy seeding is internal (migration + trigger), never a client capability.

revoke all on function public.seed_autonomy_policies(uuid) from public;
revoke all on function public.seed_autonomy_policies(uuid) from anon;
revoke all on function public.seed_autonomy_policies(uuid) from authenticated;
revoke all on function public.seed_autonomy_policies_on_business() from public;
revoke all on function public.seed_autonomy_policies_on_business() from anon;
revoke all on function public.seed_autonomy_policies_on_business() from authenticated;
