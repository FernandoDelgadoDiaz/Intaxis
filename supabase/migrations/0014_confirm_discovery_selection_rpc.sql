create or replace function public.confirm_discovery_selection(p_run_id uuid, p_candidate_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_requested_count integer;
  v_valid_count integer;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  v_requested_count := coalesce(cardinality(p_candidate_ids), 0);
  if v_requested_count < 1 or v_requested_count > 3 then
    raise exception 'Seleccioná entre 1 y 3 candidatos';
  end if;

  if v_requested_count <> (select count(distinct x) from unnest(p_candidate_ids) as x) then
    raise exception 'La selección contiene candidatos duplicados';
  end if;

  select pdr.business_id
    into v_business_id
  from public.product_discovery_runs pdr
  join public.businesses b on b.id = pdr.business_id
  where pdr.id = p_run_id
    and b.owner_user_id = auth.uid();

  if v_business_id is null then
    raise exception 'La investigación no existe o no pertenece al usuario';
  end if;

  select count(*)
    into v_valid_count
  from public.product_discovery_candidates pdc
  where pdc.business_id = v_business_id
    and pdc.discovery_run_id = p_run_id
    and pdc.id = any(p_candidate_ids);

  if v_valid_count <> v_requested_count then
    raise exception 'Hay candidatos que no pertenecen a esta investigación';
  end if;

  update public.product_discovery_candidates
     set status = case when id = any(p_candidate_ids) then 'selected' else 'rejected' end,
         updated_at = now()
   where business_id = v_business_id
     and discovery_run_id = p_run_id;

  update public.product_discovery_runs
     set status = 'approved',
         updated_at = now()
   where id = p_run_id
     and business_id = v_business_id;

  return jsonb_build_object(
    'ok', true,
    'run_id', p_run_id,
    'selected', v_requested_count,
    'candidate_ids', p_candidate_ids
  );
end;
$$;

revoke all on function public.confirm_discovery_selection(uuid, uuid[]) from public;
revoke all on function public.confirm_discovery_selection(uuid, uuid[]) from anon;
grant execute on function public.confirm_discovery_selection(uuid, uuid[]) to authenticated;
