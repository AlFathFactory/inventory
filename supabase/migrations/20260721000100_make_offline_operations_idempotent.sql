-- A stable client request id makes add/issue/adjust safe to retry after a lost response.
drop function if exists public.apply_inventory_operation_transactional_rpc(
  text,bigint,text,numeric,date,text,text,text,text,text,text,text,text,text,text
);

create or replace function public.apply_inventory_operation_transactional_rpc(
  p_table_name text, p_item_id bigint, p_operation_type text, p_quantity numeric,
  p_operation_date date, p_project_name text default null, p_category_name text default null,
  p_item_name text default null, p_supplier_name text default null, p_issued_to text default null,
  p_received_by text default null, p_purchase_order_number text default null,
  p_item_code text default null, p_notes text default null, p_created_by text default 'user',
  p_request_id text default null
) returns jsonb language plpgsql set search_path = '' as $$
declare
  allowed constant text[] := array['consumables','paints','screws','stock_screws','raw_materials','cylinders'];
  balance_column text := case when p_table_name = 'cylinders' then 'gas_balance' else 'stock_balance' end;
  previous_balance numeric;
  new_balance numeric;
  operation_id uuid;
begin
  if nullif(p_request_id, '') is null then raise exception 'requestId is required'; end if;
  if exists (select 1 from public.inventory_operations where import_key = p_request_id) then
    return jsonb_build_object('ok', true, 'status', 'already_processed');
  end if;
  if not (p_table_name = any(allowed)) then raise exception 'Unsupported inventory table: %', p_table_name; end if;
  if p_operation_type not in ('add','issue','adjust') then raise exception 'Unsupported operation type'; end if;
  if p_quantity is null or p_quantity < 0 or (p_operation_type <> 'adjust' and p_quantity <= 0) then raise exception 'Invalid quantity'; end if;

  begin
    execute format('select %I from public.%I where id = $1 for update', balance_column, p_table_name)
      into previous_balance using p_item_id;
    if previous_balance is null then raise exception 'Item not found'; end if;

    -- Recheck after the row lock: a concurrent request may have completed while we waited.
    if exists (select 1 from public.inventory_operations where import_key = p_request_id) then
      return jsonb_build_object('ok', true, 'status', 'already_processed');
    end if;

    new_balance := case p_operation_type when 'add' then previous_balance + p_quantity when 'issue' then previous_balance - p_quantity else p_quantity end;
    if new_balance < 0 then raise exception 'Insufficient stock'; end if;

    if p_table_name = 'cylinders' then
      execute format('update public.%I set %I=$1 where id=$2', p_table_name, balance_column) using new_balance, p_item_id;
    elsif p_operation_type = 'add' then
      execute format('update public.%I set stock_balance=$1,added=$2,total_added=total_added+$2 where id=$3', p_table_name) using new_balance,p_quantity,p_item_id;
    elsif p_operation_type = 'issue' then
      execute format('update public.%I set stock_balance=$1,issued=$2,total_issued=total_issued+$2 where id=$3', p_table_name) using new_balance,p_quantity,p_item_id;
    else
      execute format('update public.%I set stock_balance=$1 where id=$2', p_table_name) using new_balance,p_item_id;
    end if;

    insert into public.inventory_operations(import_key,table_name,category_name,category_label,item_id,item_name,item_label,project_name,project,operation_type,quantity,operation_date,previous_balance,new_balance,supplier_name,issued_to,received_by,purchase_order_number,item_code,notes,created_by)
    values(p_request_id,p_table_name,p_category_name,p_category_name,p_item_id,p_item_name,p_item_name,p_project_name,p_project_name,p_operation_type,p_quantity,p_operation_date,previous_balance,new_balance,p_supplier_name,p_issued_to,p_received_by,p_purchase_order_number,p_item_code,p_notes,p_created_by)
    returning id into operation_id;
  exception when unique_violation then
    return jsonb_build_object('ok', true, 'status', 'already_processed');
  end;

  return jsonb_build_object('ok', true, 'status', 'success', 'operation_id', operation_id, 'previous_balance', previous_balance, 'new_balance', new_balance);
end;
$$;

revoke all on function public.apply_inventory_operation_transactional_rpc(text,bigint,text,numeric,date,text,text,text,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.apply_inventory_operation_transactional_rpc(text,bigint,text,numeric,date,text,text,text,text,text,text,text,text,text,text,text) to authenticated;
