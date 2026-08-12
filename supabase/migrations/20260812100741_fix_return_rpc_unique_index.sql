-- Allow multiple idempotent return RPC movements for the same inventory item.
-- Import-generated source identities remain protected by the same unique key.

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Keep the duplicate precheck and index replacement race-free while holding
-- the lock for only this short migration transaction.
lock table public.inventory_operations in share mode;

do $$
begin
  if exists (
    select 1
    from public.inventory_operations
    where source_category_row_id is not null
      and source_table_name is not null
      and source_row_type is not null
      and source_row_type not in ('transactional_rpc', 'return_rpc')
    group by source_table_name, source_category_row_id, source_row_type
    having count(*) > 1
  ) then
    raise exception
      'Cannot replace inventory_operations_import_source_unique: covered duplicate source identities exist';
  end if;
end
$$;

drop index if exists public.inventory_operations_import_source_unique;

create unique index inventory_operations_import_source_unique
  on public.inventory_operations (
    source_table_name,
    source_category_row_id,
    source_row_type
  )
  where source_category_row_id is not null
    and source_table_name is not null
    and source_row_type is not null
    and source_row_type not in ('transactional_rpc', 'return_rpc');
