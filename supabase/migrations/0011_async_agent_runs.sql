-- Agentic Pymes · async Agent runs
-- A mission is queued synchronously, processed by a Netlify background function,
-- and recovered from Supabase by the UI.

-- Recover executions abandoned by the old synchronous serverless path.
update public.agent_runs
set status = 'failed',
    error_message = coalesce(error_message, 'La ejecución síncrona fue interrumpida por el límite de tiempo de la función. Reintentá con el flujo en background.'),
    completed_at = coalesce(completed_at, now())
where status = 'running'
  and completed_at is null
  and started_at < now() - interval '2 minutes';

alter table public.agent_runs
  drop constraint if exists agent_runs_status_check;

alter table public.agent_runs
  add constraint agent_runs_status_check
  check (status in ('queued','running','completed','failed','cancelled'));

drop index if exists public.agent_runs_one_running_per_business;

create unique index agent_runs_one_active_per_business
  on public.agent_runs (business_id)
  where status in ('queued','running');
