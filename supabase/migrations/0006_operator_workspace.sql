-- Agentic Pymes · Operación v1
-- Roles reales, invitaciones y ejecución operativa sin exponer Director ni costos.

create table public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','operator')),
  display_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, user_id)
);

insert into public.business_members (business_id, user_id, role)
select id, owner_user_id, 'owner'
from public.businesses
on conflict (business_id, user_id) do update set role = 'owner', active = true;

create table public.business_invites (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  email text not null,
  role text not null default 'operator' check (role = 'operator'),
  token uuid not null default gen_random_uuid() unique,
  status text not null default 'pending' check (status in ('pending','claimed','revoked','expired')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_by uuid not null references auth.users(id) on delete restrict,
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.operation_tasks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  task_type text not null default 'production' check (task_type in ('production','preparation','delivery','quality','other')),
  title text not null,
  product_id uuid references public.products(id) on delete set null,
  product_name text,
  quantity numeric(12,3) check (quantity is null or quantity >= 0),
  unit text not null default 'unidades',
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'pending' check (status in ('pending','in_progress','blocked','completed','cancelled')),
  due_at timestamptz,
  assigned_user_id uuid references auth.users(id) on delete set null,
  instructions text,
  checklist jsonb not null default '[]'::jsonb,
  recipe_snapshot jsonb not null default '{}'::jsonb,
  inputs_snapshot jsonb not null default '[]'::jsonb,
  reported_output numeric(12,3) check (reported_output is null or reported_output >= 0),
  reported_waste numeric(12,3) check (reported_waste is null or reported_waste >= 0),
  issue_code text,
  issue_note text,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.operation_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  task_id uuid not null references public.operation_tasks(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null check (event_type in ('created','claimed','started','checklist','issue','completed','cancelled')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index business_members_user_idx on public.business_members(user_id) where active = true;
create index business_members_business_idx on public.business_members(business_id) where active = true;
create index business_invites_business_idx on public.business_invites(business_id, status);
create index operation_tasks_business_status_idx on public.operation_tasks(business_id, status, due_at);
create index operation_tasks_assignee_idx on public.operation_tasks(assigned_user_id, status);
create index operation_events_task_idx on public.operation_events(task_id, created_at);

alter table public.business_members enable row level security;
alter table public.business_invites enable row level security;
alter table public.operation_tasks enable row level security;
alter table public.operation_events enable row level security;

create or replace function public.is_business_owner(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.businesses b
    where b.id = p_business_id and b.owner_user_id = auth.uid()
  );
$$;

create or replace function public.is_active_business_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = p_business_id and m.user_id = auth.uid() and m.active = true
  );
$$;

create or replace function public.current_business_access()
returns table (business_id uuid, role text, business_name text, stage text, city text, province text, country text)
language sql
stable
security definer
set search_path = public
as $$
  select m.business_id, m.role, b.name, b.stage, b.city, b.province, b.country
  from public.business_members m
  join public.businesses b on b.id = m.business_id
  where m.user_id = auth.uid() and m.active = true
  order by case when m.role = 'owner' then 0 else 1 end, m.created_at
  limit 1;
$$;

create or replace function public.claim_business_invite(p_token uuid)
returns table (business_id uuid, role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.business_invites%rowtype;
  v_email text;
begin
  select lower(coalesce(email, '')) into v_email from auth.users where id = auth.uid();
  if v_email = '' then raise exception 'El usuario autenticado no tiene correo.'; end if;

  select * into v_invite from public.business_invites where token = p_token for update;
  if not found then raise exception 'Invitación inválida.'; end if;
  if v_invite.status <> 'pending' then raise exception 'La invitación ya no está disponible.'; end if;
  if v_invite.expires_at <= now() then
    update public.business_invites set status = 'expired' where id = v_invite.id;
    raise exception 'La invitación venció.';
  end if;
  if lower(v_invite.email) <> v_email then raise exception 'Esta invitación corresponde a otro correo.'; end if;

  insert into public.business_members (business_id, user_id, role, active)
  values (v_invite.business_id, auth.uid(), v_invite.role, true)
  on conflict (business_id, user_id) do update set role = excluded.role, active = true, updated_at = now();

  update public.business_invites set status = 'claimed', claimed_by = auth.uid(), claimed_at = now() where id = v_invite.id;
  return query select v_invite.business_id, v_invite.role;
end;
$$;

create or replace function public.operator_task_action(p_task_id uuid, p_action text, p_payload jsonb default '{}'::jsonb)
returns public.operation_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.operation_tasks%rowtype;
  v_role text;
  v_index integer;
  v_checklist jsonb;
  v_now timestamptz := now();
begin
  select * into v_task from public.operation_tasks where id = p_task_id for update;
  if not found then raise exception 'Tarea inexistente.'; end if;

  select role into v_role from public.business_members
  where business_id = v_task.business_id and user_id = auth.uid() and active = true;
  if v_role is null then raise exception 'Sin acceso a esta operación.'; end if;
  if v_role = 'operator' and v_task.assigned_user_id is not null and v_task.assigned_user_id <> auth.uid() then
    raise exception 'La tarea está asignada a otro operario.';
  end if;

  if p_action = 'claim' then
    if v_task.status <> 'pending' then raise exception 'La tarea no está disponible para tomar.'; end if;
    update public.operation_tasks set assigned_user_id = auth.uid(), updated_at = v_now where id = p_task_id returning * into v_task;
    insert into public.operation_events (business_id, task_id, actor_user_id, event_type) values (v_task.business_id, p_task_id, auth.uid(), 'claimed');

  elsif p_action = 'start' then
    if v_task.status not in ('pending','blocked') then raise exception 'La tarea no puede iniciarse en su estado actual.'; end if;
    update public.operation_tasks set assigned_user_id = coalesce(assigned_user_id, auth.uid()), status = 'in_progress', started_at = coalesce(started_at, v_now), issue_code = null, issue_note = null, updated_at = v_now where id = p_task_id returning * into v_task;
    insert into public.operation_events (business_id, task_id, actor_user_id, event_type) values (v_task.business_id, p_task_id, auth.uid(), 'started');

  elsif p_action = 'checklist' then
    if v_task.status <> 'in_progress' then raise exception 'Iniciá la tarea antes de marcar pasos.'; end if;
    v_index := (p_payload->>'index')::integer;
    v_checklist := v_task.checklist;
    if v_index < 0 or v_index >= jsonb_array_length(v_checklist) then raise exception 'Paso inválido.'; end if;
    v_checklist := jsonb_set(v_checklist, array[v_index::text, 'done'], to_jsonb(coalesce((p_payload->>'done')::boolean, false)), true);
    update public.operation_tasks set checklist = v_checklist, updated_at = v_now where id = p_task_id returning * into v_task;
    insert into public.operation_events (business_id, task_id, actor_user_id, event_type, payload) values (v_task.business_id, p_task_id, auth.uid(), 'checklist', p_payload);

  elsif p_action = 'issue' then
    update public.operation_tasks set assigned_user_id = coalesce(assigned_user_id, auth.uid()), status = 'blocked', issue_code = nullif(p_payload->>'code',''), issue_note = nullif(p_payload->>'note',''), updated_at = v_now where id = p_task_id returning * into v_task;
    insert into public.operation_events (business_id, task_id, actor_user_id, event_type, payload) values (v_task.business_id, p_task_id, auth.uid(), 'issue', p_payload);

  elsif p_action = 'complete' then
    if v_task.status <> 'in_progress' then raise exception 'La tarea debe estar en curso para finalizarla.'; end if;
    if exists (select 1 from jsonb_array_elements(v_task.checklist) x where coalesce((x->>'required')::boolean, true) and coalesce((x->>'done')::boolean, false) = false) then
      raise exception 'Faltan pasos obligatorios del checklist.';
    end if;
    update public.operation_tasks set status = 'completed', reported_output = nullif(p_payload->>'output','')::numeric, reported_waste = nullif(p_payload->>'waste','')::numeric, completed_at = v_now, updated_at = v_now where id = p_task_id returning * into v_task;
    insert into public.operation_events (business_id, task_id, actor_user_id, event_type, payload) values (v_task.business_id, p_task_id, auth.uid(), 'completed', p_payload);
  else
    raise exception 'Acción operativa desconocida.';
  end if;
  return v_task;
end;
$$;

create policy business_members_read on public.business_members
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_business_owner(business_id));
create policy business_members_owner_manage on public.business_members
  for all to authenticated
  using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));

create policy business_invites_owner_all on public.business_invites
  for all to authenticated
  using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));

create policy operation_tasks_owner_all on public.operation_tasks
  for all to authenticated
  using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));
create policy operation_tasks_operator_select on public.operation_tasks
  for select to authenticated
  using (
    exists (
      select 1 from public.business_members m
      where m.business_id = operation_tasks.business_id and m.user_id = (select auth.uid()) and m.role = 'operator' and m.active = true
    )
    and (assigned_user_id is null or assigned_user_id = (select auth.uid()))
  );

create policy operation_events_owner_select on public.operation_events
  for select to authenticated
  using (public.is_business_owner(business_id));

create policy businesses_member_select on public.businesses
  for select to authenticated
  using (public.is_active_business_member(id));

grant select on public.business_members, public.operation_tasks to authenticated;
grant select, insert, update, delete on public.business_invites to authenticated;
grant select, insert, update, delete on public.operation_tasks to authenticated;
grant select on public.operation_events to authenticated;
grant execute on function public.current_business_access() to authenticated;
grant execute on function public.claim_business_invite(uuid) to authenticated;
grant execute on function public.operator_task_action(uuid, text, jsonb) to authenticated;
revoke all on public.business_members, public.business_invites, public.operation_tasks, public.operation_events from anon;
