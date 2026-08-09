-- The first lean projection measured 763,321 bytes for 1,941 rows. These three
-- fields are not rendered by the dashboard; movement details remain available
-- from their dedicated query.
create or replace function public.get_inventory_dashboard_summary_rpc()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with category_counts as (
    select 'consumables'::text as table_name, count(*)::integer as row_count
      from public.consumables
    union all select 'paints', count(*)::integer from public.paints
    union all select 'screws', count(*)::integer from public.screws
    union all select 'stock_screws', count(*)::integer from public.stock_screws
    union all select 'raw_materials', count(*)::integer from public.raw_materials
  ),
  dashboard_rows as (
    select 'consumables'::text as table_name,
      jsonb_strip_nulls(jsonb_build_object(
        'id', r.id, 'internal_code', r.internal_code,
        'item_name', r.item_name, 'project', r.project,
        'transaction_date', r.transaction_date,
        'stock_balance', r.stock_balance, 'min_quantity', r.min_quantity,
        'supplier_name', r.supplier_name, 'updated_at', r.updated_at
      )) as row_data
    from public.consumables r

    union all
    select 'paints', jsonb_strip_nulls(jsonb_build_object(
      'id', r.id, 'internal_code', r.internal_code,
      'item_name', r.item_name, 'project', r.project,
      'transaction_date', r.transaction_date, 'expire_date', r.expire_date,
      'stock_balance', r.stock_balance, 'min_quantity', r.min_quantity,
      'supplier_name', r.supplier_name, 'updated_at', r.updated_at
    )) from public.paints r

    union all
    select 'screws', jsonb_strip_nulls(jsonb_build_object(
      'id', r.id, 'internal_code', r.internal_code,
      'item_name', r.item_name, 'project', r.project,
      'din', r.din, 'code_number', r.code_number,
      'transaction_date', r.transaction_date,
      'stock_balance', r.stock_balance, 'min_quantity', r.min_quantity,
      'supplier_name', r.supplier_name, 'updated_at', r.updated_at
    )) from public.screws r

    union all
    select 'stock_screws', jsonb_strip_nulls(jsonb_build_object(
      'id', r.id, 'internal_code', r.internal_code,
      'item_name', r.item_name, 'project', r.project,
      'din', r.din, 'code_number', r.code_number,
      'transaction_date', r.transaction_date,
      'stock_balance', r.stock_balance, 'min_quantity', r.min_quantity,
      'supplier_name', r.supplier_name, 'updated_at', r.updated_at
    )) from public.stock_screws r

    union all
    select 'raw_materials', jsonb_strip_nulls(jsonb_build_object(
      'id', r.id, 'internal_code', r.internal_code,
      'item_name', r.item_name, 'project', r.project,
      'din', r.din, 'code_number', r.code_number,
      'material_source', r.material_source,
      'weight', r.weight, 'length', r.length, 'width', r.width,
      'th', r.th, 'dimension_text', r.dimension_text,
      'transaction_date', r.transaction_date,
      'stock_balance', r.stock_balance, 'min_quantity', r.min_quantity,
      'supplier_name', r.supplier_name, 'updated_at', r.updated_at
    )) from public.raw_materials r
  ),
  stock_totals as (
    select
      count(*)::integer as total_items,
      count(*) filter (where stock_balance <= min_quantity)::integer as low_stock_count,
      count(*) filter (where stock_balance <= 0)::integer as out_of_stock_count
    from public.inventory_category_items_summary_view
  ),
  import_totals as (
    select
      count(*)::integer as total_imported_files,
      (array_agg(file_name order by imported_at desc))[1] as last_imported_file
    from public.imports
  )
  select jsonb_build_object(
    'total_items', stock_totals.total_items,
    'low_stock_count', stock_totals.low_stock_count,
    'out_of_stock_count', stock_totals.out_of_stock_count,
    'total_imported_files', import_totals.total_imported_files,
    'last_imported_file', import_totals.last_imported_file,
    'category_counts', (
      select coalesce(jsonb_object_agg(table_name, row_count), '{}'::jsonb)
      from category_counts
    ),
    'inventory_rows', (
      select coalesce(
        jsonb_agg(row_data || jsonb_build_object('table_name', table_name)),
        '[]'::jsonb
      )
      from dashboard_rows
    )
  )
  from stock_totals
  cross join import_totals;
$$;

revoke all on function public.get_inventory_dashboard_summary_rpc() from public;
grant execute on function public.get_inventory_dashboard_summary_rpc()
  to anon, authenticated;
