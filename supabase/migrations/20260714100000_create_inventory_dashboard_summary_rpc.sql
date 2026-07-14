create or replace function public.get_inventory_dashboard_summary_rpc()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with category_counts as (
    select 'consumables'::text as table_name, count(*)::integer as row_count from public.consumables
    union all select 'paints', count(*)::integer from public.paints
    union all select 'screws', count(*)::integer from public.screws
    union all select 'stock_screws', count(*)::integer from public.stock_screws
    union all select 'raw_materials', count(*)::integer from public.raw_materials
    union all select 'cylinders', count(*)::integer from public.cylinders
    union all select 'cutting_discs', count(*)::integer from public.cutting_discs
    union all select 'long_welding_gloves', count(*)::integer
      from public.long_welding_gloves where is_archived = false
  ),
  dashboard_rows as (
    select 'consumables'::text as table_name, to_jsonb(r) as row_data from public.consumables as r
    union all select 'paints', to_jsonb(r) from public.paints as r
    union all select 'screws', to_jsonb(r) from public.screws as r
    union all select 'stock_screws', to_jsonb(r) from public.stock_screws as r
    union all select 'raw_materials', to_jsonb(r) from public.raw_materials as r
    union all select 'cylinders', to_jsonb(r) from public.cylinders as r
    union all select 'cutting_discs', to_jsonb(r) from public.cutting_discs as r
    union all select 'long_welding_gloves', to_jsonb(r)
      from public.long_welding_gloves as r where is_archived = false
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

revoke all on function public.get_inventory_dashboard_summary_rpc() from public, anon;
grant execute on function public.get_inventory_dashboard_summary_rpc() to authenticated;
