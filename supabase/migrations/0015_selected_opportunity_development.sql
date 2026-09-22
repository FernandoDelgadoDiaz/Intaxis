-- Agentic Pymes · desarrollo técnico de oportunidades seleccionadas
-- El núcleo permanece agnóstico al rubro. Los campos existentes de receta/conservación
-- siguen disponibles para verticales de alimentos, mientras estos campos modelan cualquier PyME.

alter table public.product_discovery_runs
  add column if not exists development_status text not null default 'not_started'
    check (development_status in ('not_started','pending','queued','running','completed','partial','failed')),
  add column if not exists development_stage text not null default 'awaiting_selection',
  add column if not exists development_agent_run_id uuid references public.agent_runs(id) on delete set null,
  add column if not exists development_started_at timestamptz,
  add column if not exists development_completed_at timestamptz,
  add column if not exists development_error_message text;

update public.product_discovery_runs
set development_status = 'pending',
    development_stage = 'selected'
where status = 'approved'
  and development_status = 'not_started';

create index if not exists product_discovery_runs_development_idx
  on public.product_discovery_runs(business_id, development_status, updated_at desc);

alter table public.product_discovery_blueprints
  add column if not exists offer_definition jsonb not null default '{}'::jsonb,
  add column if not exists resources jsonb not null default '[]'::jsonb,
  add column if not exists process_steps jsonb not null default '[]'::jsonb,
  add column if not exists operating_conditions jsonb not null default '{}'::jsonb,
  add column if not exists quality_controls jsonb not null default '[]'::jsonb,
  add column if not exists costing jsonb not null default '{}'::jsonb,
  add column if not exists specialist_reviews jsonb not null default '{}'::jsonb,
  add column if not exists source_agent_run_id uuid references public.agent_runs(id) on delete set null,
  add column if not exists development_status text not null default 'draft'
    check (development_status in ('draft','review','ready','needs_data'));

create index if not exists product_discovery_blueprints_source_run_idx
  on public.product_discovery_blueprints(source_agent_run_id)
  where source_agent_run_id is not null;

comment on column public.product_discovery_runs.development_status is
'Estado del flujo interno que transforma oportunidades seleccionadas en definiciones operativas comparables.';
comment on column public.product_discovery_runs.development_stage is
'Etapa observable del flujo: selected, product_design, production_review, quality_review, persisting, completed o error.';
comment on column public.product_discovery_blueprints.offer_definition is
'Definición genérica de la oferta. El vertical puede especializarla como producto, servicio, proyecto u otra unidad comercial.';
comment on column public.product_discovery_blueprints.resources is
'Recursos o componentes requeridos por la oferta; no presupone ingredientes ni inventario físico.';
comment on column public.product_discovery_blueprints.process_steps is
'Pasos operativos genéricos para entregar la oferta. En alimentos puede reflejar preparación y armado.';
comment on column public.product_discovery_blueprints.costing is
'Estado de costeo y datos faltantes. Nunca debe completar costos ausentes con estimaciones no trazables.';
