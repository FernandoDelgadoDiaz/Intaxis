-- Agentic Pymes · Operación v1 audit hardening

revoke all on function public.current_business_access() from public;
revoke all on function public.claim_business_invite(uuid) from public;
revoke all on function public.operator_task_action(uuid, text, jsonb) from public;
grant execute on function public.current_business_access() to authenticated;
grant execute on function public.claim_business_invite(uuid) to authenticated;
grant execute on function public.operator_task_action(uuid, text, jsonb) to authenticated;

create policy operation_events_owner_insert on public.operation_events
  for insert to authenticated
  with check (public.is_business_owner(business_id) and actor_user_id = (select auth.uid()));

grant insert on public.operation_events to authenticated;
