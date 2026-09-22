-- Agentic Pymes · Mi Negocio v1
-- Proyecto Supabase dedicado. No reutiliza tablas ni datos de otros sistemas.

create extension if not exists pgcrypto;

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  city text not null default 'Río Gallegos',
  province text not null default 'Santa Cruz',
  country text not null default 'Argentina',
  timezone text not null default 'America/Argentina/Rio_Gallegos',
  stage text not null default 'validacion' check (stage in ('concepto','validacion','producto','costeo','viabilidad','piloto','lanzamiento','seguimiento','crecimiento')),
  currency text not null default 'ARS',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, name)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft','test','active','paused','retired')),
  sell_price numeric(14,2) check (sell_price is null or sell_price >= 0),
  currency text not null default 'ARS',
  portion_grams numeric(12,3) check (portion_grams is null or portion_grams > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name),
  unique (id, business_id)
);

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  unit text not null,
  cost_per_unit numeric(14,4) check (cost_per_unit is null or cost_per_unit >= 0),
  currency text not null default 'ARS',
  cost_source text,
  cost_observed_at timestamptz,
  reorder_point numeric(14,4) check (reorder_point is null or reorder_point >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name),
  unique (id, business_id)
);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid not null,
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft','test','approved','retired')),
  yield_units numeric(12,3) not null default 1 check (yield_units > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, version),
  unique (id, business_id),
  foreign key (product_id, business_id) references public.products(id, business_id) on delete cascade
);

create table public.recipe_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  recipe_id uuid not null,
  ingredient_id uuid not null,
  quantity numeric(14,4) not null check (quantity > 0),
  waste_pct numeric(6,3) not null default 0 check (waste_pct >= 0 and waste_pct < 100),
  created_at timestamptz not null default now(),
  unique (recipe_id, ingredient_id),
  foreign key (recipe_id, business_id) references public.recipes(id, business_id) on delete cascade,
  foreign key (ingredient_id, business_id) references public.ingredients(id, business_id) on delete restrict
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  ingredient_id uuid not null,
  quantity_delta numeric(14,4) not null check (quantity_delta <> 0),
  reason text not null check (reason in ('initial','purchase','production','waste','adjustment','return')),
  note text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (ingredient_id, business_id) references public.ingredients(id, business_id) on delete restrict
);

create table public.capacity_settings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  valid_from date not null default current_date,
  daily_capacity_units integer not null check (daily_capacity_units >= 0),
  notes text,
  created_at timestamptz not null default now(),
  unique (business_id, valid_from)
);

create table public.business_decisions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title text not null,
  decision text not null,
  rationale text,
  status text not null default 'active' check (status in ('active','superseded','reversed','completed')),
  source text,
  effective_at timestamptz not null default now(),
  review_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.business_hypotheses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title text not null,
  statement text not null,
  status text not null default 'open' check (status in ('open','testing','validated','rejected','inconclusive')),
  confidence text check (confidence is null or confidence in ('low','medium','high')),
  validation_method text,
  success_criteria text,
  evidence text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agent_threads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  provider_session_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index agent_threads_one_active_per_business
  on public.agent_threads (business_id)
  where active = true;

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  thread_id uuid references public.agent_threads(id) on delete set null,
  mission text not null,
  result_summary text,
  status text not null default 'running' check (status in ('running','completed','failed','cancelled')),
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index agent_runs_one_running_per_business
  on public.agent_runs (business_id)
  where status = 'running';

create index products_business_id_idx on public.products(business_id);
create index ingredients_business_id_idx on public.ingredients(business_id);
create index recipes_business_id_idx on public.recipes(business_id);
create index recipe_items_business_id_idx on public.recipe_items(business_id);
create index inventory_movements_business_id_idx on public.inventory_movements(business_id);
create index inventory_movements_ingredient_id_idx on public.inventory_movements(ingredient_id);
create index decisions_business_id_idx on public.business_decisions(business_id);
create index hypotheses_business_id_idx on public.business_hypotheses(business_id);
create index agent_runs_business_id_idx on public.agent_runs(business_id);

alter table public.businesses enable row level security;
alter table public.products enable row level security;
alter table public.ingredients enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.capacity_settings enable row level security;
alter table public.business_decisions enable row level security;
alter table public.business_hypotheses enable row level security;
alter table public.agent_threads enable row level security;
alter table public.agent_runs enable row level security;

create policy businesses_owner_all on public.businesses
  for all to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);

create policy products_owner_all on public.products
  for all to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = (select auth.uid())))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = (select auth.uid())));

create policy ingredients_owner_all on public.ingredients
  for all to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = (select auth.uid())))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = (select auth.uid())));

create policy recipes_owner_all on public.recipes
  for all to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = (select auth.uid())))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = (select auth.uid())));

create policy recipe_items_owner_all on public.recipe_items
  for all to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = (select auth.uid())))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = (select auth.uid())));

create policy inventory_movements_owner_all on public.inventory_movements
  for all to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = (select auth.uid())))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = (select auth.uid())));

create policy capacity_settings_owner_all on public.capacity_settings
  for all to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = (select auth.uid())))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = (select auth.uid())));

create policy business_decisions_owner_all on public.business_decisions
  for all to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = (select auth.uid())))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = (select auth.uid())));

create policy business_hypotheses_owner_all on public.business_hypotheses
  for all to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = (select auth.uid())))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = (select auth.uid())));

create policy agent_threads_owner_all on public.agent_threads
  for all to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = (select auth.uid())))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = (select auth.uid())));

create policy agent_runs_owner_all on public.agent_runs
  for all to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = (select auth.uid())))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = (select auth.uid())));

revoke all on public.businesses, public.products, public.ingredients, public.recipes,
  public.recipe_items, public.inventory_movements, public.capacity_settings,
  public.business_decisions, public.business_hypotheses, public.agent_threads,
  public.agent_runs from anon;

grant select, insert, update, delete on public.businesses, public.products, public.ingredients,
  public.recipes, public.recipe_items, public.inventory_movements, public.capacity_settings,
  public.business_decisions, public.business_hypotheses, public.agent_threads,
  public.agent_runs to authenticated;
