-- Dashboard dynamic-item integration.
--
-- Bug: get_inventory_dashboard_summary_rpc's `total_items` / `low_stock_count`
-- / `out_of_stock_count` already came from public.inventory_category_items_
-- summary_view, which already unions in inventory_items (dynamic items) —
-- those three numbers were already correct. But `dashboard_rows` and
-- `category_counts` were built from a hand-written UNION ALL over exactly
-- the 5 legacy physical tables (consumables, paints, screws, stock_screws,
-- raw_materials), so dynamic items never appeared in `inventory_rows` and
-- had no representation in `category_counts`. The frontend independently
-- recomputes its own totals/rows purely from `inventory_rows`, so the
-- dashboard UI showed zero dynamic rows even though the (unused-by-the-
-- frontend) `total_items` field already counted them.
--
-- Fix (additive, backward-compatible):
--   1. Add one more UNION ALL branch to `dashboard_rows` for
--      inventory_items, joined to categories for the real dynamic category
--      name/id. Filtered the same way inventory_category_items_summary_view
--      already filters dynamic rows (item is_archived = false), so the
--      dashboard stays consistent with the already-regression-tested
--      reports layer. No status is computed here — exactly like every
--      legacy branch, status is left for the frontend to derive from
--      stock_balance/min_quantity via the existing shared status utility.
--   2. Add a new `dynamic_category_counts` CTE + JSON key: an array of
--      {category_id, category_name, row_count} for every dynamic category
--      that currently has at least one non-archived item. This is a NEW
--      key, so the existing `category_counts` object (keyed by the 5
--      legacy table names) is completely untouched — existing consumers
--      that only read `category_counts`/`inventory_rows`/`total_items`
--      keep working unchanged.
--
-- Everything else (category_counts CTE, the 5 legacy dashboard_rows
-- branches, stock_totals, import_totals, and every existing output key) is
-- byte-for-byte unchanged — verified with an automated diff before this
-- migration was applied.

CREATE OR REPLACE FUNCTION public.get_inventory_dashboard_summary_rpc()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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

    union all
    select 'inventory_items'::text as table_name,
      jsonb_strip_nulls(jsonb_build_object(
        'id', i.id, 'internal_code', i.internal_code,
        'item_name', i.item_name, 'project', i.project,
        'transaction_date', i.transaction_date,
        'stock_balance', i.stock_balance, 'min_quantity', i.min_quantity,
        'supplier_name', i.supplier_name, 'updated_at', i.updated_at,
        'category_id', i.category_id,
        'category_name', coalesce(cat.name, i.source_sheet, 'غير مصنف')
      )) as row_data
    from public.inventory_items i
    left join public.categories cat on cat.id = i.category_id
    where coalesce(i.is_archived, false) = false
  ),
  dynamic_category_counts as (
    select
      cat.id as category_id,
      cat.name as category_name,
      count(i.id)::integer as row_count
    from public.categories cat
    join public.inventory_items i
      on i.category_id = cat.id
      and coalesce(i.is_archived, false) = false
    group by cat.id, cat.name
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
    'dynamic_category_counts', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'category_id', category_id,
            'category_name', category_name,
            'row_count', row_count
          )
          order by category_name
        ),
        '[]'::jsonb
      )
      from dynamic_category_counts
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
$function$;
