-- Fix Arabic-comma mojibake in group-issue employee name labels.
--
-- Bug: apply_inventory_operation_with_party_rpc builds the group `issued_to`
-- label via string_agg(name, <separator> order by name). The live function
-- had drifted from its own source migration
-- (20260730080631_add_group_issue_allocations.sql, which already contains
-- the correct Arabic comma '، ') to a mojibake separator: the two-byte
-- UTF-8 encoding of the Arabic comma (U+060C, bytes 0xD8 0x8C)
-- misinterpreted as Windows-1252, which decodes to 'Ø' (U+00D8) + 'Œ'
-- (U+0152). Every multi-employee issue produced a group label like
-- "جمعه عليØŒ صافى راشد" instead of "جمعه علي، صافى راشد".
--
-- Fix: re-sync the live function to the separator its own source migration
-- already specifies correctly. This is the ONLY line that changes — no
-- other logic, ordering, employee ID handling, allocation behavior, or
-- return/archive behavior is touched. Signature is unchanged, no new
-- overload.
--
-- Historical data: 150 existing rows in public.inventory_operations.issued_to
-- (all table_name = 'consumables') already contain the corrupted sequence.
-- This migration does NOT touch existing data — historical repair is a
-- separate, explicitly-approved action.

CREATE OR REPLACE FUNCTION public.apply_inventory_operation_with_party_rpc(p_table_name text, p_item_id uuid, p_operation_type text, p_quantity numeric, p_operation_date date DEFAULT CURRENT_DATE, p_project_name text DEFAULT NULL::text, p_category_name text DEFAULT NULL::text, p_item_name text DEFAULT NULL::text, p_employee_id uuid DEFAULT NULL::uuid, p_supplier_id uuid DEFAULT NULL::uuid, p_received_by text DEFAULT NULL::text, p_purchase_order_number text DEFAULT NULL::text, p_item_code text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_created_by text DEFAULT 'user'::text, p_request_id text DEFAULT NULL::text, p_employee_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
