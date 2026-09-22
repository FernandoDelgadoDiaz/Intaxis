create table if not exists public.business_profiles (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  industry text,
  business_model text,
  offer_mode text not null default 'mixed' check (offer_mode in ('product','service','mixed')),
  target_market jsonb not null default '{}'::jsonb,
  discovery_context jsonb not null default '{}'::jsonb,
  operational_context jsonb not null default '{}'::jsonb,
  terminology jsonb not null default '{}'::jsonb,
  vertical_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.business_profiles enable row level security;

revoke all on table public.business_profiles from anon;
grant select, insert, update, delete on table public.business_profiles to authenticated;

drop policy if exists business_profiles_owner_all on public.business_profiles;
create policy business_profiles_owner_all
on public.business_profiles
for all
to authenticated
using (
  exists (
    select 1
    from public.businesses b
    where b.id = business_profiles.business_id
      and b.owner_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.businesses b
    where b.id = business_profiles.business_id
      and b.owner_user_id = (select auth.uid())
  )
);

comment on table public.business_profiles is
'Perfil parametrizable del negocio. El core de Agentic Pymes permanece agnóstico al rubro; vertical_config y los contextos especializan cada PyME sin cambiar la arquitectura base.';
