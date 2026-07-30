create table if not exists public.inventory_operation_employee_allocations (
  id uuid primary key default gen_random_uuid(),
  issue_operation_id uuid not null
    references public.inventory_operations(id) on delete cascade,
  employee_id uuid not null
    references public.employees(id) on delete restrict,
  employee_name_snapshot text not null,
  allocated_quantity numeric null,
  returned_quantity numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_operation_employee_allocations_unique
    unique (issue_operation_id, employee_id),
  constraint inventory_operation_employee_allocations_allocated_nonnegative
    check (allocated_quantity is null or allocated_quantity >= 0),
  constraint inventory_operation_employee_allocations_returned_nonnegative
    check (returned_quantity >= 0),
  constraint inventory_operation_employee_allocations_return_not_above_allocation
    check (allocated_quantity is null or returned_quantity <= allocated_quantity)
);

create index if not exists inventory_operation_employee_allocations_employee_idx
  on public.inventory_operation_employee_allocations(employee_id, issue_operation_id);
create index if not exists inventory_operation_employee_allocations_issue_idx
  on public.inventory_operation_employee_allocations(issue_operation_id);

alter table public.inventory_operation_employee_allocations enable row level security;

create policy "anon can read issue employee allocations"
  on public.inventory_operation_employee_allocations
  for select to anon using (true);
create policy "authenticated can read issue employee allocations"
  on public.inventory_operation_employee_allocations
  for select to authenticated using (true);

grant select on public.inventory_operation_employee_allocations to anon, authenticated;

drop function if exists public.apply_inventory_operation_with_party_rpc(
  text, uuid, text, numeric, date, text, text, text, uuid, uuid,
  text, text, text, text, text, text
);

create function public.apply_inventory_operation_with_party_rpc(
  p_table_name text,
  p_item_id uuid,
  p_operation_type text,
  p_quantity numeric,
  p_operation_date date default current_date,
  p_project_name text default null,
  p_category_name text default null,
  p_item_name text default null,
  p_employee_id uuid default null,
  p_supplier_id uuid default null,
  p_received_by text default null,
  p_purchase_order_number text default null,
  p_item_code text default null,
  p_notes text default null,
  p_created_by text default 'user',
  p_request_id text default null,
  p_employee_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_ids uuid[];
  v_employee_count integer;
  v_employee_name text;
  v_employee_names text;
  v_supplier public.suppliers%rowtype;
  v_result jsonb;
  v_operation_id uuid;
begin
  if p_operation_type = 'issue' then
    v_employee_ids := case
      when coalesce(cardinality(p_employee_ids), 0) > 0 then p_employee_ids
      when p_employee_id is not null then array[p_employee_id]
      else array[]::uuid[]
    end;

    if cardinality(v_employee_ids) = 0 then
      raise exception 'Employee is required for issue operations' using errcode = '22023';
    end if;

    select count(distinct employee_id)
    into v_employee_count
    from unnest(v_employee_ids) employee_id;

    if v_employee_count <> cardinality(v_employee_ids) then
      raise exception 'Duplicate employees are not allowed' using errcode = '22023';
    end if;

    select count(*), min(name), string_agg(name, '، ' order by name)
    into v_employee_count, v_employee_name, v_employee_names
    from public.employees
    where id = any(v_employee_ids) and is_active = true;

    if v_employee_count <> cardinality(v_employee_ids) then
      raise exception 'One or more employees were not found or are inactive' using errcode = 'P0002';
    end if;
  elsif p_operation_type = 'add' then
    if p_supplier_id is null then
      raise exception 'Supplier is required for addition operations' using errcode = '22023';
    end if;
    select * into v_supplier
    from public.suppliers
    where id = p_supplier_id and is_active = true;
    if not found then
      raise exception 'Supplier not found or inactive' using errcode = 'P0002';
    end if;
  end if;

  v_result := public.apply_inventory_operation_transactional_rpc(
    p_table_name,
    p_item_id,
    p_operation_type,
    p_quantity,
    p_operation_date,
    p_project_name,
    p_category_name,
    p_item_name,
    case when p_operation_type = 'add' then v_supplier.name else null end,
    case
      when p_operation_type = 'issue' and cardinality(v_employee_ids) = 1 then v_employee_name
      when p_operation_type = 'issue' then v_employee_names
      else null
    end,
    p_received_by,
    p_purchase_order_number,
    p_item_code,
    p_notes,
    p_created_by,
    p_request_id
  );

  v_operation_id := (v_result ->> 'operation_id')::uuid;

  update public.inventory_operations
  set employee_id = case
        when p_operation_type = 'issue' and cardinality(v_employee_ids) = 1
          then v_employee_ids[1]
        else null
      end,
      supplier_id = case when p_operation_type = 'add' then p_supplier_id else null end,
      issued_to = case
        when p_operation_type = 'issue' and cardinality(v_employee_ids) = 1 then v_employee_name
        when p_operation_type = 'issue' then v_employee_names
        else issued_to
      end,
      supplier_name = case when p_operation_type = 'add' then v_supplier.name else supplier_name end,
      request_id = coalesce(request_id, nullif(btrim(p_request_id), ''))
  where id = v_operation_id;

  if p_operation_type = 'issue' then
    insert into public.inventory_operation_employee_allocations(
      issue_operation_id,
      employee_id,
      employee_name_snapshot,
      allocated_quantity
    )
    select
      v_operation_id,
      e.id,
      e.name,
      case when cardinality(v_employee_ids) = 1 then p_quantity else null end
    from public.employees e
    where e.id = any(v_employee_ids)
    on conflict (issue_operation_id, employee_id) do nothing;
  end if;

  return v_result || jsonb_build_object(
    'employee_id',
      case when p_operation_type = 'issue' and cardinality(v_employee_ids) = 1
        then v_employee_ids[1] else null end,
    'employee_ids',
      case when p_operation_type = 'issue' then to_jsonb(v_employee_ids) else null end,
    'supplier_id',
      case when p_operation_type = 'add' then p_supplier_id else null end,
    'allocation_status',
      case
        when p_operation_type <> 'issue' then null
        when cardinality(v_employee_ids) = 1 then 'allocated'
        else 'pending_distribution'
      end
  );
end;
$$;

revoke all on function public.apply_inventory_operation_with_party_rpc(
  text, uuid, text, numeric, date, text, text, text, uuid, uuid,
  text, text, text, text, text, text, uuid[]
) from public;
grant execute on function public.apply_inventory_operation_with_party_rpc(
  text, uuid, text, numeric, date, text, text, text, uuid, uuid,
  text, text, text, text, text, text, uuid[]
) to anon, authenticated, service_role;

create function public.allocate_group_issue_rpc(
  p_issue_operation_id uuid,
  p_allocations jsonb,
  p_updated_by text default 'user'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_issue public.inventory_operations%rowtype;
  v_participant_count integer;
  v_input_count integer;
  v_input_distinct_count integer;
  v_total numeric;
  v_invalid_count integer;
begin
  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'Allocations must be a JSON array' using errcode = '22023';
  end if;

  select * into v_issue
  from public.inventory_operations
  where id = p_issue_operation_id
  for update;

  if not found or v_issue.operation_type <> 'issue' then
    raise exception 'Issue movement not found' using errcode = 'P0002';
  end if;

  perform 1
  from public.inventory_operation_employee_allocations
  where issue_operation_id = p_issue_operation_id
  for update;

  select count(*) into v_participant_count
  from public.inventory_operation_employee_allocations
  where issue_operation_id = p_issue_operation_id;

  if v_participant_count < 2 then
    raise exception 'Only group issue movements can be distributed' using errcode = '22023';
  end if;

  with input as (
    select
      nullif(value ->> 'employee_id', '')::uuid as employee_id,
      nullif(value ->> 'quantity', '')::numeric as quantity
    from jsonb_array_elements(p_allocations)
  )
  select
    count(*),
    count(distinct employee_id),
    coalesce(sum(quantity), 0),
    count(*) filter (
      where employee_id is null
        or quantity is null
        or quantity < 0
        or not exists (
          select 1
          from public.inventory_operation_employee_allocations a
          where a.issue_operation_id = p_issue_operation_id
            and a.employee_id = input.employee_id
            and quantity >= a.returned_quantity
        )
    )
  into v_input_count, v_input_distinct_count, v_total, v_invalid_count
  from input;

  if v_input_count <> v_participant_count
     or v_input_distinct_count <> v_participant_count
     or v_invalid_count > 0 then
    raise exception 'Allocations must contain every participant once and cannot be below returned quantities'
      using errcode = '22023';
  end if;

  if v_total <> v_issue.quantity then
    raise exception 'Allocated quantities must equal the issue quantity' using errcode = '22023';
  end if;

  with input as (
    select
      (value ->> 'employee_id')::uuid as employee_id,
      (value ->> 'quantity')::numeric as quantity
    from jsonb_array_elements(p_allocations)
  )
  update public.inventory_operation_employee_allocations a
  set allocated_quantity = input.quantity,
      updated_at = now()
  from input
  where a.issue_operation_id = p_issue_operation_id
    and a.employee_id = input.employee_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'success',
    'issue_operation_id', p_issue_operation_id,
    'allocated_quantity', v_total,
    'updated_by', coalesce(nullif(btrim(p_updated_by), ''), 'user')
  );
end;
$$;

revoke all on function public.allocate_group_issue_rpc(uuid, jsonb, text) from public;
grant execute on function public.allocate_group_issue_rpc(uuid, jsonb, text)
  to anon, authenticated, service_role;

create function public.return_inventory_item_with_employee_rpc(
  p_issue_operation_id uuid,
  p_quantity numeric,
  p_operation_date date default current_date,
  p_received_by text default null,
  p_notes text default null,
  p_created_by text default 'user',
  p_request_id text default null,
  p_employee_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_issue public.inventory_operations%rowtype;
  v_employee_id uuid;
  v_participant_count integer;
  v_allocation public.inventory_operation_employee_allocations%rowtype;
  v_result jsonb;
  v_return_operation_id uuid;
begin
  select * into v_issue
  from public.inventory_operations
  where id = p_issue_operation_id
  for update;

  if not found or v_issue.operation_type <> 'issue' then
    raise exception 'Issue movement not found' using errcode = 'P0002';
  end if;

  select count(*) into v_participant_count
  from public.inventory_operation_employee_allocations
  where issue_operation_id = p_issue_operation_id;

  if v_participant_count > 1 then
    if p_employee_id is null then
      raise exception 'Employee is required for a group issue return' using errcode = '22023';
    end if;
    v_employee_id := p_employee_id;
  else
    v_employee_id := coalesce(
      v_issue.employee_id,
      (select employee_id
       from public.inventory_operation_employee_allocations
       where issue_operation_id = p_issue_operation_id
       limit 1)
    );
  end if;

  select * into v_allocation
  from public.inventory_operation_employee_allocations
  where issue_operation_id = p_issue_operation_id
    and employee_id = v_employee_id
  for update;

  if v_participant_count > 0 and not found then
    raise exception 'Employee is not a participant in this issue movement' using errcode = '22023';
  end if;

  if found
     and v_allocation.allocated_quantity is not null
     and v_allocation.returned_quantity + p_quantity > v_allocation.allocated_quantity then
    raise exception 'Return quantity exceeds this employee allocation' using errcode = '22023';
  end if;

  v_result := public.return_inventory_item_rpc(
    p_issue_operation_id,
    p_quantity,
    p_operation_date,
    p_received_by,
    p_notes,
    p_created_by,
    p_request_id
  );

  v_return_operation_id := (v_result ->> 'operation_id')::uuid;

  if (v_result ->> 'status') = 'success' and v_employee_id is not null then
    update public.inventory_operation_employee_allocations
    set returned_quantity = returned_quantity + p_quantity,
        updated_at = now()
    where issue_operation_id = p_issue_operation_id
      and employee_id = v_employee_id;

    update public.inventory_operations
    set employee_id = v_employee_id
    where id = v_return_operation_id;
  end if;

  return v_result || jsonb_build_object('employee_id', v_employee_id);
end;
$$;

revoke all on function public.return_inventory_item_rpc(
  uuid, numeric, date, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.return_inventory_item_with_employee_rpc(
  uuid, numeric, date, text, text, text, text, uuid
) from public;
grant execute on function public.return_inventory_item_with_employee_rpc(
  uuid, numeric, date, text, text, text, text, uuid
) to anon, authenticated, service_role;

drop view if exists public.employee_inventory_summary_v;
drop view if exists public.employee_inventory_activity_v;

create view public.employee_inventory_activity_v
with (security_invoker = true)
as
with allocation_activity as (
  select
    a.employee_id,
    a.employee_name_snapshot,
    a.allocated_quantity,
    a.returned_quantity as employee_returned_quantity,
    case when a.allocated_quantity is null
      then 'pending_distribution' else 'allocated' end as allocation_status,
    o.id, o.operation_type, o.related_operation_id, o.table_name, o.item_id,
    o.item_name, o.item_code, o.category_name, o.project_name, o.quantity,
    o.operation_date, o.issue_code, o.previous_balance, o.new_balance,
    o.notes, o.created_at
  from public.inventory_operation_employee_allocations a
  join public.inventory_operations o on o.id = a.issue_operation_id
  where o.operation_type = 'issue'
),
legacy_activity as (
  select
    o.employee_id,
    o.issued_to as employee_name_snapshot,
    o.quantity as allocated_quantity,
    o.returned_quantity as employee_returned_quantity,
    'allocated'::text as allocation_status,
    o.id, o.operation_type, o.related_operation_id, o.table_name, o.item_id,
    o.item_name, o.item_code, o.category_name, o.project_name, o.quantity,
    o.operation_date, o.issue_code, o.previous_balance, o.new_balance,
    o.notes, o.created_at
  from public.inventory_operations o
  where o.operation_type = 'issue'
    and o.employee_id is not null
    and not exists (
      select 1
      from public.inventory_operation_employee_allocations a
      where a.issue_operation_id = o.id
    )
),
activity as (
  select * from allocation_activity
  union all
  select * from legacy_activity
)
select
  e.id as employee_id,
  e.name as employee_name,
  e.employee_code,
  e.department,
  a.id as operation_id,
  a.operation_type,
  a.related_operation_id,
  a.table_name,
  a.item_id,
  a.item_name,
  a.item_code as internal_code,
  a.item_code,
  a.category_name,
  a.project_name,
  a.allocated_quantity as issue_quantity,
  a.quantity as operation_quantity,
  a.employee_returned_quantity as returned_quantity,
  case when a.allocated_quantity is null then null
    else greatest(a.allocated_quantity - a.employee_returned_quantity, 0) end
    as remaining_quantity,
  case
    when a.allocated_quantity is null then 'pending_distribution'
    when a.employee_returned_quantity <= 0 then 'not_returned'
    when a.employee_returned_quantity >= a.allocated_quantity then 'fully_returned'
    else 'partially_returned'
  end as return_status,
  a.allocation_status,
  a.operation_date as issue_date,
  a.operation_date,
  a.issue_code,
  a.previous_balance,
  a.new_balance,
  a.notes,
  a.created_at
from public.employees e
join activity a on a.employee_id = e.id;

create view public.employee_inventory_summary_v
with (security_invoker = true)
as
with activity as (
  select *
  from public.employee_inventory_activity_v
)
select
  e.id,
  e.name,
  e.id as employee_id,
  e.name as employee_name,
  e.employee_code,
  e.department,
  e.phone,
  e.notes,
  e.is_active,
  count(a.operation_id) as issue_movements_count,
  count(a.operation_id) filter (
    where a.allocation_status = 'pending_distribution'
  ) as pending_distribution_movements_count,
  coalesce(sum(a.issue_quantity) filter (
    where a.allocation_status = 'allocated'
  ), 0) as total_issued_quantity,
  count(a.operation_id) filter (
    where a.returned_quantity > 0
  ) as return_movements_count,
  coalesce(sum(a.returned_quantity), 0) as total_returned_quantity,
  coalesce(sum(
    case when a.allocation_status = 'allocated'
      then greatest(a.issue_quantity - a.returned_quantity, 0)
      else 0 end
  ), 0) as net_issued_quantity,
  max(a.issue_date) as last_issue_date
from public.employees e
left join activity a on a.employee_id = e.id
group by e.id, e.name, e.employee_code, e.department, e.phone, e.notes, e.is_active;

grant select on public.employee_inventory_activity_v to anon, authenticated;
grant select on public.employee_inventory_summary_v to anon, authenticated;
