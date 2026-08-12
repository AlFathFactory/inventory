-- ============================================================
-- Teach the remaining shared, category-aware RPCs and views about
-- 'inventory_items' (dynamic categories). Purely additive: every
-- change below only widens an existing allow-list or UNION ALL arm.
-- The categories.code_prefix / internal-codes wiring was already
-- shipped in 20260812074908_dynamic_categories_internal_codes.sql.
-- ============================================================

-- 0) create_inventory_item: seed added/total_added with the opening
--    balance too, not just stock_balance. This migration attaches
--    record_new_stock_item_as_add_movement to inventory_items (see
--    section 11 below), which auto-inserts an 'add' ledger movement
--    equal to the opening balance on insert. Before this fix the
--    item's own total_added stayed 0 while the ledger showed
--    +opening_balance, so the two disagreed from the very first row.
create or replace function public.create_inventory_item(
  p_category_id   uuid,
  p_item_name     text,
  p_opening_balance numeric default 0,
  p_min_quantity  numeric default 0,
  p_supplier_name text default null,
  p_notes         text default null
) returns public.inventory_items language plpgsql security definer set search_path = public as $$
declare rec public.inventory_items;
begin
  if p_category_id is null then raise exception 'category_id is required'; end if;
  if p_item_name is null or btrim(p_item_name) = '' then raise exception 'item_name is required'; end if;
  if not exists (select 1 from public.categories where id = p_category_id) then
    raise exception 'category % does not exist', p_category_id;
  end if;

  insert into public.inventory_items
    (category_id, item_name, opening_balance, stock_balance, added, total_added, min_quantity, supplier_name, notes)
  values
    (p_category_id, btrim(p_item_name), coalesce(p_opening_balance,0), coalesce(p_opening_balance,0),
     coalesce(p_opening_balance,0), coalesce(p_opening_balance,0),
     coalesce(p_min_quantity,0), p_supplier_name, p_notes)
  returning * into rec;
  return rec;
end $$;

-- 1) apply_inventory_operation_rpc: allow inventory_items ----------
create or replace function public.apply_inventory_operation_rpc(p_table_name text, p_item_id uuid, p_operation_type text, p_quantity numeric, p_category_name text DEFAULT NULL::text, p_project_name text DEFAULT NULL::text, p_item_name text DEFAULT NULL::text, p_item_code text DEFAULT NULL::text, p_supplier_name text DEFAULT NULL::text, p_purchase_order_number text DEFAULT NULL::text, p_issued_to text DEFAULT NULL::text, p_operation_date date DEFAULT CURRENT_DATE, p_notes text DEFAULT NULL::text, p_created_by text DEFAULT NULL::text)
 RETURNS TABLE(operation_id uuid, previous_balance numeric, new_balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_current_balance numeric := 0;
  v_current_total_added numeric := 0;
  v_current_total_issued numeric := 0;
  v_new_balance numeric := 0;
  v_operation_id uuid;
  v_stock_column text := 'stock_balance';
begin
  if p_table_name not in ('consumables','paints','screws','stock_screws','raw_materials','cylinders','inventory_items') then
    raise exception 'Unsupported inventory table: %', p_table_name;
  end if;

  if p_operation_type not in ('add','issue','adjust') then
    raise exception 'Invalid operation type: %', p_operation_type;
  end if;

  if p_quantity is null or p_quantity < 0 then
    raise exception 'Quantity must be zero or positive';
  end if;

  if p_table_name = 'cylinders' then
    v_stock_column := 'gas_balance';
  end if;

  execute format(
    'select coalesce(%I,0), coalesce(total_added,0), coalesce(total_issued,0) from public.%I where id = $1 and coalesce(is_archived,false) = false for update',
    v_stock_column,
    p_table_name
  )
  into v_current_balance, v_current_total_added, v_current_total_issued
  using p_item_id;

  if not found then
    raise exception 'Item not found or archived in table %', p_table_name;
  end if;

  if p_operation_type = 'add' then
    v_new_balance := v_current_balance + p_quantity;

    execute format(
      'update public.%I set added = $1, total_added = $2, %I = $3, transaction_date = $4, updated_at = now() where id = $5',
      p_table_name,
      v_stock_column
    )
    using p_quantity, v_current_total_added + p_quantity, v_new_balance, p_operation_date, p_item_id;

  elsif p_operation_type = 'issue' then
    if p_quantity > v_current_balance then
      raise exception 'الكمية المصروفة أكبر من الرصيد الحالي';
    end if;

    v_new_balance := v_current_balance - p_quantity;

    execute format(
      'update public.%I set issued = $1, total_issued = $2, %I = $3, transaction_date = $4, updated_at = now() where id = $5',
      p_table_name,
      v_stock_column
    )
    using p_quantity, v_current_total_issued + p_quantity, v_new_balance, p_operation_date, p_item_id;

  else
    v_new_balance := p_quantity;

    execute format(
      'update public.%I set %I = $1, transaction_date = $2, updated_at = now() where id = $3',
      p_table_name,
      v_stock_column
    )
    using v_new_balance, p_operation_date, p_item_id;
  end if;

  insert into public.inventory_operations (
    table_name,
    item_id,
    operation_type,
    quantity,
    project,
    project_name,
    category_label,
    category_name,
    item_label,
    item_name,
    item_code,
    previous_balance,
    new_balance,
    operation_date,
    notes,
    received_by,
    issued_to,
    supplier_name,
    purchase_order_number,
    created_by
  ) values (
    p_table_name,
    p_item_id,
    p_operation_type,
    p_quantity,
    p_project_name,
    p_project_name,
    p_category_name,
    p_category_name,
    p_item_name,
    p_item_name,
    p_item_code,
    v_current_balance,
    v_new_balance,
    p_operation_date,
    p_notes,
    p_issued_to,
    p_issued_to,
    p_supplier_name,
    p_purchase_order_number,
    p_created_by
  )
  returning id into v_operation_id;

  return query select v_operation_id, v_current_balance, v_new_balance;
end;
$function$;

-- 2) apply_inventory_operation_transactional_rpc (both overloads) --
-- overload A: no p_request_id
create or replace function public.apply_inventory_operation_transactional_rpc(p_table_name text, p_item_id uuid, p_operation_type text, p_quantity numeric, p_operation_date date DEFAULT CURRENT_DATE, p_project_name text DEFAULT NULL::text, p_category_name text DEFAULT NULL::text, p_item_name text DEFAULT NULL::text, p_supplier_name text DEFAULT NULL::text, p_issued_to text DEFAULT NULL::text, p_received_by text DEFAULT NULL::text, p_purchase_order_number text DEFAULT NULL::text, p_item_code text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_created_by text DEFAULT 'user'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stock_field text;
  v_item_label_field text;
  v_category_name text;
  v_current_balance numeric;
  v_new_balance numeric;
  v_total_added numeric := 0;
  v_total_issued numeric := 0;
  v_existing_item_name text;
  v_existing_project text;
  v_updated_id uuid;
  v_operation_id uuid;
  v_movement_quantity numeric;
begin
  if p_table_name not in ('consumables','paints','screws','stock_screws','raw_materials','cylinders','inventory_items') then
    raise exception 'Unsupported inventory table: %', p_table_name using errcode = '22023';
  end if;

  if p_operation_type not in ('add','issue','adjust') then
    raise exception 'Unsupported operation type: %', p_operation_type using errcode = '22023';
  end if;

  if p_quantity is null or p_quantity < 0 then
    raise exception 'Quantity must be zero or greater' using errcode = '22023';
  end if;

  if p_operation_type in ('add','issue') and p_quantity <= 0 then
    raise exception 'Add/issue quantity must be greater than zero' using errcode = '22023';
  end if;

  if p_table_name = 'cylinders' then
    v_stock_field := 'gas_balance';
    v_item_label_field := 'type_name';
    v_category_name := coalesce(p_category_name, 'اسطوانات');
  elsif p_table_name = 'paints' then
    v_stock_field := 'stock_balance';
    v_item_label_field := 'item_name';
    v_category_name := coalesce(p_category_name, 'الدهانات');
  elsif p_table_name = 'screws' then
    v_stock_field := 'stock_balance';
    v_item_label_field := 'item_name';
    v_category_name := coalesce(p_category_name, 'مسامير');
  elsif p_table_name = 'stock_screws' then
    v_stock_field := 'stock_balance';
    v_item_label_field := 'item_name';
    v_category_name := coalesce(p_category_name, 'مسامير استوك');
  elsif p_table_name = 'raw_materials' then
    v_stock_field := 'stock_balance';
    v_item_label_field := 'item_name';
    v_category_name := coalesce(p_category_name, 'خامات');
  elsif p_table_name = 'inventory_items' then
    v_stock_field := 'stock_balance';
    v_item_label_field := 'item_name';
    v_category_name := p_category_name;
  else
    v_stock_field := 'stock_balance';
    v_item_label_field := 'item_name';
    v_category_name := coalesce(p_category_name, 'مستهلكات');
  end if;

  if p_table_name = 'cylinders' then
    execute format(
      'select coalesce(%I,0)::numeric, 0::numeric, 0::numeric, %I::text, project::text from public.%I where id = $1 for update',
      v_stock_field,
      v_item_label_field,
      p_table_name
    )
    into v_current_balance, v_total_added, v_total_issued, v_existing_item_name, v_existing_project
    using p_item_id;
  else
    execute format(
      'select coalesce(%I,0)::numeric, coalesce(total_added,0)::numeric, coalesce(total_issued,0)::numeric, %I::text, project::text from public.%I where id = $1 for update',
      v_stock_field,
      v_item_label_field,
      p_table_name
    )
    into v_current_balance, v_total_added, v_total_issued, v_existing_item_name, v_existing_project
    using p_item_id;
  end if;

  if v_current_balance is null then
    raise exception 'Item not found or not accessible: table %, id %', p_table_name, p_item_id using errcode = 'P0002';
  end if;

  if p_table_name = 'inventory_items' and v_category_name is null then
    select source_sheet into v_category_name from public.inventory_items where id = p_item_id;
  end if;

  if p_operation_type = 'add' then
    v_new_balance := v_current_balance + p_quantity;
    v_total_added := v_total_added + p_quantity;
    v_movement_quantity := p_quantity;
  elsif p_operation_type = 'issue' then
    if v_current_balance < p_quantity then
      raise exception 'Insufficient stock. Current balance %, requested %', v_current_balance, p_quantity using errcode = '22023';
    end if;
    v_new_balance := v_current_balance - p_quantity;
    v_total_issued := v_total_issued + p_quantity;
    v_movement_quantity := p_quantity;
  else
    v_new_balance := p_quantity;
    v_movement_quantity := abs(v_new_balance - v_current_balance);
  end if;

  if p_table_name = 'cylinders' then
    execute format(
      'update public.%I set %I = $1, stock_balance = $1, transaction_date = coalesce($2, transaction_date), updated_at = now() where id = $3 returning id',
      p_table_name,
      v_stock_field
    )
    into v_updated_id
    using v_new_balance, p_operation_date, p_item_id;
  else
    execute format(
      'update public.%I set %I = $1, total_added = $2, total_issued = $3, transaction_date = coalesce($4, transaction_date), updated_at = now() where id = $5 returning id',
      p_table_name,
      v_stock_field
    )
    into v_updated_id
    using v_new_balance, v_total_added, v_total_issued, p_operation_date, p_item_id;
  end if;

  if v_updated_id is null then
    raise exception 'Update failed: no row updated for table %, id %', p_table_name, p_item_id using errcode = 'P0002';
  end if;

  insert into public.inventory_operations(
    table_name,
    item_id,
    operation_type,
    quantity,
    project,
    project_name,
    category_label,
    category_name,
    item_label,
    item_name,
    previous_balance,
    new_balance,
    operation_date,
    notes,
    received_by,
    created_by,
    supplier_name,
    issued_to,
    purchase_order_number,
    item_code,
    source_category_row_id,
    source_table_name,
    source_row_type
  ) values (
    p_table_name,
    p_item_id,
    p_operation_type,
    v_movement_quantity,
    coalesce(p_project_name, v_existing_project),
    coalesce(p_project_name, v_existing_project),
    v_category_name,
    v_category_name,
    coalesce(p_item_name, v_existing_item_name),
    coalesce(p_item_name, v_existing_item_name),
    v_current_balance,
    v_new_balance,
    coalesce(p_operation_date, current_date),
    p_notes,
    p_received_by,
    coalesce(p_created_by, 'user'),
    p_supplier_name,
    p_issued_to,
    p_purchase_order_number,
    p_item_code,
    p_item_id,
    p_table_name,
    'transactional_rpc'
  ) returning id into v_operation_id;

  return jsonb_build_object(
    'ok', true,
    'operation_id', v_operation_id,
    'item_id', p_item_id,
    'table_name', p_table_name,
    'operation_type', p_operation_type,
    'previous_balance', v_current_balance,
    'new_balance', v_new_balance,
    'quantity', v_movement_quantity,
    'total_added', v_total_added,
    'total_issued', v_total_issued
  );
end;
$function$;

-- overload B: with p_request_id (idempotency)
create or replace function public.apply_inventory_operation_transactional_rpc(p_table_name text, p_item_id uuid, p_operation_type text, p_quantity numeric, p_operation_date date DEFAULT CURRENT_DATE, p_project_name text DEFAULT NULL::text, p_category_name text DEFAULT NULL::text, p_item_name text DEFAULT NULL::text, p_supplier_name text DEFAULT NULL::text, p_issued_to text DEFAULT NULL::text, p_received_by text DEFAULT NULL::text, p_purchase_order_number text DEFAULT NULL::text, p_item_code text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_created_by text DEFAULT 'user'::text, p_request_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stock_field text;
  v_item_label_field text;
  v_category_name text;
  v_current_balance numeric;
  v_new_balance numeric;
  v_total_added numeric := 0;
  v_total_issued numeric := 0;
  v_existing_item_name text;
  v_existing_project text;
  v_updated_id uuid;
  v_operation_id uuid;
  v_existing_operation_id uuid;
  v_existing_previous_balance numeric;
  v_existing_new_balance numeric;
  v_movement_quantity numeric;
begin
  if p_table_name not in ('consumables','paints','screws','stock_screws','raw_materials','cylinders','inventory_items') then
    raise exception 'Unsupported inventory table: %', p_table_name using errcode = '22023';
  end if;

  if p_operation_type not in ('add','issue','adjust') then
    raise exception 'Unsupported operation type: %', p_operation_type using errcode = '22023';
  end if;

  if p_quantity is null or p_quantity < 0 then
    raise exception 'Quantity must be zero or greater' using errcode = '22023';
  end if;

  if p_operation_type in ('add','issue') and p_quantity <= 0 then
    raise exception 'Add/issue quantity must be greater than zero' using errcode = '22023';
  end if;

  p_request_id := nullif(btrim(p_request_id), '');

  if p_request_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('inventory-operation:' || p_request_id, 0));

    select id, previous_balance, new_balance
      into v_existing_operation_id, v_existing_previous_balance, v_existing_new_balance
    from public.inventory_operations
    where import_key = p_request_id
    limit 1;

    if v_existing_operation_id is not null then
      return jsonb_build_object(
        'ok', true,
        'status', 'already_processed',
        'request_id', p_request_id,
        'operation_id', v_existing_operation_id,
        'item_id', p_item_id,
        'table_name', p_table_name,
        'operation_type', p_operation_type,
        'previous_balance', v_existing_previous_balance,
        'new_balance', v_existing_new_balance,
        'quantity', p_quantity
      );
    end if;
  end if;

  if p_table_name = 'cylinders' then
    v_stock_field := 'gas_balance';
    v_item_label_field := 'type_name';
    v_category_name := coalesce(p_category_name, 'اسطوانات');
  elsif p_table_name = 'paints' then
    v_stock_field := 'stock_balance';
    v_item_label_field := 'item_name';
    v_category_name := coalesce(p_category_name, 'الدهانات');
  elsif p_table_name = 'screws' then
    v_stock_field := 'stock_balance';
    v_item_label_field := 'item_name';
    v_category_name := coalesce(p_category_name, 'مسامير');
  elsif p_table_name = 'stock_screws' then
    v_stock_field := 'stock_balance';
    v_item_label_field := 'item_name';
    v_category_name := coalesce(p_category_name, 'مسامير استوك');
  elsif p_table_name = 'raw_materials' then
    v_stock_field := 'stock_balance';
    v_item_label_field := 'item_name';
    v_category_name := coalesce(p_category_name, 'خامات');
  elsif p_table_name = 'inventory_items' then
    v_stock_field := 'stock_balance';
    v_item_label_field := 'item_name';
    v_category_name := p_category_name;
  else
    v_stock_field := 'stock_balance';
    v_item_label_field := 'item_name';
    v_category_name := coalesce(p_category_name, 'مستهلكات');
  end if;

  if p_table_name = 'cylinders' then
    execute format(
      'select coalesce(%I,0)::numeric, 0::numeric, 0::numeric, %I::text, project::text from public.%I where id = $1 for update',
      v_stock_field, v_item_label_field, p_table_name
    )
    into v_current_balance, v_total_added, v_total_issued, v_existing_item_name, v_existing_project
    using p_item_id;
  else
    execute format(
      'select coalesce(%I,0)::numeric, coalesce(total_added,0)::numeric, coalesce(total_issued,0)::numeric, %I::text, project::text from public.%I where id = $1 for update',
      v_stock_field, v_item_label_field, p_table_name
    )
    into v_current_balance, v_total_added, v_total_issued, v_existing_item_name, v_existing_project
    using p_item_id;
  end if;

  if v_current_balance is null then
    raise exception 'Item not found or not accessible: table %, id %', p_table_name, p_item_id using errcode = 'P0002';
  end if;

  if p_table_name = 'inventory_items' and v_category_name is null then
    select source_sheet into v_category_name from public.inventory_items where id = p_item_id;
  end if;

  if p_operation_type = 'add' then
    v_new_balance := v_current_balance + p_quantity;
    v_total_added := v_total_added + p_quantity;
    v_movement_quantity := p_quantity;
  elsif p_operation_type = 'issue' then
    if v_current_balance < p_quantity then
      raise exception 'Insufficient stock. Current balance %, requested %', v_current_balance, p_quantity using errcode = '22023';
    end if;
    v_new_balance := v_current_balance - p_quantity;
    v_total_issued := v_total_issued + p_quantity;
    v_movement_quantity := p_quantity;
  else
    v_new_balance := p_quantity;
    v_movement_quantity := abs(v_new_balance - v_current_balance);
  end if;

  if p_table_name = 'cylinders' then
    execute format(
      'update public.%I set %I = $1, stock_balance = $1, transaction_date = coalesce($2, transaction_date), updated_at = now() where id = $3 returning id',
      p_table_name, v_stock_field
    )
    into v_updated_id
    using v_new_balance, p_operation_date, p_item_id;
  else
    execute format(
      'update public.%I set %I = $1, total_added = $2, total_issued = $3, transaction_date = coalesce($4, transaction_date), updated_at = now() where id = $5 returning id',
      p_table_name, v_stock_field
    )
    into v_updated_id
    using v_new_balance, v_total_added, v_total_issued, p_operation_date, p_item_id;
  end if;

  if v_updated_id is null then
    raise exception 'Update failed: no row updated for table %, id %', p_table_name, p_item_id using errcode = 'P0002';
  end if;

  insert into public.inventory_operations(
    table_name, item_id, operation_type, quantity,
    project, project_name, category_label, category_name,
    item_label, item_name, previous_balance, new_balance,
    operation_date, notes, received_by, created_by,
    supplier_name, issued_to, purchase_order_number, item_code,
    source_category_row_id, source_table_name, source_row_type, import_key
  ) values (
    p_table_name, p_item_id, p_operation_type, v_movement_quantity,
    coalesce(p_project_name, v_existing_project), coalesce(p_project_name, v_existing_project),
    v_category_name, v_category_name,
    coalesce(p_item_name, v_existing_item_name), coalesce(p_item_name, v_existing_item_name),
    v_current_balance, v_new_balance,
    coalesce(p_operation_date, current_date), p_notes, p_received_by, coalesce(p_created_by, 'user'),
    p_supplier_name, p_issued_to, p_purchase_order_number, p_item_code,
    p_item_id, p_table_name, 'transactional_rpc', p_request_id
  ) returning id into v_operation_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'success',
    'request_id', p_request_id,
    'operation_id', v_operation_id,
    'item_id', p_item_id,
    'table_name', p_table_name,
    'operation_type', p_operation_type,
    'previous_balance', v_current_balance,
    'new_balance', v_new_balance,
    'quantity', v_movement_quantity,
    'total_added', v_total_added,
    'total_issued', v_total_issued
  );
end;
$function$;

-- 3) delete_inventory_operation_rpc: allow inventory_items ----------
create or replace function public.delete_inventory_operation_rpc(p_operation_id uuid, p_deleted_by text DEFAULT 'user'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_operation public.inventory_operations%rowtype;
  v_latest_id uuid;
  v_current_balance numeric;
  v_total_added numeric;
  v_total_issued numeric;
  v_stock_field text;
  v_deleted_snapshot jsonb;
  v_parent_issue public.inventory_operations%rowtype;
  v_parent_returned numeric;
  v_parent_status text;
begin
  select * into v_operation
  from public.inventory_operations
  where id = p_operation_id
  for update;

  if not found then
    raise exception 'Movement not found' using errcode = 'P0002';
  end if;

  if v_operation.table_name not in ('consumables','paints','screws','stock_screws','raw_materials','cylinders','inventory_items') then
    raise exception 'Unsupported inventory table: %', v_operation.table_name using errcode = '22023';
  end if;

  select id into v_latest_id
  from public.inventory_operations
  where table_name = v_operation.table_name
    and item_id = v_operation.item_id
  order by created_at desc nulls last, id desc
  limit 1;

  if v_latest_id is distinct from p_operation_id then
    raise exception 'Only the latest movement for this item can be deleted safely' using errcode = '22023';
  end if;

  if v_operation.previous_balance is null then
    raise exception 'Movement cannot be reversed because previous balance is missing' using errcode = '22023';
  end if;

  v_stock_field := case when v_operation.table_name = 'cylinders' then 'gas_balance' else 'stock_balance' end;

  if v_operation.table_name = 'cylinders' then
    execute format(
      'select coalesce(%I,0)::numeric from public.%I where id = $1 for update',
      v_stock_field, v_operation.table_name
    ) into v_current_balance using v_operation.item_id;

    if v_current_balance is null then
      raise exception 'Inventory item not found' using errcode = 'P0002';
    end if;

    execute format(
      'update public.%I set %I = $1, stock_balance = $1, updated_at = now() where id = $2',
      v_operation.table_name, v_stock_field
    ) using v_operation.previous_balance, v_operation.item_id;
  else
    execute format(
      'select coalesce(%I,0)::numeric, coalesce(total_added,0)::numeric, coalesce(total_issued,0)::numeric from public.%I where id = $1 for update',
      v_stock_field, v_operation.table_name
    ) into v_current_balance, v_total_added, v_total_issued using v_operation.item_id;

    if v_current_balance is null then
      raise exception 'Inventory item not found' using errcode = 'P0002';
    end if;

    if v_operation.operation_type = 'add' then
      v_total_added := greatest(0, v_total_added - v_operation.quantity);
    elsif v_operation.operation_type = 'issue' then
      if v_operation.returned_quantity > 0 then
        raise exception 'Cannot delete an issue movement that has returns' using errcode = '22023';
      end if;
      v_total_issued := greatest(0, v_total_issued - v_operation.quantity);
    elsif v_operation.operation_type not in ('adjust','return') then
      raise exception 'Unsupported movement type: %', v_operation.operation_type using errcode = '22023';
    end if;

    execute format(
      'update public.%I set %I = $1, total_added = $2, total_issued = $3, updated_at = now() where id = $4',
      v_operation.table_name, v_stock_field
    ) using v_operation.previous_balance, v_total_added, v_total_issued, v_operation.item_id;
  end if;

  if v_operation.operation_type = 'return' then
    if v_operation.related_operation_id is null then
      raise exception 'Return movement is missing its related issue movement' using errcode = '22023';
    end if;

    select * into v_parent_issue
    from public.inventory_operations
    where id = v_operation.related_operation_id
    for update;

    if not found or v_parent_issue.operation_type <> 'issue' then
      raise exception 'Related issue movement not found' using errcode = 'P0002';
    end if;

    v_parent_returned := greatest(0, v_parent_issue.returned_quantity - v_operation.quantity);
    v_parent_status := case
      when v_parent_returned = 0 then 'not_returned'
      when v_parent_returned < v_parent_issue.quantity then 'partially_returned'
      else 'fully_returned'
    end;

    update public.inventory_operations
    set returned_quantity = v_parent_returned,
        return_status = v_parent_status
    where id = v_parent_issue.id;
  end if;

  v_deleted_snapshot := to_jsonb(v_operation);

  insert into public.inventory_operation_deletions(operation_id, operation_snapshot, deleted_by)
  values (v_operation.id, v_deleted_snapshot, coalesce(nullif(btrim(p_deleted_by), ''), 'user'));

  delete from public.inventory_operations where id = p_operation_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'deleted',
    'operation_id', p_operation_id,
    'item_id', v_operation.item_id,
    'table_name', v_operation.table_name,
    'operation_type', v_operation.operation_type,
    'restored_balance', v_operation.previous_balance,
    'related_issue_operation_id', v_operation.related_operation_id
  );
end;
$function$;

-- 4) delete_inventory_record_permanently_rpc: allow inventory_items -
create or replace function public.delete_inventory_record_permanently_rpc(p_table_name text, p_record_id uuid, p_delete_movements boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_deleted_count integer := 0;
  v_deleted_movements_count integer := 0;
begin
  if p_table_name not in (
    'consumables',
    'paints',
    'screws',
    'stock_screws',
    'raw_materials',
    'cylinders',
    'cutting_discs',
    'long_welding_gloves',
    'inventory_items'
  ) then
    raise exception 'Unsupported table for delete: %', p_table_name using errcode = '22023';
  end if;

  if p_record_id is null then
    raise exception 'Record id is required' using errcode = '22023';
  end if;

  -- For normal stock tables, delete movement history first if requested.
  -- Custody tables do not use inventory_operations.
  if p_delete_movements and p_table_name in (
    'consumables',
    'paints',
    'screws',
    'stock_screws',
    'raw_materials',
    'cylinders',
    'inventory_items'
  ) then
    delete from public.inventory_operations
    where table_name = p_table_name
      and item_id = p_record_id;

    get diagnostics v_deleted_movements_count = row_count;
  end if;

  execute format('delete from public.%I where id = $1', p_table_name)
  using p_record_id;

  get diagnostics v_deleted_count = row_count;

  if v_deleted_count = 0 then
    raise exception 'Record not found or already deleted: table %, id %', p_table_name, p_record_id using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'ok', true,
    'table_name', p_table_name,
    'record_id', p_record_id,
    'deleted_count', v_deleted_count,
    'deleted_movements_count', v_deleted_movements_count
  );
end;
$function$;

-- 5) match_inventory_item_rpc: allow inventory_items (item_key /
--    internal_code matching only — no bespoke business-identity
--    branch since dynamic-category items don't come from Excel
--    imports).
create or replace function public.match_inventory_item_rpc(p_table_name text, p_item_key text DEFAULT NULL::text, p_internal_code text DEFAULT NULL::text, p_project_name text DEFAULT NULL::text, p_item_name text DEFAULT NULL::text, p_type_name text DEFAULT NULL::text, p_din text DEFAULT NULL::text, p_code_number text DEFAULT NULL::text, p_material_source text DEFAULT NULL::text, p_length numeric DEFAULT NULL::numeric, p_width numeric DEFAULT NULL::numeric, p_th numeric DEFAULT NULL::numeric, p_weight numeric DEFAULT NULL::numeric, p_dimension_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_allowed constant text[] := array['consumables','paints','screws','stock_screws','raw_materials','cylinders','inventory_items'];
  v_ids uuid[] := array[]::uuid[];
  v_match_method text;
  v_match_count integer := 0;
  v_id uuid;
  v_canonical_name text := coalesce(p_item_name, p_type_name);
  v_project text := public.normalize_inventory_identity_text(p_project_name);
  v_name text := public.normalize_inventory_identity_text(v_canonical_name);
  v_din text := public.normalize_inventory_identity_text(p_din);
  v_code text := public.normalize_inventory_identity_text(p_code_number);
  v_source text := public.normalize_inventory_identity_text(p_material_source);
  v_dimension text := public.normalize_inventory_identity_text(p_dimension_text);
begin
  if not (p_table_name = any(v_allowed)) then
    raise exception 'Unsupported inventory table: %', p_table_name using errcode = '22023';
  end if;

  if nullif(trim(coalesce(p_item_key,'')), '') is not null then
    execute format('select array_agg(id) from public.%I where item_key = $1 and coalesce(is_archived,false)=false', p_table_name)
      into v_ids using p_item_key;
    v_match_count := coalesce(array_length(v_ids,1),0);
    if v_match_count > 0 then v_match_method := 'item_key'; end if;
  end if;

  if v_match_count = 0 and nullif(trim(coalesce(p_internal_code,'')), '') is not null then
    execute format('select array_agg(id) from public.%I where internal_code = $1 and coalesce(is_archived,false)=false', p_table_name)
      into v_ids using trim(p_internal_code);
    v_match_count := coalesce(array_length(v_ids,1),0);
    if v_match_count > 0 then v_match_method := 'internal_code'; end if;
  end if;

  if v_match_count = 0 then
    if p_table_name in ('consumables','paints') then
      execute format(
        'select array_agg(id) from public.%I where coalesce(is_archived,false)=false and public.normalize_inventory_identity_text(project) is not distinct from $1 and public.normalize_inventory_identity_text(item_name) is not distinct from $2',
        p_table_name
      ) into v_ids using v_project, v_name;
      v_match_method := 'project_item_name';

    elsif p_table_name in ('screws','stock_screws') then
      execute format(
        'select array_agg(id) from public.%I where coalesce(is_archived,false)=false and public.normalize_inventory_identity_text(project) is not distinct from $1 and public.normalize_inventory_identity_text(item_name) is not distinct from $2 and ($3 is null or public.normalize_inventory_identity_text(din) is not distinct from $3) and ($4 is null or public.normalize_inventory_identity_text(code_number) is not distinct from $4)',
        p_table_name
      ) into v_ids using v_project, v_name, v_din, v_code;
      v_match_method := 'screw_business_identity';

    elsif p_table_name = 'raw_materials' then
      select array_agg(id) into v_ids
      from public.raw_materials
      where coalesce(is_archived,false)=false
        and public.normalize_inventory_identity_text(project) is not distinct from v_project
        and public.normalize_inventory_identity_text(item_name) is not distinct from v_name
        and (v_source is null or public.normalize_inventory_identity_text(material_source) is not distinct from v_source)
        and (p_length is null or length is not distinct from p_length)
        and (p_width is null or width is not distinct from p_width)
        and (p_th is null or th is not distinct from p_th)
        and (p_weight is null or weight is not distinct from p_weight)
        and (v_code is null or public.normalize_inventory_identity_text(code_number) is not distinct from v_code)
        and (v_din is null or public.normalize_inventory_identity_text(din) is not distinct from v_din)
        and (v_dimension is null or public.normalize_inventory_identity_text(dimension_text) is not distinct from v_dimension);
      v_match_method := 'raw_material_business_identity';

    elsif p_table_name = 'cylinders' then
      select array_agg(id) into v_ids
      from public.cylinders
      where coalesce(is_archived,false)=false
        and public.normalize_inventory_identity_text(project) is not distinct from v_project
        and public.normalize_inventory_identity_text(type_name) is not distinct from v_name;
      v_match_method := 'project_type_name';
    end if;

    v_match_count := coalesce(array_length(v_ids,1),0);
  end if;

  if v_match_count = 1 then
    v_id := v_ids[1];
    return jsonb_build_object(
      'status','matched',
      'item_id',v_id,
      'match_method',v_match_method,
      'match_count',1
    );
  elsif v_match_count > 1 then
    return jsonb_build_object(
      'status','ambiguous',
      'item_id',null,
      'match_method',v_match_method,
      'match_count',v_match_count,
      'candidate_ids',to_jsonb(v_ids)
    );
  end if;

  return jsonb_build_object(
    'status','not_found',
    'item_id',null,
    'match_method',null,
    'match_count',0
  );
end;
$function$;

-- 6) return_inventory_item_rpc: allow inventory_items ---------------
create or replace function public.return_inventory_item_rpc(p_issue_operation_id uuid, p_quantity numeric, p_operation_date date DEFAULT CURRENT_DATE, p_received_by text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_created_by text DEFAULT 'user'::text, p_request_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_issue public.inventory_operations%rowtype;
  v_stock_field text;
  v_current_balance numeric;
  v_new_balance numeric;
  v_total_added numeric := 0;
  v_total_issued numeric := 0;
  v_available_to_return numeric;
  v_new_returned_quantity numeric;
  v_new_return_status text;
  v_operation_id uuid;
  v_existing public.inventory_operations%rowtype;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Return quantity must be greater than zero' using errcode = '22023';
  end if;

  p_request_id := nullif(btrim(p_request_id), '');

  if p_request_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('inventory-return:' || p_request_id, 0));

    select * into v_existing
    from public.inventory_operations
    where import_key = p_request_id
    limit 1;

    if found then
      return jsonb_build_object(
        'ok', true,
        'status', 'already_processed',
        'operation_id', v_existing.id,
        'related_issue_operation_id', v_existing.related_operation_id,
        'request_id', p_request_id,
        'previous_balance', v_existing.previous_balance,
        'new_balance', v_existing.new_balance,
        'quantity', v_existing.quantity,
        'employee_id', v_existing.employee_id
      );
    end if;
  end if;

  select * into v_issue
  from public.inventory_operations
  where id = p_issue_operation_id
  for update;

  if not found then
    raise exception 'Issue movement not found' using errcode = 'P0002';
  end if;

  if v_issue.operation_type <> 'issue' then
    raise exception 'Only issue movements can have returned quantities' using errcode = '22023';
  end if;

  if v_issue.table_name not in ('consumables','paints','screws','stock_screws','raw_materials','cylinders','inventory_items') then
    raise exception 'Unsupported inventory table: %', v_issue.table_name using errcode = '22023';
  end if;

  v_available_to_return := v_issue.quantity - v_issue.returned_quantity;

  if v_available_to_return <= 0 then
    raise exception 'This issue movement has already been fully returned' using errcode = '22023';
  end if;

  if p_quantity > v_available_to_return then
    raise exception 'Return quantity exceeds the remaining issued quantity. Available: %', v_available_to_return using errcode = '22023';
  end if;

  v_stock_field := case when v_issue.table_name = 'cylinders' then 'gas_balance' else 'stock_balance' end;

  if v_issue.table_name = 'cylinders' then
    execute format(
      'select coalesce(%I,0)::numeric from public.%I where id = $1 for update',
      v_stock_field, v_issue.table_name
    ) into v_current_balance using v_issue.item_id;
  else
    execute format(
      'select coalesce(%I,0)::numeric, coalesce(total_added,0)::numeric, coalesce(total_issued,0)::numeric from public.%I where id = $1 for update',
      v_stock_field, v_issue.table_name
    ) into v_current_balance, v_total_added, v_total_issued using v_issue.item_id;
  end if;

  if v_current_balance is null then
    raise exception 'Inventory item not found' using errcode = 'P0002';
  end if;

  v_new_balance := v_current_balance + p_quantity;
  v_new_returned_quantity := v_issue.returned_quantity + p_quantity;
  v_new_return_status := case
    when v_new_returned_quantity >= v_issue.quantity then 'fully_returned'
    else 'partially_returned'
  end;

  if v_issue.table_name = 'cylinders' then
    execute format(
      'update public.%I set %I = $1, stock_balance = $1, transaction_date = coalesce($2, transaction_date), updated_at = now() where id = $3',
      v_issue.table_name, v_stock_field
    ) using v_new_balance, p_operation_date, v_issue.item_id;
  else
    execute format(
      'update public.%I set %I = $1, transaction_date = coalesce($2, transaction_date), updated_at = now() where id = $3',
      v_issue.table_name, v_stock_field
    ) using v_new_balance, p_operation_date, v_issue.item_id;
  end if;

  update public.inventory_operations
  set returned_quantity = v_new_returned_quantity,
      return_status = v_new_return_status
  where id = p_issue_operation_id;

  insert into public.inventory_operations(
    table_name, item_id, operation_type, quantity,
    project, project_id, project_name,
    category_label, category_name,
    item_label, item_name,
    previous_balance, new_balance,
    operation_date, notes,
    received_by, created_by,
    issue_code, addition_code,
    issued_to, supplier_name, purchase_order_number, item_code,
    source_category_row_id, source_table_name, source_row_type,
    import_id, import_key, related_operation_id,
    returned_quantity, return_status,
    employee_id, supplier_id
  ) values (
    v_issue.table_name, v_issue.item_id, 'return', p_quantity,
    v_issue.project, v_issue.project_id, v_issue.project_name,
    v_issue.category_label, v_issue.category_name,
    v_issue.item_label, v_issue.item_name,
    v_current_balance, v_new_balance,
    coalesce(p_operation_date, current_date), p_notes,
    coalesce(p_received_by, v_issue.issued_to, v_issue.received_by), coalesce(nullif(btrim(p_created_by), ''), 'user'),
    v_issue.issue_code, null,
    v_issue.issued_to, v_issue.supplier_name, v_issue.purchase_order_number, v_issue.item_code,
    v_issue.source_category_row_id, v_issue.source_table_name, 'return_rpc',
    v_issue.import_id, p_request_id, p_issue_operation_id,
    0, 'not_returned',
    v_issue.employee_id, null
  ) returning id into v_operation_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'success',
    'operation_id', v_operation_id,
    'related_issue_operation_id', p_issue_operation_id,
    'table_name', v_issue.table_name,
    'item_id', v_issue.item_id,
    'operation_type', 'return',
    'quantity', p_quantity,
    'previous_balance', v_current_balance,
    'new_balance', v_new_balance,
    'issued_quantity', v_issue.quantity,
    'returned_quantity', v_new_returned_quantity,
    'remaining_returnable_quantity', v_issue.quantity - v_new_returned_quantity,
    'return_status', v_new_return_status,
    'employee_id', v_issue.employee_id,
    'total_added', v_total_added,
    'total_issued', v_total_issued,
    'request_id', p_request_id
  );
end;
$function$;

-- 7) update_inventory_item_details_rpc: allow inventory_items -------
create or replace function public.update_inventory_item_details_rpc(p_table_name text, p_item_id uuid, p_patch jsonb, p_adjust_date date DEFAULT CURRENT_DATE, p_notes text DEFAULT NULL::text, p_updated_by text DEFAULT 'user'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_allowed_tables text[] := array[
    'consumables',
    'paints',
    'screws',
    'stock_screws',
    'raw_materials',
    'cylinders',
    'cutting_discs',
    'long_welding_gloves',
    'inventory_items'
  ];
  v_table regclass;
  v_key text;
  v_value jsonb;
  v_updates text := '';
  v_sep text := '';
  v_col_type text;
  v_old_balance numeric;
  v_new_balance numeric;
  v_balance_col text;
  v_item_name text;
  v_project text;
  v_category_name text;
  v_quantity numeric;
  v_sql text;
  v_result jsonb;
begin
  if p_table_name is null or not (p_table_name = any(v_allowed_tables)) then
    raise exception 'Table % is not allowed', p_table_name;
  end if;

  if p_patch is null or p_patch = '{}'::jsonb then
    raise exception 'No fields sent to update';
  end if;

  v_table := format('public.%I', p_table_name)::regclass;

  if p_table_name = 'cylinders' then
    v_balance_col := 'gas_balance';
  elsif p_table_name in ('cutting_discs', 'long_welding_gloves') then
    v_balance_col := null;
  else
    v_balance_col := 'stock_balance';
  end if;

  -- Read old balance if applicable
  if v_balance_col is not null then
    execute format('select coalesce(%I,0) from %s where id = $1', v_balance_col, v_table)
      into v_old_balance
      using p_item_id;
  end if;

  -- Build update statement only from columns that actually exist in the table.
  for v_key, v_value in select key, value from jsonb_each(p_patch)
  loop
    select data_type
      into v_col_type
    from information_schema.columns
    where table_schema = 'public'
      and table_name = p_table_name
      and column_name = v_key;

    if v_col_type is null then
      raise exception 'Column % is not allowed for table %', v_key, p_table_name;
    end if;

    -- Do not allow changing primary/system generated fields through this RPC
    if v_key in ('id', 'created_at', 'updated_at') then
      raise exception 'Column % cannot be updated manually', v_key;
    end if;

    v_updates := v_updates || v_sep || format('%I = ', v_key) ||
      case
        when v_value = 'null'::jsonb then 'null'
        when v_col_type in ('integer', 'bigint', 'smallint') then format('(%L)::bigint', trim(both '"' from v_value::text))
        when v_col_type = 'numeric' then format('(%L)::numeric', trim(both '"' from v_value::text))
        when v_col_type = 'boolean' then format('(%L)::boolean', trim(both '"' from v_value::text))
        when v_col_type = 'date' then format('(%L)::date', trim(both '"' from v_value::text))
        when v_col_type like 'timestamp%' then format('(%L)::timestamptz', trim(both '"' from v_value::text))
        else format('%L', trim(both '"' from v_value::text))
      end;
    v_sep := ', ';
  end loop;

  -- Always update updated_at if the column exists
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = p_table_name
      and column_name = 'updated_at'
  ) then
    v_updates := v_updates || v_sep || 'updated_at = now()';
  end if;

  v_sql := format('update %s set %s where id = $1 returning to_jsonb(%s.*)', v_table, v_updates, p_table_name);
  execute v_sql into v_result using p_item_id;

  if v_result is null then
    raise exception 'Item not found in table % with id %', p_table_name, p_item_id;
  end if;

  -- Read new balance and record adjust movement if balance changed
  if v_balance_col is not null then
    execute format('select coalesce(%I,0) from %s where id = $1', v_balance_col, v_table)
      into v_new_balance
      using p_item_id;

    if coalesce(v_old_balance,0) <> coalesce(v_new_balance,0) then
      v_quantity := abs(coalesce(v_new_balance,0) - coalesce(v_old_balance,0));

      if p_table_name = 'cylinders' then
        execute format('select type_name, null::text from %s where id = $1', v_table)
          into v_item_name, v_project
          using p_item_id;
        v_category_name := 'اسطوانات';
      else
        execute format('select item_name, project from %s where id = $1', v_table)
          into v_item_name, v_project
          using p_item_id;

        v_category_name := case p_table_name
          when 'consumables' then 'مستهلكات'
          when 'paints' then 'الدهانات'
          when 'screws' then 'مسامير'
          when 'stock_screws' then 'مسامير استوك'
          when 'raw_materials' then 'خامات'
          else p_table_name
        end;

        if p_table_name = 'inventory_items' then
          select source_sheet into v_category_name from public.inventory_items where id = p_item_id;
        end if;
      end if;

      insert into public.inventory_operations (
        table_name,
        item_id,
        operation_type,
        quantity,
        project,
        project_name,
        category_label,
        category_name,
        item_label,
        item_name,
        previous_balance,
        new_balance,
        operation_date,
        notes,
        created_by
      ) values (
        p_table_name,
        p_item_id,
        'adjust',
        v_quantity,
        v_project,
        v_project,
        v_category_name,
        v_category_name,
        v_item_name,
        v_item_name,
        coalesce(v_old_balance,0),
        coalesce(v_new_balance,0),
        coalesce(p_adjust_date, current_date),
        coalesce(p_notes, 'تعديل رصيد من شاشة تعديل الصنف'),
        coalesce(p_updated_by, 'user')
      );
    end if;
  end if;

  return jsonb_build_object(
    'success', true,
    'table_name', p_table_name,
    'item_id', p_item_id,
    'updated_item', v_result,
    'balance_changed', coalesce(v_old_balance,0) <> coalesce(v_new_balance,0),
    'previous_balance', v_old_balance,
    'new_balance', v_new_balance
  );
end;
$function$;

-- 8) update_inventory_item_details_with_version_rpc: allow inventory_items
create or replace function public.update_inventory_item_details_with_version_rpc(p_table_name text, p_item_id uuid, p_patch jsonb, p_base_updated_at timestamp with time zone, p_adjust_date date DEFAULT NULL::date, p_notes text DEFAULT NULL::text, p_updated_by text DEFAULT 'offline-user'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_table text := lower(trim(coalesce(p_table_name, '')));
  v_current_updated_at timestamptz;
  v_server_row jsonb;
  v_result jsonb;
begin
  if v_table not in ('consumables', 'paints', 'screws', 'stock_screws', 'raw_materials', 'cylinders', 'inventory_items') then
    raise exception 'Unsupported stock table: %', p_table_name;
  end if;

  if p_item_id is null then
    raise exception 'p_item_id is required';
  end if;

  execute format('select updated_at from public.%I where id = $1', v_table)
    into v_current_updated_at
    using p_item_id;

  if v_current_updated_at is null then
    return jsonb_build_object('ok', false, 'conflict', false, 'reason', 'not_found');
  end if;

  if p_base_updated_at is not null and v_current_updated_at <> p_base_updated_at then
    execute format('select to_jsonb(t) from public.%I t where t.id = $1', v_table)
      into v_server_row
      using p_item_id;

    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'reason', 'stale_version',
      'server_updated_at', v_current_updated_at,
      'server_row', v_server_row
    );
  end if;

  v_result := public.update_inventory_item_details_rpc(
    v_table,
    p_item_id,
    coalesce(p_patch, '{}'::jsonb) - 'internal_code' - 'id',
    p_adjust_date,
    p_notes,
    p_updated_by
  );

  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object('conflict', false);
end;
$function$;

-- 9) get_used_project_names: include inventory_items.project --------
create or replace function public.get_used_project_names()
 RETURNS TABLE(name text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select btrim(project) from public.consumables where nullif(btrim(project), '') is not null
  union select btrim(project) from public.paints where nullif(btrim(project), '') is not null
  union select btrim(project) from public.screws where nullif(btrim(project), '') is not null
  union select btrim(project) from public.stock_screws where nullif(btrim(project), '') is not null
  union select btrim(project) from public.raw_materials where nullif(btrim(project), '') is not null
  union select btrim(project) from public.cylinders where nullif(btrim(project), '') is not null
  union select btrim(project) from public.inventory_items where nullif(btrim(project), '') is not null
  union select btrim(project) from public.inventory_operations where nullif(btrim(project), '') is not null
  union select btrim(project_name) from public.inventory_operations where nullif(btrim(project_name), '') is not null;
$function$;

-- 10) prevent_used_project_rename: guard inventory_items too --------
create or replace function public.prevent_used_project_rename()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.name is distinct from old.name and (
    exists (select 1 from public.consumables where project = old.name)
    or exists (select 1 from public.paints where project = old.name)
    or exists (select 1 from public.screws where project = old.name)
    or exists (select 1 from public.stock_screws where project = old.name)
    or exists (select 1 from public.raw_materials where project = old.name)
    or exists (select 1 from public.cylinders where project = old.name)
    or exists (select 1 from public.inventory_items where project = old.name)
    or exists (select 1 from public.inventory_operations where project = old.name)
    or exists (select 1 from public.inventory_operations where project_name = old.name)
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'لا يمكن تعديل اسم هذا القسم لأنه مرتبط بأصناف أو حركات مخزون. يمكنك إنشاء قسم جديد بالاسم الصحيح وإيقاف القسم القديم.';
  end if;
  return new;
end;
$function$;

-- 11) record_new_stock_item_as_add_movement: recognize inventory_items
--     and attach the same "auto add-movement on insert" trigger used by
--     the existing standard-stock tables.
create or replace function public.record_new_stock_item_as_add_movement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_table_name text := TG_TABLE_NAME;
  v_category_name text;
  v_item_name text;
  v_project_name text;
  v_quantity numeric := 0;
  v_operation_date date;
begin
  -- Bulk normalized JSON imports set source_file to this value.
  -- Their movements are imported separately from json.movements.
  if coalesce(new.source_file, '') = 'normalized_json_import' then
    return new;
  end if;

  v_category_name := case v_table_name
    when 'consumables' then 'مستهلكات'
    when 'paints' then 'الدهانات'
    when 'screws' then 'مسامير'
    when 'stock_screws' then 'مسامير استوك'
    when 'raw_materials' then 'خامات'
    when 'cylinders' then 'اسطوانات'
    when 'inventory_items' then coalesce(new.source_sheet, 'قسم جديد')
    else v_table_name
  end;

  if v_table_name = 'cylinders' then
    v_item_name := new.type_name;
    v_project_name := null;
    v_quantity := coalesce(new.gas_balance, new.full_count, 0);
  else
    v_item_name := new.item_name;
    v_project_name := new.project;
    v_quantity := coalesce(nullif(new.added, 0), nullif(new.total_added, 0), nullif(new.stock_balance, 0), 0);
  end if;

  v_operation_date := coalesce(new.transaction_date, current_date);

  if coalesce(v_quantity, 0) > 0 then
    insert into public.inventory_operations (
      table_name,
      item_id,
      operation_type,
      quantity,
      project,
      project_name,
      category_name,
      category_label,
      item_name,
      item_label,
      previous_balance,
      new_balance,
      operation_date,
      notes,
      created_by,
      source_category_row_id,
      source_table_name,
      source_row_type
    ) values (
      v_table_name,
      new.id,
      'add',
      v_quantity,
      v_project_name,
      v_project_name,
      v_category_name,
      v_category_name,
      v_item_name,
      v_item_name,
      0,
      v_quantity,
      v_operation_date,
      'حركة إضافة تلقائية عند إنشاء صنف جديد',
      'system',
      new.id,
      v_table_name,
      'new_item_trigger'
    );
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_record_new_inventory_item_as_add on public.inventory_items;
create trigger trg_record_new_inventory_item_as_add
  after insert on public.inventory_items
  for each row execute function public.record_new_stock_item_as_add_movement();

-- 12) Views: UNION inventory_items into the category summary and
--     movements views. (Custody view is intentionally left untouched —
--     dynamic categories only use the standard stock model.)

create or replace view public.inventory_category_items_summary_view as
 SELECT 'consumables'::text AS table_name,
    'مستهلكات'::text AS category_name,
    c.id AS item_id,
    c.item_key,
    c.project AS project_name,
    c.item_name,
    c.stock_balance,
    c.min_quantity,
        CASE
            WHEN (COALESCE(c.stock_balance, (0)::numeric) <= (0)::numeric) THEN 'منتهي'::text
            WHEN (COALESCE(c.stock_balance, (0)::numeric) <= COALESCE(c.min_quantity, (0)::numeric)) THEN 'قليل'::text
            ELSE 'آمن'::text
        END AS status,
    c.total_added,
    c.total_issued,
    (1)::bigint AS source_rows_count,
    NULL::numeric AS weight,
    NULL::numeric AS length,
    NULL::numeric AS width,
    NULL::numeric AS th,
    NULL::text AS material_source,
    NULL::date AS expire_date,
    c.supplier_name,
    c.notes,
    c.updated_at,
    c.created_at,
    NULL::text AS code_number,
    NULL::text AS din,
    c.internal_code
   FROM consumables c
  WHERE (COALESCE(c.is_archived, false) = false)
UNION ALL
 SELECT 'paints'::text AS table_name,
    'الدهانات'::text AS category_name,
    p.id AS item_id,
    p.item_key,
    p.project AS project_name,
    p.item_name,
    p.stock_balance,
    p.min_quantity,
        CASE
            WHEN (COALESCE(p.stock_balance, (0)::numeric) <= (0)::numeric) THEN 'منتهي'::text
            WHEN (COALESCE(p.stock_balance, (0)::numeric) <= COALESCE(p.min_quantity, (0)::numeric)) THEN 'قليل'::text
            ELSE 'آمن'::text
        END AS status,
    p.total_added,
    p.total_issued,
    (1)::bigint AS source_rows_count,
    NULL::numeric AS weight,
    NULL::numeric AS length,
    NULL::numeric AS width,
    NULL::numeric AS th,
    NULL::text AS material_source,
    p.expire_date,
    p.supplier_name,
    p.notes,
    p.updated_at,
    p.created_at,
    NULL::text AS code_number,
    NULL::text AS din,
    p.internal_code
   FROM paints p
  WHERE (COALESCE(p.is_archived, false) = false)
UNION ALL
 SELECT 'screws'::text AS table_name,
    'مسامير'::text AS category_name,
    s.id AS item_id,
    s.item_key,
    s.project AS project_name,
    s.item_name,
    s.stock_balance,
    s.min_quantity,
        CASE
            WHEN (COALESCE(s.stock_balance, (0)::numeric) <= (0)::numeric) THEN 'منتهي'::text
            WHEN (COALESCE(s.stock_balance, (0)::numeric) <= COALESCE(s.min_quantity, (0)::numeric)) THEN 'قليل'::text
            ELSE 'آمن'::text
        END AS status,
    s.total_added,
    s.total_issued,
    (1)::bigint AS source_rows_count,
    NULL::numeric AS weight,
    NULL::numeric AS length,
    NULL::numeric AS width,
    NULL::numeric AS th,
    NULL::text AS material_source,
    NULL::date AS expire_date,
    s.supplier_name,
    s.notes,
    s.updated_at,
    s.created_at,
    s.code_number,
    s.din,
    s.internal_code
   FROM screws s
  WHERE (COALESCE(s.is_archived, false) = false)
UNION ALL
 SELECT 'stock_screws'::text AS table_name,
    'مسامير استوك'::text AS category_name,
    ss.id AS item_id,
    ss.item_key,
    ss.project AS project_name,
    ss.item_name,
    ss.stock_balance,
    ss.min_quantity,
        CASE
            WHEN (COALESCE(ss.stock_balance, (0)::numeric) <= (0)::numeric) THEN 'منتهي'::text
            WHEN (COALESCE(ss.stock_balance, (0)::numeric) <= COALESCE(ss.min_quantity, (0)::numeric)) THEN 'قليل'::text
            ELSE 'آمن'::text
        END AS status,
    ss.total_added,
    ss.total_issued,
    (1)::bigint AS source_rows_count,
    NULL::numeric AS weight,
    NULL::numeric AS length,
    NULL::numeric AS width,
    NULL::numeric AS th,
    NULL::text AS material_source,
    NULL::date AS expire_date,
    ss.supplier_name,
    ss.notes,
    ss.updated_at,
    ss.created_at,
    ss.code_number,
    ss.din,
    ss.internal_code
   FROM stock_screws ss
  WHERE (COALESCE(ss.is_archived, false) = false)
UNION ALL
 SELECT 'raw_materials'::text AS table_name,
    'خامات'::text AS category_name,
    r.id AS item_id,
    r.item_key,
    r.project AS project_name,
    r.item_name,
    r.stock_balance,
    r.min_quantity,
        CASE
            WHEN (COALESCE(r.stock_balance, (0)::numeric) <= (0)::numeric) THEN 'منتهي'::text
            WHEN (COALESCE(r.stock_balance, (0)::numeric) <= COALESCE(r.min_quantity, (0)::numeric)) THEN 'قليل'::text
            ELSE 'آمن'::text
        END AS status,
    r.total_added,
    r.total_issued,
    (1)::bigint AS source_rows_count,
    r.weight,
    r.length,
    r.width,
    r.th,
    r.material_source,
    NULL::date AS expire_date,
    r.supplier_name,
    r.notes,
    r.updated_at,
    r.created_at,
    r.code_number,
    r.din,
    r.internal_code
   FROM raw_materials r
  WHERE (COALESCE(r.is_archived, false) = false)
UNION ALL
 SELECT 'cylinders'::text AS table_name,
    'اسطوانات'::text AS category_name,
    cy.id AS item_id,
    cy.item_key,
    cy.project AS project_name,
    cy.type_name AS item_name,
    cy.gas_balance AS stock_balance,
    COALESCE(cy.min_quantity, (0)::numeric) AS min_quantity,
        CASE
            WHEN (COALESCE(cy.gas_balance, (0)::numeric) <= (0)::numeric) THEN 'منتهي'::text
            WHEN (COALESCE(cy.gas_balance, (0)::numeric) <= COALESCE(cy.min_quantity, (0)::numeric)) THEN 'قليل'::text
            ELSE 'آمن'::text
        END AS status,
    cy.full_count AS total_added,
    cy.empty_count AS total_issued,
    (1)::bigint AS source_rows_count,
    NULL::numeric AS weight,
    NULL::numeric AS length,
    NULL::numeric AS width,
    NULL::numeric AS th,
    NULL::text AS material_source,
    NULL::date AS expire_date,
    cy.supplier_name,
    cy.notes,
    cy.updated_at,
    cy.created_at,
    NULL::text AS code_number,
    NULL::text AS din,
    cy.internal_code
   FROM cylinders cy
  WHERE (COALESCE(cy.is_archived, false) = false)
UNION ALL
 SELECT 'inventory_items'::text AS table_name,
    COALESCE(cat.name, i.source_sheet, 'غير مصنف'::text) AS category_name,
    i.id AS item_id,
    i.item_key,
    i.project AS project_name,
    i.item_name,
    i.stock_balance,
    i.min_quantity,
        CASE
            WHEN (COALESCE(i.stock_balance, (0)::numeric) <= (0)::numeric) THEN 'منتهي'::text
            WHEN (COALESCE(i.stock_balance, (0)::numeric) <= COALESCE(i.min_quantity, (0)::numeric)) THEN 'قليل'::text
            ELSE 'آمن'::text
        END AS status,
    i.total_added,
    i.total_issued,
    (1)::bigint AS source_rows_count,
    NULL::numeric AS weight,
    NULL::numeric AS length,
    NULL::numeric AS width,
    NULL::numeric AS th,
    NULL::text AS material_source,
    NULL::date AS expire_date,
    i.supplier_name,
    i.notes,
    i.updated_at,
    i.created_at,
    NULL::text AS code_number,
    NULL::text AS din,
    i.internal_code
   FROM inventory_items i
   LEFT JOIN categories cat ON cat.id = i.category_id
  WHERE (COALESCE(i.is_archived, false) = false);

create or replace view public.inventory_item_movements_view as
 SELECT op.id,
    op.table_name,
        CASE
            WHEN (op.table_name = 'cones4_materials'::text) THEN 'raw_materials'::text
            ELSE op.table_name
        END AS display_table_name,
    COALESCE(op.category_name, op.category_label) AS category_name,
    op.category_label,
    op.item_id,
    op.item_name,
    op.item_label,
    op.project_name,
    op.project,
    op.operation_type,
    op.quantity,
    op.operation_date,
        CASE
            WHEN (op.operation_type = 'issue'::text) THEN op.quantity
            ELSE (0)::numeric
        END AS issued_quantity,
        CASE
            WHEN (op.operation_type = 'add'::text) THEN op.quantity
            ELSE (0)::numeric
        END AS added_quantity,
    op.previous_balance,
    op.new_balance,
    sum(
        CASE
            WHEN (op.operation_type = 'add'::text) THEN op.quantity
            ELSE (0)::numeric
        END) OVER (PARTITION BY op.table_name, op.item_id ORDER BY op.operation_date, op.created_at, op.id) AS total_added_until_operation,
    sum(
        CASE
            WHEN (op.operation_type = 'issue'::text) THEN op.quantity
            ELSE (0)::numeric
        END) OVER (PARTITION BY op.table_name, op.item_id ORDER BY op.operation_date, op.created_at, op.id) AS total_issued_until_operation,
    COALESCE(op.supplier_name, rm.supplier_name, sc.supplier_name, ss.supplier_name, co.supplier_name, pa.supplier_name, cy.supplier_name, ii.supplier_name) AS supplier_name,
    op.issued_to,
    op.received_by,
    op.purchase_order_number,
    op.addition_code,
    op.issue_code,
    op.item_code,
        CASE
            WHEN (op.table_name = 'raw_materials'::text) THEN rm.weight
            ELSE NULL::numeric
        END AS weight,
        CASE
            WHEN (op.table_name = 'raw_materials'::text) THEN rm.length
            ELSE NULL::numeric
        END AS length,
        CASE
            WHEN (op.table_name = 'raw_materials'::text) THEN rm.width
            ELSE NULL::numeric
        END AS width,
        CASE
            WHEN (op.table_name = 'raw_materials'::text) THEN rm.th
            ELSE NULL::numeric
        END AS th,
        CASE
            WHEN (op.table_name = 'raw_materials'::text) THEN rm.material_source
            ELSE NULL::text
        END AS material_source,
    op.notes,
    op.created_by,
    op.created_at,
    COALESCE(
        CASE
            WHEN (op.table_name = 'raw_materials'::text) THEN rm.code_number
            ELSE NULL::text
        END,
        CASE
            WHEN (op.table_name = 'screws'::text) THEN sc.code_number
            ELSE NULL::text
        END,
        CASE
            WHEN (op.table_name = 'stock_screws'::text) THEN ss.code_number
            ELSE NULL::text
        END, op.item_code) AS code_number,
    COALESCE(
        CASE
            WHEN (op.table_name = 'raw_materials'::text) THEN rm.din
            ELSE NULL::text
        END,
        CASE
            WHEN (op.table_name = 'screws'::text) THEN sc.din
            ELSE NULL::text
        END,
        CASE
            WHEN (op.table_name = 'stock_screws'::text) THEN ss.din
            ELSE NULL::text
        END) AS din,
    COALESCE(
        CASE
            WHEN (op.table_name = 'raw_materials'::text) THEN rm.internal_code
            ELSE NULL::text
        END,
        CASE
            WHEN (op.table_name = 'screws'::text) THEN sc.internal_code
            ELSE NULL::text
        END,
        CASE
            WHEN (op.table_name = 'stock_screws'::text) THEN ss.internal_code
            ELSE NULL::text
        END,
        CASE
            WHEN (op.table_name = 'consumables'::text) THEN co.internal_code
            ELSE NULL::text
        END,
        CASE
            WHEN (op.table_name = 'paints'::text) THEN pa.internal_code
            ELSE NULL::text
        END,
        CASE
            WHEN (op.table_name = 'cylinders'::text) THEN cy.internal_code
            ELSE NULL::text
        END,
        CASE
            WHEN (op.table_name = 'inventory_items'::text) THEN ii.internal_code
            ELSE NULL::text
        END) AS internal_code,
        CASE
            WHEN (op.operation_type = 'issue'::text) THEN COALESCE(return_totals.returned_quantity, (0)::numeric)
            WHEN (op.operation_type = 'return'::text) THEN op.quantity
            ELSE (0)::numeric
        END AS returned_quantity,
        CASE
            WHEN (op.operation_type <> 'issue'::text) THEN 'not_returned'::text
            WHEN (COALESCE(return_totals.returned_quantity, (0)::numeric) <= (0)::numeric) THEN 'not_returned'::text
            WHEN (COALESCE(return_totals.returned_quantity, (0)::numeric) >= op.quantity) THEN 'fully_returned'::text
            ELSE 'partially_returned'::text
        END AS return_status,
        CASE
            WHEN (op.operation_type = 'issue'::text) THEN GREATEST((op.quantity - COALESCE(return_totals.returned_quantity, (0)::numeric)), (0)::numeric)
            ELSE (0)::numeric
        END AS remaining_returnable_quantity,
    op.related_operation_id,
    original_issue.issued_to AS original_issued_to,
    original_issue.operation_date AS original_issue_date,
    original_issue.issue_code AS original_issue_code
   FROM inventory_operations op
     LEFT JOIN raw_materials rm ON (op.table_name = 'raw_materials'::text) AND (op.item_id = rm.id)
     LEFT JOIN screws sc ON (op.table_name = 'screws'::text) AND (op.item_id = sc.id)
     LEFT JOIN stock_screws ss ON (op.table_name = 'stock_screws'::text) AND (op.item_id = ss.id)
     LEFT JOIN consumables co ON (op.table_name = 'consumables'::text) AND (op.item_id = co.id)
     LEFT JOIN paints pa ON (op.table_name = 'paints'::text) AND (op.item_id = pa.id)
     LEFT JOIN cylinders cy ON (op.table_name = 'cylinders'::text) AND (op.item_id = cy.id)
     LEFT JOIN inventory_items ii ON (op.table_name = 'inventory_items'::text) AND (op.item_id = ii.id)
     LEFT JOIN inventory_operations original_issue ON (original_issue.id = op.related_operation_id)
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(return_op.quantity), (0)::numeric) AS returned_quantity
           FROM inventory_operations return_op
          WHERE (return_op.related_operation_id = op.id) AND (return_op.operation_type = 'return'::text)) return_totals ON (true);
