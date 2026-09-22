-- Agentic Pymes · Autonomy + Omnichannel Commerce Core v1
-- Backbone: event -> agent decision -> policy -> action -> outcome -> learning.
-- External provider secrets are intentionally NOT stored here.

create table public.business_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  event_type text not null,
  source text not null,
  external_id text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new','processing','processed','failed','ignored')),
  occurred_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index business_events_external_unique
  on public.business_events(business_id, source, external_id)
  where external_id is not null;
create index business_events_queue_idx on public.business_events(business_id, status, occurred_at);

create table public.autonomy_policies (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  action_type text not null,
  mode text not null check (mode in ('autonomous','approval','blocked')),
  min_confidence numeric(5,4) not null default 0.85 check (min_confidence >= 0 and min_confidence <= 1),
  max_amount_ars numeric(14,2) check (max_amount_ars is null or max_amount_ars >= 0),
  conditions jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, action_type)
);

create table public.agent_action_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  specialist_key text,
  action_type text not null,
  title text not null,
  rationale text,
  confidence numeric(5,4) not null default 0 check (confidence >= 0 and confidence <= 1),
  risk_level text not null default 'medium' check (risk_level in ('low','medium','high','critical')),
  payload jsonb not null default '{}'::jsonb,
  estimated_amount_ars numeric(14,2) check (estimated_amount_ars is null or estimated_amount_ars >= 0),
  policy_id uuid references public.autonomy_policies(id) on delete set null,
  policy_decision text not null default 'pending' check (policy_decision in ('pending','autonomous','approval_required','blocked')),
  policy_reason text,
  status text not null default 'proposed' check (status in ('proposed','awaiting_approval','authorized','executing','completed','failed','blocked','cancelled')),
  requires_human boolean not null default true,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  execution_started_at timestamptz,
  completed_at timestamptz,
  execution_result jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index agent_action_requests_queue_idx on public.agent_action_requests(business_id, status, created_at);
create index agent_action_requests_run_idx on public.agent_action_requests(agent_run_id);

alter table public.operation_tasks
  add column source_action_request_id uuid references public.agent_action_requests(id) on delete set null,
  add column created_source text not null default 'manual' check (created_source in ('manual','agent','event'));
create index operation_tasks_action_source_idx on public.operation_tasks(source_action_request_id) where source_action_request_id is not null;

-- Canonical channel layer. Each provider adapter maps into this common model.
create table public.channel_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  provider text not null check (provider in ('whatsapp','instagram','facebook','tiktok','web')),
  external_account_id text,
  display_name text,
  status text not null default 'disconnected' check (status in ('disconnected','pending','connected','degraded','revoked')),
  capabilities jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  connected_at timestamptz,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, provider, external_account_id)
);

create table public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  display_name text,
  phone text,
  email text,
  status text not null default 'lead' check (status in ('lead','customer','inactive','blocked')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customer_contacts_business_idx on public.customer_contacts(business_id, last_seen_at desc);

create table public.channel_identities (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  contact_id uuid not null references public.customer_contacts(id) on delete cascade,
  provider text not null check (provider in ('whatsapp','instagram','facebook','tiktok','web')),
  external_user_id text not null,
  handle text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, provider, external_user_id)
);

create table public.channel_conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  contact_id uuid references public.customer_contacts(id) on delete set null,
  provider text not null check (provider in ('whatsapp','instagram','facebook','tiktok','web')),
  external_conversation_id text,
  status text not null default 'open' check (status in ('open','waiting_customer','waiting_business','converted','closed')),
  commercial_stage text not null default 'interest' check (commercial_stage in ('interest','qualified','quoted','reserved','order_created','payment_pending','paid','lost')),
  assigned_agent_key text not null default 'sales_customers',
  last_message_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index channel_conversations_active_idx on public.channel_conversations(business_id, status, last_message_at desc);

create table public.channel_messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  conversation_id uuid not null references public.channel_conversations(id) on delete cascade,
  provider text not null check (provider in ('whatsapp','instagram','facebook','tiktok','web')),
  external_message_id text,
  direction text not null check (direction in ('inbound','outbound')),
  sender_type text not null check (sender_type in ('customer','agent','human','system')),
  message_type text not null default 'text' check (message_type in ('text','image','video','audio','document','reaction','comment','other')),
  body text,
  status text not null default 'received' check (status in ('received','queued','sent','delivered','read','failed')),
  raw_payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index channel_messages_external_unique on public.channel_messages(business_id, provider, external_message_id) where external_message_id is not null;
create index channel_messages_conversation_idx on public.channel_messages(conversation_id, created_at);

create table public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  objective text not null,
  hypothesis text,
  status text not null default 'draft' check (status in ('draft','planned','active','paused','completed','cancelled')),
  budget_ars numeric(14,2) check (budget_ars is null or budget_ars >= 0),
  started_at timestamptz,
  ended_at timestamptz,
  success_criteria jsonb not null default '{}'::jsonb,
  created_by_agent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  provider text not null check (provider in ('instagram','facebook','tiktok','whatsapp','web')),
  content_type text not null check (content_type in ('post','reel','story','video','message','ad','other')),
  status text not null default 'draft' check (status in ('idea','draft','approved','scheduled','published','failed','archived')),
  concept text,
  hook text,
  body text,
  call_to_action text,
  hypothesis text,
  external_content_id text,
  scheduled_at timestamptz,
  published_at timestamptz,
  source_action_request_id uuid references public.agent_action_requests(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_items_campaign_idx on public.content_items(campaign_id, published_at);

create table public.content_metrics (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  observed_at timestamptz not null default now(),
  impressions bigint,
  reach bigint,
  views bigint,
  watch_seconds numeric(16,2),
  interactions bigint,
  comments bigint,
  shares bigint,
  saves bigint,
  clicks bigint,
  conversations_started bigint,
  raw_metrics jsonb not null default '{}'::jsonb
);
create index content_metrics_item_idx on public.content_metrics(content_item_id, observed_at desc);

create table public.trend_signals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  horizon text not null check (horizon in ('now','next','radar')),
  geography text not null,
  source_type text not null check (source_type in ('competitor','platform','creator','market','internal')),
  source_name text,
  signal text not null,
  why_it_matters text,
  commercial_relevance numeric(5,4) check (commercial_relevance is null or (commercial_relevance >= 0 and commercial_relevance <= 1)),
  confidence numeric(5,4) not null default 0.5 check (confidence >= 0 and confidence <= 1),
  evidence jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active','testing','adopted','rejected','expired')),
  detected_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index trend_signals_radar_idx on public.trend_signals(business_id, horizon, status, detected_at desc);

create table public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  contact_id uuid references public.customer_contacts(id) on delete set null,
  conversation_id uuid references public.channel_conversations(id) on delete set null,
  source_provider text,
  status text not null default 'draft' check (status in ('draft','quoted','reserved','payment_pending','paid','production','ready','delivered','cancelled','refunded')),
  requested_for timestamptz,
  fulfillment_type text check (fulfillment_type is null or fulfillment_type in ('pickup','delivery')),
  fulfillment_address text,
  subtotal_ars numeric(14,2) not null default 0 check (subtotal_ars >= 0),
  delivery_ars numeric(14,2) not null default 0 check (delivery_ars >= 0),
  total_ars numeric(14,2) not null default 0 check (total_ars >= 0),
  notes text,
  source_action_request_id uuid references public.agent_action_requests(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sales_orders_pipeline_idx on public.sales_orders(business_id, status, requested_for);

create table public.sales_order_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid not null references public.sales_orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price_ars numeric(14,2) not null check (unit_price_ars >= 0),
  line_total_ars numeric(14,2) not null check (line_total_ars >= 0),
  created_at timestamptz not null default now()
);
create index sales_order_items_order_idx on public.sales_order_items(order_id);

create table public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid not null references public.sales_orders(id) on delete cascade,
  provider text not null,
  external_payment_id text,
  amount_ars numeric(14,2) not null check (amount_ars >= 0),
  status text not null default 'pending' check (status in ('pending','authorized','paid','failed','expired','refunded')),
  checkout_url text,
  paid_at timestamptz,
  raw_status jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payment_intents_order_idx on public.payment_intents(order_id, status);

create table public.attribution_touchpoints (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  contact_id uuid references public.customer_contacts(id) on delete set null,
  order_id uuid references public.sales_orders(id) on delete set null,
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  content_item_id uuid references public.content_items(id) on delete set null,
  conversation_id uuid references public.channel_conversations(id) on delete set null,
  provider text not null,
  touch_type text not null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index attribution_order_idx on public.attribution_touchpoints(order_id, occurred_at);
create index attribution_contact_idx on public.attribution_touchpoints(contact_id, occurred_at);

-- Conservative defaults: autonomy is earned by reliable data + policies.
create or replace function public.seed_autonomy_policies(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.autonomy_policies (business_id, action_type, mode, min_confidence, max_amount_ars, conditions)
  values
    (p_business_id, 'market_research', 'autonomous', 0.70, null, '{"external_side_effect":false}'::jsonb),
    (p_business_id, 'create_content_draft', 'autonomous', 0.75, null, '{"external_side_effect":false}'::jsonb),
    (p_business_id, 'create_operation_task', 'autonomous', 0.85, null, '{"requires_capacity":true,"requires_stock":true,"requires_recipe":true}'::jsonb),
    (p_business_id, 'reply_customer_routine', 'approval', 0.90, null, '{"until_channel_playbook_validated":true}'::jsonb),
    (p_business_id, 'create_order', 'approval', 0.90, null, '{"requires_price":true,"requires_capacity":true}'::jsonb),
    (p_business_id, 'create_payment_link', 'approval', 0.95, null, '{"requires_order":true}'::jsonb),
    (p_business_id, 'publish_content', 'approval', 0.90, null, '{"organic_only":true}'::jsonb),
    (p_business_id, 'paid_ad_spend', 'blocked', 0.95, 0, '{"requires_explicit_budget_policy":true}'::jsonb)
  on conflict (business_id, action_type) do nothing;
end;
$$;

select public.seed_autonomy_policies(id) from public.businesses;

create or replace function public.seed_autonomy_policies_on_business()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_autonomy_policies(new.id);
  return new;
end;
$$;

drop trigger if exists businesses_autonomy_policies_trg on public.businesses;
create trigger businesses_autonomy_policies_trg
after insert on public.businesses
for each row execute function public.seed_autonomy_policies_on_business();

-- RLS: customer/channel/finance/control-plane data are owner-only in v1.
-- Service-role provider adapters bypass RLS server-side; operators do not see this data.
do $$
declare t text;
begin
  foreach t in array array[
    'business_events','autonomy_policies','agent_action_requests','channel_connections',
    'customer_contacts','channel_identities','channel_conversations','channel_messages',
    'marketing_campaigns','content_items','content_metrics','trend_signals','sales_orders',
    'sales_order_items','payment_intents','attribution_touchpoints'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id))',
      t || '_owner_all', t
    );
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

revoke all on function public.seed_autonomy_policies(uuid) from public;
revoke all on function public.seed_autonomy_policies_on_business() from public;
grant execute on function public.seed_autonomy_policies(uuid) to authenticated;
