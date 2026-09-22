-- Agentic Pymes · plan de orquestación por misión

alter table public.agent_runs
  add column if not exists delegation_plan jsonb,
  add column if not exists specialist_count integer not null default 0 check (specialist_count >= 0);
