drop view if exists public.inventory_item_details_view;
drop view if exists public.inventory_category_items_summary_view;

create view public.inventory_category_items_summary_view
with (security_invoker = true) as
select 'consumables'::text table_name, 'مستهلكات'::text category_name, id item_id, item_key,
       project project_name, item_name, stock_balance, min_quantity, null::date expire_date,
       case when stock_balance <= 0 then 'out_of_stock' when stock_balance <= min_quantity then 'low_stock' else 'available' end status,
       total_added, total_issued, null::numeric weight, null::numeric length, null::numeric width,
       null::numeric th, null::text material_source, null::text din, null::text code_number,
       notes, created_at, updated_at
from public.consumables
union all
select 'paints', 'دهانات', id, item_key, project, item_name, stock_balance, min_quantity, expire_date,
       case when stock_balance <= 0 then 'out_of_stock' when stock_balance <= min_quantity then 'low_stock' else 'available' end,
       total_added, total_issued, null, null, null, null, null, null, null, notes, created_at, updated_at
from public.paints
union all
select 'screws', 'مسامير', id, item_key, project, item_name, stock_balance, min_quantity, null,
       case when stock_balance <= 0 then 'out_of_stock' when stock_balance <= min_quantity then 'low_stock' else 'available' end,
       total_added, total_issued, null, null, null, null, null, din, code_number, notes, created_at, updated_at
from public.screws
union all
select 'stock_screws', 'مسامير مخزن', id, item_key, project, item_name, stock_balance, min_quantity, null,
       case when stock_balance <= 0 then 'out_of_stock' when stock_balance <= min_quantity then 'low_stock' else 'available' end,
       total_added, total_issued, null, null, null, null, null, din, code_number, notes, created_at, updated_at
from public.stock_screws
union all
select 'raw_materials', 'خامات', id, item_key, project, item_name, stock_balance, min_quantity, null,
       case when stock_balance <= 0 then 'out_of_stock' when stock_balance <= min_quantity then 'low_stock' else 'available' end,
       total_added, total_issued, weight, length, width, th, material_source, null, null, notes, created_at, updated_at
from public.raw_materials
union all
select 'cylinders', 'اسطوانات', id, item_key, project, type_name, gas_balance, min_quantity, null,
       case when gas_balance <= 0 then 'out_of_stock' when gas_balance <= min_quantity then 'low_stock' else 'available' end,
       null, null, null, null, null, null, null, null, null, notes, created_at, updated_at
from public.cylinders;

create view public.inventory_item_details_view
with (security_invoker = true) as
select * from public.inventory_category_items_summary_view;

grant select on public.inventory_category_items_summary_view to authenticated;
grant select on public.inventory_item_details_view to authenticated;
