do $$
declare table_name text;
begin
  foreach table_name in array array[
    'consumables','paints','screws','stock_screws','raw_materials','cylinders',
    'cutting_discs','long_welding_gloves','inventory_operations','imports'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists authenticated_read on public.%I', table_name);
    execute format('create policy authenticated_read on public.%I for select to authenticated using (true)', table_name);
    execute format('drop policy if exists authenticated_insert on public.%I', table_name);
    execute format('create policy authenticated_insert on public.%I for insert to authenticated with check (true)', table_name);
    execute format('drop policy if exists authenticated_update on public.%I', table_name);
    execute format('create policy authenticated_update on public.%I for update to authenticated using (true) with check (true)', table_name);
  end loop;
end $$;

revoke all on function public.apply_inventory_operation_transactional_rpc(text,bigint,text,numeric,date,text,text,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.apply_inventory_operation_transactional_rpc(text,bigint,text,numeric,date,text,text,text,text,text,text,text,text,text,text) to authenticated;
revoke all on function public.import_normalized_items_chunk_rpc(jsonb) from public, anon;
grant execute on function public.import_normalized_items_chunk_rpc(jsonb) to authenticated;
revoke all on function public.import_normalized_movements_chunk_rpc(jsonb) from public, anon;
grant execute on function public.import_normalized_movements_chunk_rpc(jsonb) to authenticated;
revoke all on function public.import_normalized_custody_chunk_rpc(text,jsonb) from public, anon;
grant execute on function public.import_normalized_custody_chunk_rpc(text,jsonb) to authenticated;

grant select, insert, update on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
