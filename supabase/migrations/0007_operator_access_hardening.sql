-- Agentic Pymes · Operación v1 hardening
-- Los operarios reciben datos básicos del negocio sólo mediante current_business_access().
-- Las rutas de propietario conservan la semántica owner-only existente.

drop policy if exists businesses_member_select on public.businesses;

create or replace function public.ensure_owner_business_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.business_members (business_id, user_id, role, active)
  values (new.id, new.owner_user_id, 'owner', true)
  on conflict (business_id, user_id)
  do update set role = 'owner', active = true, updated_at = now();
  return new;
end;
$$;

drop trigger if exists businesses_owner_membership_trg on public.businesses;
create trigger businesses_owner_membership_trg
after insert on public.businesses
for each row execute function public.ensure_owner_business_membership();

revoke all on function public.is_business_owner(uuid) from public;
revoke all on function public.is_active_business_member(uuid) from public;
grant execute on function public.is_business_owner(uuid) to authenticated;
grant execute on function public.is_active_business_member(uuid) to authenticated;
