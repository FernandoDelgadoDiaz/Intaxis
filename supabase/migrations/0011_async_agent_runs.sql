-- Agentic Pymes · async Agent runs
-- A mission is queued synchronously, processed by a Netlify background function,
-- and recovered from Supabase by the UI.

alter table public.agent_runs
  drop constraint if exists agent_runs_status_check;

alter table public.agent_runs
  add constraint agent_runs_status_check
  check (status in ('queued','running','completed','failed','cancelled'));

drop index if exists public.agent_runs_one_running_per_business;

create unique index agent_runs_one_active_per_business
  on public.agent_runs (business_id)
  where status in ('queued','running');
