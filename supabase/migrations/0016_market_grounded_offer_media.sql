-- Agentic Pymes · oportunidades seleccionadas -> Mi Negocio + estrategia visual trazable
-- El modelo es genérico: una oportunidad seleccionada pasa a ser una oferta en desarrollo.

alter table public.products
  add column if not exists source_discovery_candidate_id uuid references public.product_discovery_candidates(id) on delete set null,
  add column if not exists origin text not null default 'manual'
    check (origin in ('manual','discovery')),
  add column if not exists development_phase text not null default 'manual'
    check (development_phase in ('manual','in_development','needs_data','ready_for_pilot','validated')),
  add column if not exists visual_strategy jsonb not null default '{}'::jsonb,
  add column if not exists reference_media jsonb not null default '[]'::jsonb,
  add column if not exists aspirational_media jsonb not null default '{}'::jsonb,
  add column if not exists primary_media jsonb not null default '{}'::jsonb;

create unique index if not exists products_source_discovery_candidate_uq
  on public.products(business_id, source_discovery_candidate_id)
  where source_discovery_candidate_id is not null;

alter table public.product_discovery_blueprints
  add column if not exists human_instructions jsonb not null default '[]'::jsonb,
  add column if not exists visual_strategy jsonb not null default '{}'::jsonb,
  add column if not exists reference_media jsonb not null default '[]'::jsonb,
  add column if not exists aspirational_media jsonb not null default '{}'::jsonb;

alter table public.product_discovery_runs
  add column if not exists enrichment_status text not null default 'not_started'
    check (enrichment_status in ('not_started','pending','queued','running','completed','partial','failed')),
  add column if not exists enrichment_stage text not null default 'awaiting_technical_definition',
  add column if not exists enrichment_agent_run_id uuid references public.agent_runs(id) on delete set null,
  add column if not exists enrichment_started_at timestamptz,
  add column if not exists enrichment_completed_at timestamptz,
  add column if not exists enrichment_error_message text;

update public.product_discovery_runs
set enrichment_status = 'pending',
    enrichment_stage = 'selected_offer_enrichment'
where status = 'approved'
  and development_status in ('completed','partial')
  and enrichment_status = 'not_started';

create index if not exists product_discovery_runs_enrichment_idx
  on public.product_discovery_runs(business_id, enrichment_status, updated_at desc);

comment on column public.products.source_discovery_candidate_id is
'Oportunidad de Descubrimiento que originó esta oferta de Mi Negocio.';
comment on column public.products.development_phase is
'Estado de desarrollo de la oferta, separado de su estado comercial.';
comment on column public.products.visual_strategy is
'Razonamiento visual/comercial trazable que fundamenta la presentación recomendada.';
comment on column public.products.reference_media is
'Referencias de mercado con fuente; no son imágenes propias del negocio.';
comment on column public.products.aspirational_media is
'Representación aspiracional generada a partir de una estrategia visual fundamentada.';
comment on column public.products.primary_media is
'Imagen o medio real principal de la oferta; reemplaza visualmente a la aspiracional cuando existe.';
comment on column public.product_discovery_blueprints.human_instructions is
'Instrucciones humanas, conversacionales y simples derivadas de la definición técnica sin reemplazarla.';
comment on column public.product_discovery_runs.enrichment_status is
'Estado del enriquecimiento posterior al desarrollo técnico: referencias, estrategia visual, imagen aspiracional y capa humana.';

-- Los candidatos ya aprobados pasan a Mi Negocio como ofertas en desarrollo.
insert into public.products (
  business_id,
  name,
  description,
  status,
  portion_grams,
  source_discovery_candidate_id,
  origin,
  development_phase,
  visual_strategy,
  reference_media,
  aspirational_media
)
select
  c.business_id,
  c.name,
  coalesce(nullif(b.offer_definition->>'summary',''), c.concept, c.presentation),
  'draft',
  b.portion_grams,
  c.id,
  'discovery',
  case when b.development_status = 'needs_data' then 'needs_data' else 'in_development' end,
  coalesce(b.visual_strategy, '{}'::jsonb),
  coalesce(b.reference_media, '[]'::jsonb),
  coalesce(b.aspirational_media, '{}'::jsonb)
from public.product_discovery_candidates c
join public.product_discovery_runs r on r.id = c.discovery_run_id and r.business_id = c.business_id
left join public.product_discovery_blueprints b on b.candidate_id = c.id and b.business_id = c.business_id
where c.status = 'selected'
  and r.status = 'approved'
on conflict (business_id, name) do update
set source_discovery_candidate_id = coalesce(public.products.source_discovery_candidate_id, excluded.source_discovery_candidate_id),
    origin = case when public.products.origin = 'manual' and public.products.source_discovery_candidate_id is null then excluded.origin else public.products.origin end,
    development_phase = excluded.development_phase,
    description = coalesce(public.products.description, excluded.description),
    portion_grams = coalesce(public.products.portion_grams, excluded.portion_grams),
    visual_strategy = case when public.products.visual_strategy = '{}'::jsonb then excluded.visual_strategy else public.products.visual_strategy end,
    reference_media = case when public.products.reference_media = '[]'::jsonb then excluded.reference_media else public.products.reference_media end,
    aspirational_media = case when public.products.aspirational_media = '{}'::jsonb then excluded.aspirational_media else public.products.aspirational_media end,
    updated_at = now();

-- Medios de oferta. Público porque estas imágenes están destinadas a presentación comercial;
-- la escritura queda limitada al propietario de la PyME indicada por el primer segmento de la ruta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'business-offer-media',
  'business-offer-media',
  true,
  10485760,
  array['image/png','image/jpeg','image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists business_offer_media_owner_insert on storage.objects;
create policy business_offer_media_owner_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'business-offer-media'
  and exists (
    select 1 from public.businesses b
    where b.id::text = (storage.foldername(name))[1]
      and b.owner_user_id = (select auth.uid())
  )
);

drop policy if exists business_offer_media_owner_update on storage.objects;
create policy business_offer_media_owner_update on storage.objects
for update to authenticated
using (
  bucket_id = 'business-offer-media'
  and exists (
    select 1 from public.businesses b
    where b.id::text = (storage.foldername(name))[1]
      and b.owner_user_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'business-offer-media'
  and exists (
    select 1 from public.businesses b
    where b.id::text = (storage.foldername(name))[1]
      and b.owner_user_id = (select auth.uid())
  )
);

drop policy if exists business_offer_media_owner_delete on storage.objects;
create policy business_offer_media_owner_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'business-offer-media'
  and exists (
    select 1 from public.businesses b
    where b.id::text = (storage.foldername(name))[1]
      and b.owner_user_id = (select auth.uid())
  )
);