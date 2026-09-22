-- Agentic Pymes · costo tecnológico y uso de IA
-- El costo de modelo es una variable económica trazable, no un costo invisible.

alter table public.agent_runs
  add column estimated_model_cost_usd numeric(14,8),
  add column usage_complete boolean not null default false,
  add column technology_cost_class text not null default 'shared_operating'
    check (technology_cost_class in ('direct_product','direct_batch','direct_order','shared_operating','research_growth'));

alter table public.specialist_runs
  add column model text,
  add column openai_turn_id text,
  add column estimated_model_cost_usd numeric(14,8),
  add column usage_available boolean not null default false;

create table public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  agent_run_id uuid not null references public.agent_runs(id) on delete cascade,
  specialist_run_id uuid references public.specialist_runs(id) on delete cascade,
  role_key text not null,
  phase text not null check (phase in ('director_plan','specialist','director_synthesis')),
  model text not null,
  openai_session_id text,
  openai_turn_id text,
  input_tokens bigint,
  cached_input_tokens bigint,
  output_tokens bigint,
  reasoning_tokens bigint,
  total_tokens bigint,
  estimated_model_cost_usd numeric(14,8),
  usage_available boolean not null default false,
  pricing_version text not null,
  created_at timestamptz not null default now(),
  check (input_tokens is null or input_tokens >= 0),
  check (cached_input_tokens is null or cached_input_tokens >= 0),
  check (output_tokens is null or output_tokens >= 0),
  check (reasoning_tokens is null or reasoning_tokens >= 0),
  check (total_tokens is null or total_tokens >= 0),
  check (estimated_model_cost_usd is null or estimated_model_cost_usd >= 0)
);

create index ai_usage_events_business_idx on public.ai_usage_events(business_id, created_at desc);
create index ai_usage_events_agent_run_idx on public.ai_usage_events(agent_run_id, created_at);
create index ai_usage_events_specialist_run_idx on public.ai_usage_events(specialist_run_id) where specialist_run_id is not null;
create index ai_usage_events_model_idx on public.ai_usage_events(model, created_at desc);

alter table public.ai_usage_events enable row level security;

create policy ai_usage_events_owner_all on public.ai_usage_events
  for all to authenticated
  using (exists (
    select 1 from public.businesses b
    where b.id = business_id and b.owner_user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.businesses b
    where b.id = business_id and b.owner_user_id = (select auth.uid())
  ));

revoke all on public.ai_usage_events from anon;
grant select, insert, update, delete on public.ai_usage_events to authenticated;

comment on table public.ai_usage_events is 'Ledger de uso y costo estimado de modelos de IA por misión y especialista. No representa la factura final de OpenAI.';
comment on column public.agent_runs.technology_cost_class is 'Clasificación económica para atribuir costo tecnológico. La atribución a producto/lote/pedido debe ser explícita.';
