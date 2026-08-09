-- This migration targets the verified production UUID schema. The repository's
-- earliest local baseline predates that schema and must not be replayed on production.

create table if not exists public.inventory_item_creation_requests (
  request_id text primary key,
  table_name text not null,
  item_id uuid not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  constraint inventory_item_creation_requests_request_id_not_blank
    check (btrim(request_id) <> '')
);

alter table public.inventory_item_creation_requests enable row level security;
revoke all on public.inventory_item_creation_requests from public, anon, authenticated;

create or replace function public.create_inventory_item_rpc(
  p_table_name text,
  p_payload jsonb,
  p_created_by text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_id text := nullif(btrim(p_request_id), '');
  v_existing public.inventory_item_creation_requests%rowtype;
  v_response jsonb;
begin
  if v_request_id is null then
    raise exception 'requestId is required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('inventory-item-create:' || v_request_id, 0)
  );

  select * into v_existing
  from public.inventory_item_creation_requests
  where request_id = v_request_id;

  if found then
    if v_existing.table_name <> lower(btrim(p_table_name)) then
      raise exception 'requestId was already used for another inventory table'
        using errcode = '22023';
    end if;
    return v_existing.response || jsonb_build_object(
      'status', 'already_processed',
      'request_id', v_request_id
    );
  end if;

  v_response := public.create_inventory_item_rpc(
    p_table_name,
    coalesce(p_payload, '{}'::jsonb),
    coalesce(nullif(btrim(p_created_by), ''), 'offline-user')
  );

  insert into public.inventory_item_creation_requests(
    request_id,
    table_name,
    item_id,
    response
  ) values (
    v_request_id,
    lower(btrim(p_table_name)),
    (v_response ->> 'item_id')::uuid,
    v_response
  );

  return v_response || jsonb_build_object(
    'status', 'success',
    'request_id', v_request_id
  );
end;
$$;

revoke all on function public.create_inventory_item_rpc(text, jsonb, text, text)
  from public;
grant execute on function public.create_inventory_item_rpc(text, jsonb, text, text)
  to anon, authenticated, service_role;

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
        'added', r.added, 'issued', r.issued,
        'stock_balance', r.stock_balance, 'min_quantity', r.min_quantity,
        'supplier_name', r.supplier_name,
        'updated_at', r.updated_at, 'created_at', r.created_at
      )) as row_data
    from public.consumables r

    union all
    select 'paints', jsonb_strip_nulls(jsonb_build_object(
      'id', r.id, 'internal_code', r.internal_code,
      'item_name', r.item_name, 'project', r.project,
      'transaction_date', r.transaction_date, 'expire_date', r.expire_date,
      'added', r.added, 'issued', r.issued,
      'stock_balance', r.stock_balance, 'min_quantity', r.min_quantity,
      'supplier_name', r.supplier_name,
      'updated_at', r.updated_at, 'created_at', r.created_at
    )) from public.paints r

    union all
    select 'screws', jsonb_strip_nulls(jsonb_build_object(
      'id', r.id, 'internal_code', r.internal_code,
      'item_name', r.item_name, 'project', r.project,
      'din', r.din, 'code_number', r.code_number,
      'transaction_date', r.transaction_date,
      'added', r.added, 'issued', r.issued,
      'stock_balance', r.stock_balance, 'min_quantity', r.min_quantity,
      'supplier_name', r.supplier_name,
      'updated_at', r.updated_at, 'created_at', r.created_at
    )) from public.screws r

    union all
    select 'stock_screws', jsonb_strip_nulls(jsonb_build_object(
      'id', r.id, 'internal_code', r.internal_code,
      'item_name', r.item_name, 'project', r.project,
      'din', r.din, 'code_number', r.code_number,
      'transaction_date', r.transaction_date,
      'added', r.added, 'issued', r.issued,
      'stock_balance', r.stock_balance, 'min_quantity', r.min_quantity,
      'supplier_name', r.supplier_name,
      'updated_at', r.updated_at, 'created_at', r.created_at
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
      'added', r.added, 'issued', r.issued,
      'stock_balance', r.stock_balance, 'min_quantity', r.min_quantity,
      'supplier_name', r.supplier_name,
      'updated_at', r.updated_at, 'created_at', r.created_at
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

do $$
declare
  v_table_name text;
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;

  foreach v_table_name in array array[
    'consumables', 'paints', 'screws', 'stock_screws', 'raw_materials',
    'cylinders', 'cutting_discs', 'long_welding_gloves', 'projects', 'imports'
  ] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table_name
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        v_table_name
      );
    end if;
  end loop;
end;
$$;
