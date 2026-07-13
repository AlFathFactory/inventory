create or replace function public.apply_inventory_operation_transactional_rpc(
  p_table_name text, p_item_id bigint, p_operation_type text, p_quantity numeric,
  p_operation_date date, p_project_name text default null, p_category_name text default null,
  p_item_name text default null, p_supplier_name text default null, p_issued_to text default null,
  p_received_by text default null, p_purchase_order_number text default null,
  p_item_code text default null, p_notes text default null, p_created_by text default 'user'
) returns jsonb language plpgsql set search_path = '' as $$
declare
  allowed constant text[] := array['consumables','paints','screws','stock_screws','raw_materials','cylinders'];
  balance_column text := case when p_table_name = 'cylinders' then 'gas_balance' else 'stock_balance' end;
  previous_balance numeric;
  new_balance numeric;
  operation_id uuid;
begin
  if not (p_table_name = any(allowed)) then raise exception 'Unsupported inventory table: %', p_table_name; end if;
  if p_operation_type not in ('add','issue','adjust') then raise exception 'Unsupported operation type'; end if;
  if p_quantity is null or p_quantity < 0 or (p_operation_type <> 'adjust' and p_quantity <= 0) then raise exception 'Invalid quantity'; end if;

  execute format('select %I from public.%I where id = $1 for update', balance_column, p_table_name)
    into previous_balance using p_item_id;
  if not found then raise exception 'Item not found'; end if;

  new_balance := case p_operation_type
    when 'add' then previous_balance + p_quantity
    when 'issue' then previous_balance - p_quantity
    else p_quantity end;
  if new_balance < 0 then raise exception 'Insufficient stock'; end if;

  if p_table_name = 'cylinders' then
    execute format('update public.%I set %I = $1 where id = $2', p_table_name, balance_column)
      using new_balance, p_item_id;
  elsif p_operation_type = 'add' then
    execute format('update public.%I set stock_balance=$1, added=$2, total_added=total_added+$2 where id=$3', p_table_name)
      using new_balance, p_quantity, p_item_id;
  elsif p_operation_type = 'issue' then
    execute format('update public.%I set stock_balance=$1, issued=$2, total_issued=total_issued+$2 where id=$3', p_table_name)
      using new_balance, p_quantity, p_item_id;
  else
    execute format('update public.%I set stock_balance=$1 where id=$2', p_table_name)
      using new_balance, p_item_id;
  end if;

  insert into public.inventory_operations (
    table_name, category_name, category_label, item_id, item_name, item_label,
    project_name, project, operation_type, quantity, operation_date,
    previous_balance, new_balance, supplier_name, issued_to, received_by,
    purchase_order_number, item_code, notes, created_by
  ) values (
    p_table_name, p_category_name, p_category_name, p_item_id, p_item_name, p_item_name,
    p_project_name, p_project_name, p_operation_type, p_quantity, p_operation_date,
    previous_balance, new_balance, p_supplier_name, p_issued_to, p_received_by,
    p_purchase_order_number, p_item_code, p_notes, p_created_by
  ) returning id into operation_id;

  return jsonb_build_object('ok', true, 'operation_id', operation_id,
    'previous_balance', previous_balance, 'new_balance', new_balance);
end;
$$;

create or replace function public.import_normalized_items_chunk_rpc(p_items jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare item jsonb; table_name text; existed boolean; inserted_count int := 0; updated_count int := 0; skipped_count int := 0; errors jsonb := '[]';
begin
  for item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    begin
      table_name := item->>'table_name';
      if table_name not in ('consumables','paints','screws','stock_screws','raw_materials','cylinders') then raise exception 'Unsupported inventory table: %', table_name; end if;
      execute format('select exists(select 1 from public.%I where item_key=$1)', table_name) into existed using item->>'item_key';
      if table_name = 'cylinders' then
        execute format('insert into public.%I(item_key,type_name,gas_balance,transaction_date,notes) values($1,$2,$3,$4,$5) on conflict(item_key) do update set type_name=excluded.type_name,gas_balance=excluded.gas_balance,transaction_date=excluded.transaction_date,notes=excluded.notes', table_name)
          using item->>'item_key', item->>'item_name', coalesce((item->>'stock_balance')::numeric,0), nullif(item->>'transaction_date','')::date, item->>'notes';
      else
        execute format('insert into public.%I(item_key,item_name,project,stock_balance,min_quantity,total_added,total_issued,transaction_date,notes) values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(item_key) do update set item_name=excluded.item_name,project=excluded.project,stock_balance=excluded.stock_balance,min_quantity=excluded.min_quantity,total_added=excluded.total_added,total_issued=excluded.total_issued,transaction_date=excluded.transaction_date,notes=excluded.notes', table_name)
          using item->>'item_key', item->>'item_name', item->>'project_name', coalesce((item->>'stock_balance')::numeric,0), coalesce((item->>'min_quantity')::numeric,0), coalesce((item->>'total_added')::numeric,0), coalesce((item->>'total_issued')::numeric,0), nullif(item->>'transaction_date','')::date, item->>'notes';
      end if;
      if existed then updated_count := updated_count + 1; else inserted_count := inserted_count + 1; end if;
    exception when others then skipped_count := skipped_count + 1; errors := errors || jsonb_build_array(sqlerrm); end;
  end loop;
  return jsonb_build_object('inserted',inserted_count,'updated',updated_count,'skipped',skipped_count,'errors',errors);
end;
$$;

create or replace function public.import_normalized_movements_chunk_rpc(p_movements jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare movement jsonb; table_name text; resolved_item_id bigint; affected int; inserted_count int := 0; skipped_count int := 0; errors jsonb := '[]';
begin
  for movement in select value from jsonb_array_elements(coalesce(p_movements, '[]'::jsonb)) loop
    begin
      table_name := movement->>'table_name';
      if table_name not in ('consumables','paints','screws','stock_screws','raw_materials','cylinders') then raise exception 'Unsupported inventory table: %', table_name; end if;
      if nullif(movement->>'import_key','') is null then raise exception 'import_key is required'; end if;
      execute format('select id from public.%I where item_key=$1', table_name) into resolved_item_id using movement->>'item_key';
      if resolved_item_id is null then raise exception 'Item not found by item_key'; end if;
      insert into public.inventory_operations(import_key,table_name,category_name,category_label,item_id,item_name,item_label,project_name,project,operation_type,quantity,operation_date,previous_balance,new_balance,notes,created_by)
      values(movement->>'import_key',table_name,movement->>'category_name',movement->>'category_name',resolved_item_id,movement->>'item_name',movement->>'item_name',movement->>'project_name',movement->>'project_name',movement->>'operation_type',(movement->>'quantity')::numeric,(movement->>'operation_date')::date,coalesce((movement->>'previous_balance')::numeric,0),coalesce((movement->>'new_balance')::numeric,0),movement->>'notes','import')
      on conflict(import_key) where import_key is not null do nothing;
      get diagnostics affected = row_count;
      if affected = 1 then inserted_count := inserted_count + 1; else skipped_count := skipped_count + 1; end if;
    exception when others then skipped_count := skipped_count + 1; errors := errors || jsonb_build_array(sqlerrm); end;
  end loop;
  return jsonb_build_object('inserted',inserted_count,'updated',0,'skipped',skipped_count,'errors',errors);
end;
$$;

create or replace function public.import_normalized_custody_chunk_rpc(p_table_name text, p_records jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare record jsonb; existed boolean; inserted_count int := 0; updated_count int := 0; skipped_count int := 0; errors jsonb := '[]';
begin
  if p_table_name not in ('cutting_discs','long_welding_gloves') then raise exception 'Unsupported custody table'; end if;
  for record in select value from jsonb_array_elements(coalesce(p_records,'[]'::jsonb)) loop
    begin
      execute format('select exists(select 1 from public.%I where code=$1)',p_table_name) into existed using record->>'code';
      if p_table_name = 'long_welding_gloves' then
        insert into public.long_welding_gloves(type_name,code,quantity,received_by,received_date,scrapped_date,source_sheet)
        values(record->>'type_name',record->>'code',coalesce((record->>'quantity')::numeric,1),record->>'received_by',nullif(record->>'received_date','')::date,nullif(record->>'scrapped_date','')::date,record->>'source_sheet')
        on conflict(code) where code is not null do update set type_name=excluded.type_name,quantity=excluded.quantity,received_by=excluded.received_by,received_date=excluded.received_date,scrapped_date=excluded.scrapped_date,source_sheet=excluded.source_sheet;
      else
        insert into public.cutting_discs(type_name,code,received_by,received_date,scrapped_date,source_sheet)
        values(record->>'type_name',record->>'code',record->>'received_by',nullif(record->>'received_date','')::date,nullif(record->>'scrapped_date','')::date,record->>'source_sheet')
        on conflict(code) where code is not null do update set type_name=excluded.type_name,received_by=excluded.received_by,received_date=excluded.received_date,scrapped_date=excluded.scrapped_date,source_sheet=excluded.source_sheet;
      end if;
      if existed then updated_count := updated_count + 1; else inserted_count := inserted_count + 1; end if;
    exception when others then skipped_count := skipped_count + 1; errors := errors || jsonb_build_array(sqlerrm); end;
  end loop;
  return jsonb_build_object('inserted',inserted_count,'updated',updated_count,'skipped',skipped_count,'errors',errors);
end;
$$;
