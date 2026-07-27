alter table public.inventory_operations
  add column if not exists related_operation_id uuid;

alter table public.inventory_operations
  drop constraint if exists inventory_operations_operation_type_check;

alter table public.inventory_operations
  add constraint inventory_operations_operation_type_check
  check (operation_type in ('add', 'issue', 'adjust', 'return'));

alter table public.inventory_operations
  drop constraint if exists inventory_operations_related_operation_id_fkey;

alter table public.inventory_operations
  add constraint inventory_operations_related_operation_id_fkey
  foreign key (related_operation_id)
  references public.inventory_operations(id)
  on delete restrict;

create index if not exists inventory_operations_related_operation_idx
  on public.inventory_operations (related_operation_id)
  where related_operation_id is not null;

create or replace view public.inventory_item_movements_view
with (security_invoker = true) as
select
  operation.id,
  operation.table_name,
  operation.category_name,
  operation.category_label,
  operation.item_id,
  operation.item_name,
  operation.item_label,
  operation.project_name,
  operation.project,
  operation.operation_type,
  operation.quantity,
  operation.operation_date,
  case when operation.operation_type = 'issue' then operation.quantity else 0 end
    as issued_quantity,
  case when operation.operation_type = 'add' then operation.quantity else 0 end
    as added_quantity,
  operation.previous_balance,
  operation.new_balance,
  operation.supplier_name,
  operation.issued_to,
  operation.received_by,
  operation.purchase_order_number,
  operation.addition_code,
  operation.issue_code,
  operation.item_code,
  operation.notes,
  operation.created_by,
  operation.created_at,
  case when operation.operation_type = 'return' then operation.quantity else 0 end
    as returned_quantity,
  case
    when operation.operation_type = 'issue' then coalesce(return_totals.returned_quantity, 0)
    else 0
  end as quantity_already_returned,
  case
    when operation.operation_type = 'issue'
      then greatest(operation.quantity - coalesce(return_totals.returned_quantity, 0), 0)
    else 0
  end as remaining_returnable_quantity,
  operation.related_operation_id,
  original_issue.issued_to as original_issued_to,
  original_issue.operation_date as original_issue_date,
  original_issue.issue_code as original_issue_code
from public.inventory_operations as operation
left join public.inventory_operations as original_issue
  on original_issue.id = operation.related_operation_id
left join lateral (
  select coalesce(sum(return_operation.quantity), 0) as returned_quantity
  from public.inventory_operations as return_operation
  where return_operation.related_operation_id = operation.id
    and return_operation.operation_type = 'return'
) as return_totals on true;

create or replace function public.return_inventory_item_rpc(
  p_issue_operation_id uuid,
  p_quantity numeric,
  p_operation_date date,
  p_received_by text default null,
  p_notes text default null,
  p_created_by text default 'user',
  p_request_id text default null
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  allowed constant text[] := array[
    'consumables', 'paints', 'screws', 'stock_screws', 'raw_materials', 'cylinders'
  ];
  issue_operation public.inventory_operations%rowtype;
  previous_balance numeric;
  new_balance numeric;
  already_returned numeric;
  remaining_quantity numeric;
  return_operation_id uuid;
  balance_column text;
begin
  if p_issue_operation_id is null then
    raise exception 'p_issue_operation_id is required';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Returned quantity must be greater than zero';
  end if;
  if p_operation_date is null then
    raise exception 'Return date is required';
  end if;
  if nullif(btrim(p_request_id), '') is null then
    raise exception 'p_request_id is required';
  end if;

  if exists (
    select 1 from public.inventory_operations where import_key = p_request_id
  ) then
    return jsonb_build_object('ok', true, 'status', 'already_processed');
  end if;

  select *
  into issue_operation
  from public.inventory_operations
  where id = p_issue_operation_id;

  if not found then
    raise exception 'Issue movement not found';
  end if;
  if issue_operation.operation_type <> 'issue' then
    raise exception 'The selected movement is not an issue movement';
  end if;
  if not (issue_operation.table_name = any(allowed)) then
    raise exception 'Unsupported inventory table: %', issue_operation.table_name;
  end if;

  balance_column := case
    when issue_operation.table_name = 'cylinders' then 'gas_balance'
    else 'stock_balance'
  end;

  execute format(
    'select %I from public.%I where id = $1 for update',
    balance_column,
    issue_operation.table_name
  ) into previous_balance using issue_operation.item_id;

  if previous_balance is null then
    raise exception 'Inventory item not found';
  end if;

  -- Follow the same item-row-first lock order used by add, delete, and other
  -- returns, then re-read the issue under lock before calculating the remainder.
  select *
  into issue_operation
  from public.inventory_operations
  where id = p_issue_operation_id
  for update;

  if not found then
    raise exception 'Issue movement not found';
  end if;
  if issue_operation.operation_type <> 'issue' then
    raise exception 'The selected movement is not an issue movement';
  end if;

  if exists (
    select 1 from public.inventory_operations where import_key = p_request_id
  ) then
    return jsonb_build_object('ok', true, 'status', 'already_processed');
  end if;

  select coalesce(sum(quantity), 0)
  into already_returned
  from public.inventory_operations
  where related_operation_id = p_issue_operation_id
    and operation_type = 'return';

  remaining_quantity := greatest(issue_operation.quantity - already_returned, 0);
  if p_quantity > remaining_quantity then
    raise exception 'Returned quantity exceeds the remaining quantity for this issue movement';
  end if;

  new_balance := previous_balance + p_quantity;
  execute format(
    'update public.%I set %I = $1, updated_at = now() where id = $2',
    issue_operation.table_name,
    balance_column
  ) using new_balance, issue_operation.item_id;

  insert into public.inventory_operations (
    import_key,
    table_name,
    category_name,
    category_label,
    item_id,
    item_name,
    item_label,
    project_name,
    project,
    operation_type,
    quantity,
    operation_date,
    previous_balance,
    new_balance,
    received_by,
    item_code,
    notes,
    created_by,
    related_operation_id
  ) values (
    p_request_id,
    issue_operation.table_name,
    issue_operation.category_name,
    issue_operation.category_label,
    issue_operation.item_id,
    issue_operation.item_name,
    issue_operation.item_label,
    issue_operation.project_name,
    issue_operation.project,
    'return',
    p_quantity,
    p_operation_date,
    previous_balance,
    new_balance,
    nullif(btrim(p_received_by), ''),
    issue_operation.item_code,
    nullif(btrim(p_notes), ''),
    coalesce(nullif(btrim(p_created_by), ''), 'user'),
    p_issue_operation_id
  )
  returning id into return_operation_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'success',
    'operation_id', return_operation_id,
    'related_operation_id', p_issue_operation_id,
    'previous_balance', previous_balance,
    'new_balance', new_balance,
    'remaining_returnable_quantity', remaining_quantity - p_quantity
  );
end;
$$;

revoke all on function public.return_inventory_item_rpc(
  uuid, numeric, date, text, text, text, text
) from public, anon;

grant execute on function public.return_inventory_item_rpc(
  uuid, numeric, date, text, text, text, text
) to authenticated;
