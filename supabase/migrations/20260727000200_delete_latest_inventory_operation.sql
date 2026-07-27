create or replace function public.delete_inventory_operation_rpc(
  p_operation_id uuid,
  p_deleted_by text
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  allowed constant text[] := array[
    'consumables', 'paints', 'screws', 'stock_screws', 'raw_materials', 'cylinders'
  ];
  operation_row public.inventory_operations%rowtype;
  latest_operation_id uuid;
  balance_column text;
  item_exists integer;
begin
  if p_operation_id is null then
    raise exception 'p_operation_id is required';
  end if;

  if nullif(btrim(p_deleted_by), '') is null then
    raise exception 'p_deleted_by is required';
  end if;

  select *
  into operation_row
  from public.inventory_operations
  where id = p_operation_id;

  if not found then
    raise exception 'Inventory movement not found';
  end if;

  if not (operation_row.table_name = any(allowed)) then
    raise exception 'Unsupported inventory table: %', operation_row.table_name;
  end if;

  balance_column := case
    when operation_row.table_name = 'cylinders' then 'gas_balance'
    else 'stock_balance'
  end;

  -- Serialize all movement changes for this item on the authoritative item row.
  execute format(
    'select 1 from public.%I where id = $1 for update',
    operation_row.table_name
  ) into item_exists using operation_row.item_id;

  if item_exists is null then
    raise exception 'Inventory item not found';
  end if;

  select id
  into latest_operation_id
  from public.inventory_operations
  where table_name = operation_row.table_name
    and item_id = operation_row.item_id
  order by operation_date desc, created_at desc, id desc
  limit 1
  for update;

  if latest_operation_id is distinct from p_operation_id then
    raise exception 'Only the latest movement for this item can be deleted.';
  end if;

  if operation_row.table_name = 'cylinders' then
    execute format(
      'update public.%I set %I = $1, updated_at = now() where id = $2',
      operation_row.table_name,
      balance_column
    ) using operation_row.previous_balance, operation_row.item_id;
  elsif operation_row.operation_type = 'add' then
    execute format(
      'update public.%I
       set stock_balance = $1,
           total_added = greatest(total_added - $2, 0),
           added = coalesce((
             select quantity
             from public.inventory_operations
             where table_name = $3
               and item_id = $4
               and operation_type = ''add''
               and id <> $5
             order by operation_date desc, created_at desc, id desc
             limit 1
           ), 0),
           updated_at = now()
       where id = $4',
      operation_row.table_name
    ) using
      operation_row.previous_balance,
      operation_row.quantity,
      operation_row.table_name,
      operation_row.item_id,
      p_operation_id;
  elsif operation_row.operation_type = 'issue' then
    execute format(
      'update public.%I
       set stock_balance = $1,
           total_issued = greatest(total_issued - $2, 0),
           issued = coalesce((
             select quantity
             from public.inventory_operations
             where table_name = $3
               and item_id = $4
               and operation_type = ''issue''
               and id <> $5
             order by operation_date desc, created_at desc, id desc
             limit 1
           ), 0),
           updated_at = now()
       where id = $4',
      operation_row.table_name
    ) using
      operation_row.previous_balance,
      operation_row.quantity,
      operation_row.table_name,
      operation_row.item_id,
      p_operation_id;
  else
    execute format(
      'update public.%I set stock_balance = $1, updated_at = now() where id = $2',
      operation_row.table_name
    ) using operation_row.previous_balance, operation_row.item_id;
  end if;

  delete from public.inventory_operations where id = p_operation_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'success',
    'operation_id', p_operation_id,
    'deleted_by', p_deleted_by,
    'restored_balance', operation_row.previous_balance
  );
end;
$$;

drop policy if exists authenticated_delete on public.inventory_operations;
create policy authenticated_delete
on public.inventory_operations
for delete
to authenticated
using (true);

grant delete on public.inventory_operations to authenticated;
revoke all on function public.delete_inventory_operation_rpc(uuid, text) from public, anon;
grant execute on function public.delete_inventory_operation_rpc(uuid, text) to authenticated;
