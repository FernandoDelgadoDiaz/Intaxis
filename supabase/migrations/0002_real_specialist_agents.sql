-- Agentic Pymes · trazabilidad de especialistas reales

create table public.specialist_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  agent_run_id uuid not null references public.agent_runs(id) on delete cascade,
  specialist_key text not null,
  specialist_name text not null,
  openai_agent_id text not null,
  openai_session_id text,
  assigned_task text not null,
  result jsonb,
  status text not null default 'running' check (status in ('running','completed','failed')),
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index specialist_runs_business_idx on public.specialist_runs(business_id, started_at desc);
create index specialist_runs_agent_run_idx on public.specialist_runs(agent_run_id);
create index specialist_runs_specialist_idx on public.specialist_runs(specialist_key, started_at desc);

alter table public.specialist_runs enable row level security;

create policy specialist_runs_owner_all on public.specialist_runs
  for all to authenticated
  using (exists (
    select 1 from public.businesses b
    where b.id = business_id and b.owner_user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.businesses b
    where b.id = business_id and b.owner_user_id = (select auth.uid())
  ));

revoke all on public.specialist_runs from anon;
grant select, insert, update, delete on public.specialist_runs to authenticated;
