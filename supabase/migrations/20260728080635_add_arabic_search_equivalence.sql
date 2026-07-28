create or replace function public.get_aggregated_inventory_report_rpc(
  p_from_date date default null,
  p_to_date date default null,
  p_category_name text default null,
  p_project_name text default null,
  p_search text default null,
  p_operation_type text default null,
  p_page integer default 1,
  p_page_size integer default 10
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with search_input as (
    select nullif(
      pg_catalog.translate(pg_catalog.lower(pg_catalog.btrim(p_search)), 'ةى', 'هي'),
      ''
    ) as value
  ),
  filtered_operations as materialized (
    select distinct on (operation.id)
      operation.id,
      operation.table_name,
      operation.item_id,
      coalesce(operation.item_name, operation.item_label, '—') as item_name,
      coalesce(operation.category_name, operation.category_label, '—') as category_name,
      coalesce(operation.project_name, operation.project, '—') as project_name,
      operation.operation_type,
      operation.quantity
    from public.inventory_operations as operation
    cross join search_input
    where operation.operation_type in ('add', 'issue')
      and (
        nullif(btrim(p_operation_type), '') is null
        or operation.operation_type = p_operation_type
      )
      and (p_from_date is null or operation.operation_date >= p_from_date)
      and (p_to_date is null or operation.operation_date <= p_to_date)
      and (
        nullif(btrim(p_category_name), '') is null
        or coalesce(operation.category_name, operation.category_label) = p_category_name
      )
      and (
        nullif(btrim(p_project_name), '') is null
        or coalesce(operation.project_name, operation.project) = p_project_name
      )
      and (
        search_input.value is null
        or pg_catalog.translate(
          pg_catalog.lower(
            concat_ws(
              ' ',
              operation.item_name,
              operation.item_label,
              operation.category_name,
              operation.category_label,
              operation.project_name,
              operation.project,
              operation.item_code
            )
          ),
          'ةى',
          'هي'
        ) like '%' || search_input.value || '%'
        or (
          operation.table_name = 'raw_materials'
          and exists (
            select 1
            from public.raw_materials as searched_material
            where searched_material.id = operation.item_id
              and pg_catalog.translate(
                pg_catalog.lower(searched_material.code_number),
                'ةى',
                'هي'
              ) like '%' || search_input.value || '%'
          )
        )
      )
    order by operation.id
  ),
  aggregated_items as materialized (
    select
      operation.table_name,
      operation.item_id,
      max(operation.item_name) as item_name,
      max(operation.category_name) as category_name,
      max(operation.project_name) as project_name,
      coalesce(sum(operation.quantity) filter (where operation.operation_type = 'add'), 0) as total_added_quantity,
      coalesce(sum(operation.quantity) filter (where operation.operation_type = 'issue'), 0) as total_issued_quantity,
      max(raw_material.code_number) as code_number,
      max(raw_material.weight) as weight,
      max(raw_material.length) as length,
      max(raw_material.width) as width,
      max(raw_material.th) as th
    from filtered_operations as operation
    left join public.raw_materials as raw_material
      on operation.table_name = 'raw_materials'
      and raw_material.id = operation.item_id
    group by operation.table_name, operation.item_id
  ),
  paged_items as (
    select *
    from aggregated_items
    order by lower(item_name), table_name, item_id
    limit least(greatest(coalesce(p_page_size, 10), 1), 100)
    offset (
      greatest(coalesce(p_page, 1), 1) - 1
    ) * least(greatest(coalesce(p_page_size, 10), 1), 100)
  ),
  report_summary as (
    select
      count(*) filter (where operation_type = 'add')::integer as addition_operations_count,
      coalesce(sum(quantity) filter (where operation_type = 'add'), 0) as total_added_quantity,
      count(*) filter (where operation_type = 'issue')::integer as issue_operations_count,
      coalesce(sum(quantity) filter (where operation_type = 'issue'), 0) as total_issued_quantity
    from filtered_operations
  )
  select jsonb_build_object(
    'rows', coalesce(
      (
        select jsonb_agg(to_jsonb(item) order by lower(item.item_name), item.table_name, item.item_id)
        from paged_items as item
      ),
      '[]'::jsonb
    ),
    'total_items', (select count(*)::integer from aggregated_items),
    'summary', jsonb_build_object(
      'addition_operations_count', report_summary.addition_operations_count,
      'total_added_quantity', report_summary.total_added_quantity,
      'issue_operations_count', report_summary.issue_operations_count,
      'total_issued_quantity', report_summary.total_issued_quantity
    )
  )
  from report_summary;
$$;

revoke all on function public.get_aggregated_inventory_report_rpc(
  date,
  date,
  text,
  text,
  text,
  text,
  integer,
  integer
) from public;

grant execute on function public.get_aggregated_inventory_report_rpc(
  date,
  date,
  text,
  text,
  text,
  text,
  integer,
  integer
) to anon, authenticated;
