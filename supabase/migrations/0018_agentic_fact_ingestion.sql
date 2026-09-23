-- Agentic Pymes · Ingreso agentic de hechos reales
-- Objetivo: que el propietario aporte hechos del mundo físico y el sistema los persista
-- de forma auditable, idempotente y sin convertir hipótesis en hechos.

alter table public.inventory_movements
  add column if not exists source_action_request_id uuid references public.agent_action_requests(id) on delete set null;

create unique index if not exists inventory_movements_action_ingredient_uq
  on public.inventory_movements(source_action_request_id, ingredient_id)
  where source_action_request_id is not null;

alter table public.recipes
  add column if not exists source_action_request_id uuid references public.agent_action_requests(id) on delete set null,
  add column if not exists source_blueprint_id uuid references public.product_discovery_blueprints(id) on delete set null;

create unique index if not exists recipes_source_action_request_uq
  on public.recipes(source_action_request_id)
  where source_action_request_id is not null;

create unique index if not exists recipes_product_blueprint_uq
  on public.recipes(business_id, product_id, source_blueprint_id)
  where source_blueprint_id is not null;

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
    (p_business_id, 'record_business_inputs', 'autonomous', 0.90, null, '{"explicit_owner_fact":true,"external_side_effect":false}'::jsonb),
    (p_business_id, 'materialize_development_recipe', 'autonomous', 0.90, null, '{"existing_blueprint_required":true,"draft_only":true,"external_side_effect":false}'::jsonb),
    (p_business_id, 'reply_customer_routine', 'approval', 0.90, null, '{"until_channel_playbook_validated":true}'::jsonb),
    (p_business_id, 'create_order', 'approval', 0.90, null, '{"requires_price":true,"requires_capacity":true}'::jsonb),
    (p_business_id, 'create_payment_link', 'approval', 0.95, null, '{"requires_order":true}'::jsonb),
    (p_business_id, 'publish_content', 'approval', 0.90, null, '{"organic_only":true}'::jsonb),
    (p_business_id, 'paid_ad_spend', 'blocked', 0.95, 0, '{"requires_explicit_budget_policy":true}'::jsonb)
  on conflict (business_id, action_type) do nothing;
end;
$$;

select public.seed_autonomy_policies(id) from public.businesses;

revoke all on function public.seed_autonomy_policies(uuid) from public;
revoke all on function public.seed_autonomy_policies(uuid) from anon;
revoke all on function public.seed_autonomy_policies(uuid) from authenticated;
