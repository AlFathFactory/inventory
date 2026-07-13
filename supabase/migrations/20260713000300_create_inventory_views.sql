create or replace view public.inventory_category_items_summary_view
with (security_invoker = true) as
select 'consumables'::text table_name, 'مستهلكات'::text category_name, id item_id, item_key,
       project project_name, item_name, stock_balance, min_quantity, null::date expire_date,
       case when stock_balance <= 0 then 'out_of_stock' when stock_balance <= min_quantity then 'low_stock' else 'available' end status,
       total_added, total_issued, null::numeric weight, null::numeric length, null::numeric width,
       null::numeric th, null::text material_source, notes, created_at, updated_at
from public.consumables
union all
select 'paints', 'دهانات', id, item_key, project, item_name, stock_balance, min_quantity, expire_date,
       case when stock_balance <= 0 then 'out_of_stock' when stock_balance <= min_quantity then 'low_stock' else 'available' end,
       total_added, total_issued, null, null, null, null, null, notes, created_at, updated_at
from public.paints
union all
select 'screws', 'مسامير', id, item_key, project, item_name, stock_balance, min_quantity, null,
       case when stock_balance <= 0 then 'out_of_stock' when stock_balance <= min_quantity then 'low_stock' else 'available' end,
       total_added, total_issued, null, null, null, null, null, notes, created_at, updated_at
from public.screws
union all
select 'stock_screws', 'مسامير مخزن', id, item_key, project, item_name, stock_balance, min_quantity, null,
       case when stock_balance <= 0 then 'out_of_stock' when stock_balance <= min_quantity then 'low_stock' else 'available' end,
       total_added, total_issued, null, null, null, null, null, notes, created_at, updated_at
from public.stock_screws
union all
select 'raw_materials', 'خامات', id, item_key, project, item_name, stock_balance, min_quantity, null,
       case when stock_balance <= 0 then 'out_of_stock' when stock_balance <= min_quantity then 'low_stock' else 'available' end,
       total_added, total_issued, weight, length, width, th, material_source, notes, created_at, updated_at
from public.raw_materials
union all
select 'cylinders', 'اسطوانات', id, item_key, null, type_name, gas_balance, null, null,
       case when gas_balance <= 0 then 'out_of_stock' else 'available' end,
       null, null, null, null, null, null, null, notes, created_at, updated_at
from public.cylinders;

create or replace view public.inventory_item_details_view
with (security_invoker = true) as
select * from public.inventory_category_items_summary_view;

create or replace view public.inventory_item_movements_view
with (security_invoker = true) as
select id, table_name, category_name, category_label, item_id, item_name, item_label,
       project_name, project, operation_type, quantity, operation_date,
       case when operation_type = 'issue' then quantity else 0 end issued_quantity,
       case when operation_type = 'add' then quantity else 0 end added_quantity,
       previous_balance, new_balance, supplier_name, issued_to, received_by,
       purchase_order_number, addition_code, issue_code, item_code, notes,
       created_by, created_at
from public.inventory_operations;

create or replace view public.addition_operations_view
with (security_invoker = true) as
select * from public.inventory_operations where operation_type = 'add';

create or replace view public.issue_operations_view
with (security_invoker = true) as
select * from public.inventory_operations where operation_type = 'issue';

create or replace view public.cutting_discs_view
with (security_invoker = true) as select * from public.cutting_discs;
create or replace view public.long_welding_gloves_view
with (security_invoker = true) as select * from public.long_welding_gloves;
