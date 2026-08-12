-- Employee-allocation rollback for deleted RETURN movements.
--
-- Bug: delete_inventory_operation_rpc already restores item stock balance
-- and the parent issue's returned_quantity/return_status when a RETURN
-- movement is deleted, but it never rolled back the matching row in
-- public.inventory_operation_employee_allocations. That left the employee
-- custody ledger reporting a returned_quantity that no longer has a backing
-- return movement.
--
-- Fix: inside the existing `if v_operation.operation_type = 'return'`
-- branch, after the parent issue is locked and updated (matching the lock
-- order used by return_inventory_item_with_employee_rpc, which locks the
-- issue operation row before the allocation row), lock and decrement the
-- allocation row identified by (v_operation.related_operation_id,
-- v_operation.employee_id) — the exact identity return_inventory_item_with_
-- employee_rpc used to increment it in the first place.
--
-- Corruption guard: if the allocation row's returned_quantity is less than
-- the quantity being reversed, that indicates pre-existing data corruption
-- (the DB's own `returned_quantity >= 0` check would otherwise silently
-- catch it as a generic constraint violation) — this raises a clear
-- business error instead of clamping with greatest(0, ...), which would
-- mask the inconsistency.
--
-- Legacy safety: if the return movement has no employee_id (2 such rows
-- exist in production today, predating employee-return tracking), or no
-- allocation row exists for (issue_operation_id, employee_id) (issues
-- created before the group-allocation feature never got an allocation
-- row), the block is skipped silently — there is nothing to roll back and
-- no historical row is rewritten.
--
-- Scope: only the return-deletion branch changes. The add/adjust/issue
-- deletion branches, the stock-restoration logic, the "latest movement
-- only" guard, and the deletion audit snapshot are byte-for-byte
-- unchanged. No table_name-specific branching needed here because
-- employee allocations are keyed off inventory_operations.employee_id /
-- related_operation_id, not off table_name — the same mechanism already
-- used by return_inventory_item_with_employee_rpc for every supported
-- inventory table.

CREATE OR REPLACE FUNCTION public.delete_inventory_operation_rpc(p_operation_id uuid, p_deleted_by text DEFAULT 'user'::text)
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
  v_employee_allocation public.inventory_operation_employee_allocations%rowtype;
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

    if v_operation.employee_id is not null then
      select * into v_employee_allocation
      from public.inventory_operation_employee_allocations
      where issue_operation_id = v_operation.related_operation_id
        and employee_id = v_operation.employee_id
      for update;

      if found then
        if v_employee_allocation.returned_quantity < v_operation.quantity then
          raise exception 'Employee allocation returned_quantity (%) is less than the return quantity being deleted (%) for employee % on issue %; refusing to corrupt allocation data', v_employee_allocation.returned_quantity, v_operation.quantity, v_operation.employee_id, v_operation.related_operation_id using errcode = '22023';
        end if;

        update public.inventory_operation_employee_allocations
        set returned_quantity = returned_quantity - v_operation.quantity,
            updated_at = now()
        where issue_operation_id = v_operation.related_operation_id
          and employee_id = v_operation.employee_id;
      end if;
    end if;
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
