create or replace function public.import_normalized_items_chunk_rpc(p_items jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  item jsonb;
  table_name text;
  existed boolean;
  inserted_count int := 0;
  updated_count int := 0;
  skipped_count int := 0;
  errors jsonb := '[]';
begin
  for item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    begin
      table_name := item->>'table_name';
      if table_name not in ('consumables','paints','screws','stock_screws','raw_materials','cylinders') then
        raise exception 'Unsupported inventory table: %', table_name;
      end if;

      execute format('select exists(select 1 from public.%I where item_key=$1)', table_name)
        into existed
        using item->>'item_key';

      if table_name = 'cylinders' then
        execute format('insert into public.%I(item_key,type_name,gas_balance,transaction_date,notes) values($1,$2,$3,$4,$5) on conflict(item_key) do update set type_name=excluded.type_name,gas_balance=excluded.gas_balance,transaction_date=excluded.transaction_date,notes=excluded.notes', table_name)
          using item->>'item_key', item->>'item_name', coalesce((item->>'stock_balance')::numeric,0), nullif(item->>'transaction_date','')::date, item->>'notes';
      elsif table_name = 'raw_materials' then
        insert into public.raw_materials(
          item_key,
          item_name,
          project,
          stock_balance,
          min_quantity,
          total_added,
          total_issued,
          transaction_date,
          notes,
          code_number
        )
        values (
          item->>'item_key',
          item->>'item_name',
          item->>'project_name',
          coalesce((item->>'stock_balance')::numeric, 0),
          coalesce((item->>'min_quantity')::numeric, 0),
          coalesce((item->>'total_added')::numeric, 0),
          coalesce((item->>'total_issued')::numeric, 0),
          nullif(item->>'transaction_date', '')::date,
          item->>'notes',
          nullif(btrim(item->>'code_number'), '')
        )
        on conflict(item_key) do update set
          item_name = excluded.item_name,
          project = excluded.project,
          stock_balance = excluded.stock_balance,
          min_quantity = excluded.min_quantity,
          total_added = excluded.total_added,
          total_issued = excluded.total_issued,
          transaction_date = excluded.transaction_date,
          notes = excluded.notes,
          code_number = excluded.code_number;
      else
        execute format('insert into public.%I(item_key,item_name,project,stock_balance,min_quantity,total_added,total_issued,transaction_date,notes) values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(item_key) do update set item_name=excluded.item_name,project=excluded.project,stock_balance=excluded.stock_balance,min_quantity=excluded.min_quantity,total_added=excluded.total_added,total_issued=excluded.total_issued,transaction_date=excluded.transaction_date,notes=excluded.notes', table_name)
          using item->>'item_key', item->>'item_name', item->>'project_name', coalesce((item->>'stock_balance')::numeric,0), coalesce((item->>'min_quantity')::numeric,0), coalesce((item->>'total_added')::numeric,0), coalesce((item->>'total_issued')::numeric,0), nullif(item->>'transaction_date','')::date, item->>'notes';
      end if;

      if existed then
        updated_count := updated_count + 1;
      else
        inserted_count := inserted_count + 1;
      end if;
    exception when others then
      skipped_count := skipped_count + 1;
      errors := errors || jsonb_build_array(sqlerrm);
    end;
  end loop;

  return jsonb_build_object(
    'inserted', inserted_count,
    'updated', updated_count,
    'skipped', skipped_count,
    'errors', errors
  );
end;
$$;
