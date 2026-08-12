-- Archived-safety guard for dynamic inventory items (public.inventory_items).
--
-- Bug: a stock-changing operation (add/issue/adjust/return) could still be
-- applied to an inventory_items row even when the item itself is archived,
-- or when its parent public.categories row is archived. Frontend disabled
-- buttons are not a backend guarantee.
--
-- Fix: enforce the guard inside the shared, already-transactional layers
-- that actually lock the inventory_items row and mutate its stock:
--   - public.apply_inventory_operation_transactional_rpc (both overloads;
--     both are directly grantable to anon/authenticated, and both are the
--     function that apply_inventory_operation_with_party_rpc calls for
--     add/issue/adjust)
--   - public.return_inventory_item_rpc (the function that
--     return_inventory_item_with_employee_rpc calls for returns)
--
-- The guard reads inventory_items.is_archived AFTER the row has already
-- been locked with SELECT ... FOR UPDATE earlier in each function, so it
-- observes the same locked, up-to-date row. The parent category is checked
-- with SELECT ... FOR SHARE, which conflicts with the plain UPDATE used by
-- the category archive/reactivate flow (dynamicCategoryService.ts), so a
-- concurrent archive of the category is properly serialized against this
-- transaction instead of racing it.
--
-- Scope: the `if p_table_name = 'inventory_items' then ... end if;` /
-- `if v_issue.table_name = 'inventory_items' then ... end if;` guards mean
-- legacy static tables (consumables, paints, screws, stock_screws,
-- raw_materials, cylinders) are completely untouched by this migration.

-- 1) apply_inventory_operation_transactional_rpc — legacy overload (no p_request_id)
CREATE OR REPLACE FUNCTION public.apply_inventory_operation_transactional_rpc(p_table_name text, p_item_id uuid, p_operation_type text, p_quantity numeric, p_operation_date date DEFAULT CURRENT_DATE, p_project_name text DEFAULT NULL::text, p_category_name text DEFAULT NULL::text, p_item_name text DEFAULT NULL::text, p_supplier_name text DEFAULT NULL::text, p_issued_to text DEFAULT NULL::text, p_received_by text DEFAULT NULL::text, p_purchase_order_number text DEFAULT NULL::text, p_item_code text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_created_by text DEFAULT 'user'::text)
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
  v_is_archived boolean;
  v_category_id uuid;
  v_category_archived boolean;
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

  if p_table_name = 'inventory_items' then
    select is_archived, category_id
      into v_is_archived, v_category_id
    from public.inventory_items
    where id = p_item_id;

    if coalesce(v_is_archived, false) then
      raise exception 'لا يمكن تنفيذ حركة مخزون على صنف مؤرشف' using errcode = '22023';
    end if;

    if v_category_id is not null then
      select is_archived
        into v_category_archived
      from public.categories
      where id = v_category_id
      for share;

      if coalesce(v_category_archived, false) then
        raise exception 'لا يمكن تنفيذ حركة مخزون داخل قسم مؤرشف' using errcode = '22023';
      end if;
    end if;
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

-- 2) apply_inventory_operation_transactional_rpc — current overload (with p_request_id)
CREATE OR REPLACE FUNCTION public.apply_inventory_operation_transactional_rpc(p_table_name text, p_item_id uuid, p_operation_type text, p_quantity numeric, p_operation_date date DEFAULT CURRENT_DATE, p_project_name text DEFAULT NULL::text, p_category_name text DEFAULT NULL::text, p_item_name text DEFAULT NULL::text, p_supplier_name text DEFAULT NULL::text, p_issued_to text DEFAULT NULL::text, p_received_by text DEFAULT NULL::text, p_purchase_order_number text DEFAULT NULL::text, p_item_code text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_created_by text DEFAULT 'user'::text, p_request_id text DEFAULT NULL::text)
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
  v_is_archived boolean;
  v_category_id uuid;
  v_category_archived boolean;
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

  if p_table_name = 'inventory_items' then
    select is_archived, category_id
      into v_is_archived, v_category_id
    from public.inventory_items
    where id = p_item_id;

    if coalesce(v_is_archived, false) then
      raise exception 'لا يمكن تنفيذ حركة مخزون على صنف مؤرشف' using errcode = '22023';
    end if;

    if v_category_id is not null then
      select is_archived
        into v_category_archived
      from public.categories
      where id = v_category_id
      for share;

      if coalesce(v_category_archived, false) then
        raise exception 'لا يمكن تنفيذ حركة مخزون داخل قسم مؤرشف' using errcode = '22023';
      end if;
    end if;
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

-- 3) return_inventory_item_rpc — internal return mutator (not exposed to anon/authenticated)
CREATE OR REPLACE FUNCTION public.return_inventory_item_rpc(p_issue_operation_id uuid, p_quantity numeric, p_operation_date date DEFAULT CURRENT_DATE, p_received_by text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_created_by text DEFAULT 'user'::text, p_request_id text DEFAULT NULL::text)
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
  v_is_archived boolean;
  v_category_id uuid;
  v_category_archived boolean;
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

  if v_issue.table_name = 'inventory_items' then
    select is_archived, category_id
      into v_is_archived, v_category_id
    from public.inventory_items
    where id = v_issue.item_id;

    if coalesce(v_is_archived, false) then
      raise exception 'لا يمكن تنفيذ حركة مخزون على صنف مؤرشف' using errcode = '22023';
    end if;

    if v_category_id is not null then
      select is_archived
        into v_category_archived
      from public.categories
      where id = v_category_id
      for share;

      if coalesce(v_category_archived, false) then
        raise exception 'لا يمكن تنفيذ حركة مخزون داخل قسم مؤرشف' using errcode = '22023';
      end if;
    end if;
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
