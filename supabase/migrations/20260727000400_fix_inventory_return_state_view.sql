create or replace view public.inventory_item_movements_view
with (security_invoker = true) as
select
  op.id,
  op.table_name,
  case
    when op.table_name = 'cones4_materials' then 'raw_materials'
    else op.table_name
  end as display_table_name,
  coalesce(op.category_name, op.category_label) as category_name,
  op.category_label,
  op.item_id,
  op.item_name,
  op.item_label,
  op.project_name,
  op.project,
  op.operation_type,
  op.quantity,
  op.operation_date,
  case when op.operation_type = 'issue' then op.quantity else 0 end as issued_quantity,
  case when op.operation_type = 'add' then op.quantity else 0 end as added_quantity,
  op.previous_balance,
  op.new_balance,
  sum(case when op.operation_type = 'add' then op.quantity else 0 end)
    over (
      partition by op.table_name, op.item_id
      order by op.operation_date, op.created_at, op.id
    ) as total_added_until_operation,
  sum(case when op.operation_type = 'issue' then op.quantity else 0 end)
    over (
      partition by op.table_name, op.item_id
      order by op.operation_date, op.created_at, op.id
    ) as total_issued_until_operation,
  coalesce(
    op.supplier_name,
    rm.supplier_name,
    sc.supplier_name,
    ss.supplier_name,
    co.supplier_name,
    pa.supplier_name,
    cy.supplier_name
  ) as supplier_name,
  op.issued_to,
  op.received_by,
  op.purchase_order_number,
  op.addition_code,
  op.issue_code,
  op.item_code,
  case when op.table_name = 'raw_materials' then rm.weight else null end as weight,
  case when op.table_name = 'raw_materials' then rm.length else null end as length,
  case when op.table_name = 'raw_materials' then rm.width else null end as width,
  case when op.table_name = 'raw_materials' then rm.th else null end as th,
  case
    when op.table_name = 'raw_materials' then rm.material_source
    else null
  end as material_source,
  op.notes,
  op.created_by,
  op.created_at,
  coalesce(
    case when op.table_name = 'raw_materials' then rm.code_number else null end,
    case when op.table_name = 'screws' then sc.code_number else null end,
    case when op.table_name = 'stock_screws' then ss.code_number else null end,
    op.item_code
  ) as code_number,
  coalesce(
    case when op.table_name = 'raw_materials' then rm.din else null end,
    case when op.table_name = 'screws' then sc.din else null end,
    case when op.table_name = 'stock_screws' then ss.din else null end
  ) as din,
  coalesce(
    case when op.table_name = 'raw_materials' then rm.internal_code else null end,
    case when op.table_name = 'screws' then sc.internal_code else null end,
    case when op.table_name = 'stock_screws' then ss.internal_code else null end,
    case when op.table_name = 'consumables' then co.internal_code else null end,
    case when op.table_name = 'paints' then pa.internal_code else null end,
    case when op.table_name = 'cylinders' then cy.internal_code else null end
  ) as internal_code,
  case
    when op.operation_type = 'issue' then coalesce(return_totals.returned_quantity, 0)
    when op.operation_type = 'return' then op.quantity
    else 0
  end as returned_quantity,
  case
    when op.operation_type <> 'issue' then 'not_returned'
    when coalesce(return_totals.returned_quantity, 0) <= 0 then 'not_returned'
    when coalesce(return_totals.returned_quantity, 0) >= op.quantity then 'fully_returned'
    else 'partially_returned'
  end as return_status,
  case
    when op.operation_type = 'issue'
      then greatest(op.quantity - coalesce(return_totals.returned_quantity, 0), 0)
    else 0
  end as remaining_returnable_quantity,
  op.related_operation_id,
  original_issue.issued_to as original_issued_to,
  original_issue.operation_date as original_issue_date,
  original_issue.issue_code as original_issue_code
from public.inventory_operations as op
left join public.raw_materials as rm
  on op.table_name = 'raw_materials' and op.item_id = rm.id
left join public.screws as sc
  on op.table_name = 'screws' and op.item_id = sc.id
left join public.stock_screws as ss
  on op.table_name = 'stock_screws' and op.item_id = ss.id
left join public.consumables as co
  on op.table_name = 'consumables' and op.item_id = co.id
left join public.paints as pa
  on op.table_name = 'paints' and op.item_id = pa.id
left join public.cylinders as cy
  on op.table_name = 'cylinders' and op.item_id = cy.id
left join public.inventory_operations as original_issue
  on original_issue.id = op.related_operation_id
left join lateral (
  select coalesce(sum(return_op.quantity), 0) as returned_quantity
  from public.inventory_operations as return_op
  where return_op.related_operation_id = op.id
    and return_op.operation_type = 'return'
) as return_totals on true;
