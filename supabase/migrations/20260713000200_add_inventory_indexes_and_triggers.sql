do $$
declare table_name text;
begin
  foreach table_name in array array['consumables','paints','screws','stock_screws','raw_materials','cylinders'] loop
    execute format('create unique index if not exists %I on public.%I (item_key)', table_name || '_item_key_uidx', table_name);
  end loop;
end $$;

create unique index if not exists inventory_operations_import_key_uidx
  on public.inventory_operations (import_key)
  where import_key is not null;
create index if not exists inventory_operations_item_idx
  on public.inventory_operations (table_name, item_id, operation_date desc, created_at desc);
create index if not exists inventory_operations_type_date_idx
  on public.inventory_operations (operation_type, operation_date desc);
create unique index if not exists cutting_discs_code_uidx on public.cutting_discs (code) where code is not null;
create unique index if not exists long_welding_gloves_code_uidx on public.long_welding_gloves (code) where code is not null;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['consumables','paints','screws','stock_screws','raw_materials','cylinders','cutting_discs','long_welding_gloves'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name);
  end loop;
end $$;
