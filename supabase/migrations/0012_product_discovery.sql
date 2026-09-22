-- Agentic Pymes · Product Discovery
-- Estructura para investigación de mercado, evidencia, ranking de candidatos
-- y ficha técnica previa a convertir una oportunidad en producto operativo.

create table public.product_discovery_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  title text not null,
  objective text,
  status text not null default 'researching' check (status in ('researching','ready','approved','superseded','failed')),
  scope jsonb not null default '{}'::jsonb,
  executive_summary text,
  recommendation_notes text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_discovery_candidates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  discovery_run_id uuid not null references public.product_discovery_runs(id) on delete cascade,
  rank integer not null check (rank > 0),
  name text not null,
  concept text,
  presentation text,
  acceptance_score numeric(5,2) check (acceptance_score is null or (acceptance_score >= 0 and acceptance_score <= 100)),
  acceptance_band text check (acceptance_band is null or acceptance_band in ('low','medium','high')),
  trend_strength text check (trend_strength is null or trend_strength in ('low','medium','high')),
  argentina_fit text check (argentina_fit is null or argentina_fit in ('low','medium','high')),
  visual_potential text check (visual_potential is null or visual_potential in ('low','medium','high')),
  production_complexity text check (production_complexity is null or production_complexity in ('low','medium','high')),
  conservation_risk text check (conservation_risk is null or conservation_risk in ('low','medium','high')),
  cost_complexity text check (cost_complexity is null or cost_complexity in ('low','medium','high')),
  rationale text,
  image_url text,
  image_source_url text,
  status text not null default 'proposed' check (status in ('proposed','selected','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(discovery_run_id, rank)
);

create table public.product_discovery_evidence (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  discovery_run_id uuid not null references public.product_discovery_runs(id) on delete cascade,
  candidate_id uuid references public.product_discovery_candidates(id) on delete set null,
  market_scope text not null check (market_scope in ('local','national','latam','international')),
  country text,
  source_name text,
  source_url text,
  source_type text,
  evidence_type text not null check (evidence_type in ('presentation','flavor','engagement','trend','price','competitor','packaging','comment_signal','other')),
  claim text not null,
  metric_name text,
  metric_value numeric,
  metric_unit text,
  image_url text,
  observed_at timestamptz,
  confidence text not null default 'medium' check (confidence in ('low','medium','high')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.product_discovery_blueprints (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  candidate_id uuid not null unique references public.product_discovery_candidates(id) on delete cascade,
  portion_grams numeric,
  yield_units numeric,
  ingredients jsonb not null default '[]'::jsonb,
  instructions jsonb not null default '[]'::jsonb,
  conservation jsonb not null default '{}'::jsonb,
  allergens jsonb not null default '[]'::jsonb,
  packaging jsonb not null default '{}'::jsonb,
  quality_notes text,
  approval_status text not null default 'draft' check (approval_status in ('draft','review','approved','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index product_discovery_runs_business_idx on public.product_discovery_runs(business_id, created_at desc);
create index product_discovery_candidates_run_idx on public.product_discovery_candidates(discovery_run_id, rank);
create index product_discovery_evidence_run_idx on public.product_discovery_evidence(discovery_run_id, market_scope);
create index product_discovery_evidence_candidate_idx on public.product_discovery_evidence(candidate_id);

alter table public.product_discovery_runs enable row level security;
alter table public.product_discovery_candidates enable row level security;
alter table public.product_discovery_evidence enable row level security;
alter table public.product_discovery_blueprints enable row level security;

create policy product_discovery_runs_owner_all on public.product_discovery_runs
  for all to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = (select auth.uid())))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = (select auth.uid())));

create policy product_discovery_candidates_owner_all on public.product_discovery_candidates
  for all to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = (select auth.uid())))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = (select auth.uid())));

create policy product_discovery_evidence_owner_all on public.product_discovery_evidence
  for all to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = (select auth.uid())))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = (select auth.uid())));

create policy product_discovery_blueprints_owner_all on public.product_discovery_blueprints
  for all to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = (select auth.uid())))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = (select auth.uid())));

revoke all on public.product_discovery_runs, public.product_discovery_candidates,
  public.product_discovery_evidence, public.product_discovery_blueprints from anon;

grant select, insert, update, delete on public.product_discovery_runs, public.product_discovery_candidates,
  public.product_discovery_evidence, public.product_discovery_blueprints to authenticated;
