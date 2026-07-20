-- The Supabase CLI binary was unavailable on this Windows host, so this migration
-- was created locally after inspecting the live schema and function definitions.

create unique index if not exists inventory_operations_import_key_unique
  on public.inventory_operations (import_key)
  where import_key is not null;

create or replace function public.import_normalized_items_chunk_rpc(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
  f jsonb;
  s jsonb;
  v_table text;
  v_id uuid;
  v_item_key text;
  v_existing_key text;
  v_project text;
  v_item_name text;
  v_type_name text;
  v_source_file text;
  v_source_sheet text;
  v_din text;
  v_code_number text;
  v_material_source text;
  v_length numeric;
  v_width numeric;
  v_th numeric;
  v_weight numeric;
  v_dimension_text text;
  v_internal_code text;
  v_key_available boolean;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_items_needing_codes jsonb := '[]'::jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a JSON array';
  end if;

  for r in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_table := r->>'table_name';
      if v_table not in ('consumables','paints','screws','stock_screws','raw_materials','cylinders') then
        raise exception 'Unsupported inventory table: %', v_table;
      end if;

      v_item_key := nullif(btrim(r->>'item_key'), '');
      v_project := nullif(btrim(r->>'project_name'), '');
      v_item_name := nullif(btrim(r->>'item_name'), '');
      v_type_name := coalesce(nullif(btrim(r->>'type_name'), ''), v_item_name);
      f := coalesce(r->'fields', '{}'::jsonb);
      s := coalesce(r->'source', '{}'::jsonb);
      v_source_file := coalesce(nullif(s->>'file_name',''), nullif(r->>'source_file',''));
      v_source_sheet := coalesce(nullif(s->>'sheet',''), nullif(r->>'source_sheet',''));
      v_din := nullif(btrim(coalesce(f->>'din', r->>'din')), '');
      v_code_number := nullif(btrim(coalesce(f->>'code_number', r->>'code_number')), '');
      v_material_source := nullif(btrim(coalesce(f->>'material_source', r->>'material_source')), '');
      v_length := public.safe_to_numeric(coalesce(f->>'length', r->>'length'));
      v_width := public.safe_to_numeric(coalesce(f->>'width', r->>'width'));
      v_th := public.safe_to_numeric(coalesce(f->>'th', r->>'th'));
      v_weight := public.safe_to_numeric(coalesce(f->>'weight', r->>'weight'));
      v_dimension_text := nullif(btrim(coalesce(f->>'dimension_text', r->>'dimension_text')), '');
      v_id := null;
      v_existing_key := null;

      if v_item_key is null or v_item_name is null then
        raise exception 'item_key and item_name are required';
      end if;

      if v_table in ('consumables','paints') then
        if v_table = 'consumables' then
          select id, item_key into v_id, v_existing_key
          from public.consumables
          where is_archived is not true and (
            item_key = v_item_key or (
              public.normalize_inventory_text(project) = public.normalize_inventory_text(v_project)
              and public.normalize_inventory_text(item_name) = public.normalize_inventory_text(v_item_name)
            )
          )
          order by case when item_key = v_item_key then 0 else 1 end, created_at
          limit 1;
        else
          select id, item_key into v_id, v_existing_key
          from public.paints
          where is_archived is not true and (
            item_key = v_item_key or (
              public.normalize_inventory_text(project) = public.normalize_inventory_text(v_project)
              and public.normalize_inventory_text(item_name) = public.normalize_inventory_text(v_item_name)
            )
          )
          order by case when item_key = v_item_key then 0 else 1 end, created_at
          limit 1;
        end if;

        if v_id is null then
          if v_table = 'consumables' then
            insert into public.consumables(
              project,item_name,opening_balance,total_added,total_issued,stock_balance,
              min_quantity,transaction_date,source_file,source_sheet,item_key,notes
            ) values (
              v_project,v_item_name,coalesce(public.safe_to_numeric(r->>'opening_balance'),0),
              coalesce(public.safe_to_numeric(r->>'total_added'),0),coalesce(public.safe_to_numeric(r->>'total_issued'),0),
              coalesce(public.safe_to_numeric(r->>'stock_balance'),0),coalesce(public.safe_to_numeric(r->>'min_quantity'),0),
              coalesce(nullif(r->>'transaction_date','')::date,date '2026-07-31'),v_source_file,v_source_sheet,v_item_key,
              coalesce(r->>'notes',f->>'notes')
            ) returning id into v_id;
          else
            insert into public.paints(
              project,item_name,opening_balance,total_added,total_issued,stock_balance,
              min_quantity,transaction_date,expire_date,source_file,source_sheet,item_key,notes
            ) values (
              v_project,v_item_name,coalesce(public.safe_to_numeric(r->>'opening_balance'),0),
              coalesce(public.safe_to_numeric(r->>'total_added'),0),coalesce(public.safe_to_numeric(r->>'total_issued'),0),
              coalesce(public.safe_to_numeric(r->>'stock_balance'),0),coalesce(public.safe_to_numeric(r->>'min_quantity'),0),
              coalesce(nullif(r->>'transaction_date','')::date,date '2026-07-31'),nullif(f->>'expire_date','')::date,
              v_source_file,v_source_sheet,v_item_key,coalesce(r->>'notes',f->>'notes')
            ) returning id into v_id;
          end if;
          v_inserted := v_inserted + 1;
        else
          if v_existing_key is distinct from v_item_key then
            execute format('select not exists(select 1 from public.%I where item_key=$1 and id<>$2)', v_table)
              into v_key_available using v_item_key, v_id;
            if v_key_available then v_existing_key := v_item_key; end if;
          end if;
          if v_table = 'consumables' then
            update public.consumables set
              project=v_project,item_name=v_item_name,opening_balance=coalesce(public.safe_to_numeric(r->>'opening_balance'),0),
              total_added=coalesce(public.safe_to_numeric(r->>'total_added'),0),total_issued=coalesce(public.safe_to_numeric(r->>'total_issued'),0),
              stock_balance=coalesce(public.safe_to_numeric(r->>'stock_balance'),0),min_quantity=coalesce(public.safe_to_numeric(r->>'min_quantity'),min_quantity),
              transaction_date=coalesce(nullif(r->>'transaction_date','')::date,date '2026-07-31'),source_file=v_source_file,
              source_sheet=v_source_sheet,item_key=coalesce(v_existing_key,item_key),notes=coalesce(r->>'notes',f->>'notes',notes),updated_at=now()
            where id=v_id;
          else
            update public.paints set
              project=v_project,item_name=v_item_name,opening_balance=coalesce(public.safe_to_numeric(r->>'opening_balance'),0),
              total_added=coalesce(public.safe_to_numeric(r->>'total_added'),0),total_issued=coalesce(public.safe_to_numeric(r->>'total_issued'),0),
              stock_balance=coalesce(public.safe_to_numeric(r->>'stock_balance'),0),min_quantity=coalesce(public.safe_to_numeric(r->>'min_quantity'),min_quantity),
              transaction_date=coalesce(nullif(r->>'transaction_date','')::date,date '2026-07-31'),expire_date=coalesce(nullif(f->>'expire_date','')::date,expire_date),
              source_file=v_source_file,source_sheet=v_source_sheet,item_key=coalesce(v_existing_key,item_key),notes=coalesce(r->>'notes',f->>'notes',notes),updated_at=now()
            where id=v_id;
          end if;
          v_updated := v_updated + 1;
        end if;

      elsif v_table in ('screws','stock_screws') then
        execute format(
          'select id,item_key from public.%I where is_archived is not true and (item_key=$1 or (public.normalize_inventory_text(project)=public.normalize_inventory_text($2) and public.normalize_inventory_text(item_name)=public.normalize_inventory_text($3) and public.normalize_inventory_text(din)=public.normalize_inventory_text($4) and public.normalize_inventory_text(code_number)=public.normalize_inventory_text($5))) order by case when item_key=$1 then 0 else 1 end,created_at limit 1',
          v_table
        ) into v_id,v_existing_key using v_item_key,v_project,v_item_name,v_din,v_code_number;

        if v_id is null then
          execute format(
            'insert into public.%I(project,item_name,din,code_number,opening_balance,total_added,total_issued,stock_balance,min_quantity,transaction_date,source_file,source_sheet,item_key,notes) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id',
            v_table
          ) into v_id using v_project,v_item_name,v_din,v_code_number,
            coalesce(public.safe_to_numeric(r->>'opening_balance'),0),coalesce(public.safe_to_numeric(r->>'total_added'),0),
            coalesce(public.safe_to_numeric(r->>'total_issued'),0),coalesce(public.safe_to_numeric(r->>'stock_balance'),0),
            coalesce(public.safe_to_numeric(r->>'min_quantity'),0),coalesce(nullif(r->>'transaction_date','')::date,date '2026-07-31'),
            v_source_file,v_source_sheet,v_item_key,coalesce(r->>'notes',f->>'notes');
          v_inserted := v_inserted + 1;
        else
          execute format('select not exists(select 1 from public.%I where item_key=$1 and id<>$2)',v_table)
            into v_key_available using v_item_key,v_id;
          if v_key_available then v_existing_key := v_item_key; end if;
          execute format(
            'update public.%I set project=$1,item_name=$2,din=$3,code_number=$4,opening_balance=$5,total_added=$6,total_issued=$7,stock_balance=$8,min_quantity=$9,transaction_date=$10,source_file=$11,source_sheet=$12,item_key=coalesce($13,item_key),notes=coalesce($14,notes),updated_at=now() where id=$15',
            v_table
          ) using v_project,v_item_name,v_din,v_code_number,
            coalesce(public.safe_to_numeric(r->>'opening_balance'),0),coalesce(public.safe_to_numeric(r->>'total_added'),0),
            coalesce(public.safe_to_numeric(r->>'total_issued'),0),coalesce(public.safe_to_numeric(r->>'stock_balance'),0),
            coalesce(public.safe_to_numeric(r->>'min_quantity'),0),coalesce(nullif(r->>'transaction_date','')::date,date '2026-07-31'),
            v_source_file,v_source_sheet,v_existing_key,coalesce(r->>'notes',f->>'notes'),v_id;
          v_updated := v_updated + 1;
        end if;

      elsif v_table = 'raw_materials' then
        select id,item_key into v_id,v_existing_key
        from public.raw_materials
        where is_archived is not true and (
          item_key=v_item_key or (
            public.normalize_inventory_text(project)=public.normalize_inventory_text(v_project)
            and public.normalize_inventory_text(item_name)=public.normalize_inventory_text(v_item_name)
            and public.normalize_inventory_text(material_source)=public.normalize_inventory_text(v_material_source)
            and public.normalize_inventory_text(code_number)=public.normalize_inventory_text(v_code_number)
            and public.normalize_inventory_text(din)=public.normalize_inventory_text(v_din)
            and length is not distinct from v_length and width is not distinct from v_width
            and th is not distinct from v_th and weight is not distinct from v_weight
            and public.normalize_inventory_text(dimension_text)=public.normalize_inventory_text(v_dimension_text)
          )
        ) order by case when item_key=v_item_key then 0 else 1 end,created_at limit 1;

        if v_id is null then
          insert into public.raw_materials(
            project,item_name,material_source,length,width,th,weight,dimension_text,code_number,din,
            opening_balance,total_added,total_issued,stock_balance,min_quantity,transaction_date,source_file,source_sheet,item_key,notes
          ) values (
            v_project,v_item_name,v_material_source,v_length,v_width,v_th,v_weight,v_dimension_text,v_code_number,v_din,
            coalesce(public.safe_to_numeric(r->>'opening_balance'),0),coalesce(public.safe_to_numeric(r->>'total_added'),0),
            coalesce(public.safe_to_numeric(r->>'total_issued'),0),coalesce(public.safe_to_numeric(r->>'stock_balance'),0),
            coalesce(public.safe_to_numeric(r->>'min_quantity'),0),coalesce(nullif(r->>'transaction_date','')::date,date '2026-07-31'),
            v_source_file,v_source_sheet,v_item_key,coalesce(r->>'notes',f->>'notes')
          ) returning id into v_id;
          v_inserted := v_inserted + 1;
        else
          select not exists(select 1 from public.raw_materials where item_key=v_item_key and id<>v_id) into v_key_available;
          if v_key_available then v_existing_key := v_item_key; end if;
          update public.raw_materials set
            project=v_project,item_name=v_item_name,material_source=v_material_source,length=v_length,width=v_width,th=v_th,weight=v_weight,
            dimension_text=v_dimension_text,code_number=v_code_number,din=v_din,
            opening_balance=coalesce(public.safe_to_numeric(r->>'opening_balance'),0),total_added=coalesce(public.safe_to_numeric(r->>'total_added'),0),
            total_issued=coalesce(public.safe_to_numeric(r->>'total_issued'),0),stock_balance=coalesce(public.safe_to_numeric(r->>'stock_balance'),0),
            min_quantity=coalesce(public.safe_to_numeric(r->>'min_quantity'),min_quantity),transaction_date=coalesce(nullif(r->>'transaction_date','')::date,date '2026-07-31'),
            source_file=v_source_file,source_sheet=v_source_sheet,item_key=coalesce(v_existing_key,item_key),notes=coalesce(r->>'notes',f->>'notes',notes),updated_at=now()
          where id=v_id;
          v_updated := v_updated + 1;
        end if;

      else
        select id,item_key into v_id,v_existing_key
        from public.cylinders
        where is_archived is not true and (
          item_key=v_item_key or (
            public.normalize_inventory_text(project)=public.normalize_inventory_text(v_project)
            and public.normalize_inventory_text(type_name)=public.normalize_inventory_text(v_type_name)
          )
        ) order by case when item_key=v_item_key then 0 else 1 end,created_at limit 1;

        if v_id is null then
          insert into public.cylinders(
            project,type_name,gas_balance,stock_balance,empty_count,full_count,min_quantity,
            transaction_date,source_file,source_sheet,item_key,notes
          ) values (
            v_project,v_type_name,coalesce(public.safe_to_numeric(r->>'stock_balance'),0),coalesce(public.safe_to_numeric(r->>'stock_balance'),0),
            coalesce(public.safe_to_numeric(f->>'empty_count'),0),coalesce(public.safe_to_numeric(f->>'full_count'),0),coalesce(public.safe_to_numeric(r->>'min_quantity'),0),
            coalesce(nullif(r->>'transaction_date','')::date,date '2026-07-31'),v_source_file,v_source_sheet,v_item_key,coalesce(r->>'notes',f->>'notes')
          ) returning id into v_id;
          v_inserted := v_inserted + 1;
        else
          select not exists(select 1 from public.cylinders where item_key=v_item_key and id<>v_id) into v_key_available;
          if v_key_available then v_existing_key := v_item_key; end if;
          update public.cylinders set
            project=v_project,type_name=v_type_name,gas_balance=coalesce(public.safe_to_numeric(r->>'stock_balance'),0),
            stock_balance=coalesce(public.safe_to_numeric(r->>'stock_balance'),0),empty_count=coalesce(public.safe_to_numeric(f->>'empty_count'),empty_count),
            full_count=coalesce(public.safe_to_numeric(f->>'full_count'),full_count),min_quantity=coalesce(public.safe_to_numeric(r->>'min_quantity'),min_quantity),
            transaction_date=coalesce(nullif(r->>'transaction_date','')::date,date '2026-07-31'),source_file=v_source_file,source_sheet=v_source_sheet,
            item_key=coalesce(v_existing_key,item_key),notes=coalesce(r->>'notes',f->>'notes',notes),updated_at=now()
          where id=v_id;
          v_updated := v_updated + 1;
        end if;
      end if;

      execute format('select internal_code from public.%I where id=$1',v_table) into v_internal_code using v_id;
      if v_internal_code is null then
        v_items_needing_codes := v_items_needing_codes || jsonb_build_array(
          jsonb_build_object('table_name',v_table,'item_id',v_id)
        );
      end if;
    exception when others then
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'table_name',v_table,'item_key',v_item_key,'error',sqlerrm
      ));
    end;
  end loop;

  return jsonb_build_object(
    'inserted',v_inserted,'updated',v_updated,'skipped',v_skipped,
    'errors',v_errors,'items_needing_codes',v_items_needing_codes
  );
end;
$$;

create or replace function public.import_normalized_movements_chunk_rpc(p_movements jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
  v_table text;
  v_item_id uuid;
  v_affected integer;
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_errors jsonb := '[]'::jsonb;
begin
  if p_movements is null or jsonb_typeof(p_movements) <> 'array' then
    raise exception 'p_movements must be a JSON array';
  end if;

  for r in select value from jsonb_array_elements(p_movements)
  loop
    begin
      v_table := r->>'table_name';
      if v_table not in ('consumables','paints','screws','stock_screws','raw_materials','cylinders') then
        raise exception 'Unsupported inventory table: %',v_table;
      end if;
      if nullif(r->>'import_key','') is null then raise exception 'import_key is required'; end if;
      if r->>'operation_type' not in ('add','issue','adjust') then raise exception 'Invalid operation_type'; end if;

      execute format('select id from public.%I where item_key=$1 and is_archived is not true limit 1',v_table)
        into v_item_id using r->>'item_key';
      if v_item_id is null then raise exception 'Item not found by canonical item_key'; end if;

      insert into public.inventory_operations(
        import_key,table_name,item_id,operation_type,quantity,project,project_name,
        category_name,category_label,item_name,item_label,previous_balance,new_balance,
        operation_date,notes,created_by,source_table_name,source_row_type
      ) values (
        r->>'import_key',v_table,v_item_id,r->>'operation_type',coalesce(public.safe_to_numeric(r->>'quantity'),0),
        r->>'project_name',r->>'project_name',r->>'category_name',r->>'category_name',r->>'item_name',r->>'item_name',
        coalesce(public.safe_to_numeric(r->>'previous_balance'),0),coalesce(public.safe_to_numeric(r->>'new_balance'),0),
        coalesce(nullif(r->>'operation_date','')::date,date '2026-07-31'),r->>'notes','custom_excel_import_v4',v_table,'custom_excel_import_v4'
      ) on conflict(import_key) where import_key is not null do nothing;
      get diagnostics v_affected = row_count;
      if v_affected = 1 then v_inserted := v_inserted + 1; else v_skipped := v_skipped + 1; end if;
    exception when others then
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'table_name',v_table,'item_key',r->>'item_key','import_key',r->>'import_key','error',sqlerrm
      ));
    end;
  end loop;
  return jsonb_build_object('inserted',v_inserted,'updated',0,'skipped',v_skipped,'errors',v_errors);
end;
$$;

create or replace function public.import_normalized_custody_chunk_rpc(p_table_name text,p_records jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
  v_exists boolean;
  v_code text;
  v_type text;
  v_received_by text;
  v_received_date date;
  v_scrapped_date date;
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_errors jsonb := '[]'::jsonb;
begin
  if p_table_name not in ('cutting_discs','long_welding_gloves') then
    raise exception 'Unsupported custody table: %',p_table_name;
  end if;
  if p_records is null or jsonb_typeof(p_records) <> 'array' then
    raise exception 'p_records must be a JSON array';
  end if;

  for r in select value from jsonb_array_elements(p_records)
  loop
    begin
      v_code := nullif(btrim(r->>'code'),'');
      v_type := nullif(btrim(r->>'type_name'),'');
      v_received_by := nullif(btrim(r->>'received_by'),'');
      v_received_date := nullif(r->>'received_date','')::date;
      v_scrapped_date := nullif(r->>'scrapped_date','')::date;
      v_exists := false;

      if p_table_name = 'cutting_discs' then
        if v_type is null then raise exception 'type_name is required'; end if;
        select exists(
          select 1 from public.cutting_discs
          where (v_code is not null and public.normalize_inventory_text(code)=public.normalize_inventory_text(v_code))
             or (v_code is null and code is null
                 and public.normalize_inventory_text(type_name)=public.normalize_inventory_text(v_type)
                 and public.normalize_inventory_text(received_by)=public.normalize_inventory_text(v_received_by)
                 and received_date is not distinct from v_received_date
                 and scrapped_date is not distinct from v_scrapped_date)
        ) into v_exists;
        if not v_exists then
          insert into public.cutting_discs(
            code,type_name,received_by,received_date,scrapped_date,source_file,source_sheet,notes
          ) values (
            v_code,v_type,v_received_by,v_received_date,v_scrapped_date,r->>'source_file',r->>'source_sheet',r->>'notes'
          );
          v_inserted := v_inserted + 1;
        else v_skipped := v_skipped + 1;
        end if;
      else
        if v_type is null or v_received_by is null then raise exception 'type_name and received_by are required'; end if;
        select exists(
          select 1 from public.long_welding_gloves
          where is_archived is not true
            and public.normalize_inventory_text(type_name)=public.normalize_inventory_text(v_type)
            and public.normalize_inventory_text(received_by)=public.normalize_inventory_text(v_received_by)
            and received_date is not distinct from v_received_date
        ) into v_exists;
        if not v_exists then
          insert into public.long_welding_gloves(
            type_name,received_by,received_date,quantity,source_file,source_sheet,notes
          ) values (
            v_type,v_received_by,v_received_date,coalesce(public.safe_to_numeric(r->>'quantity'),1),
            r->>'source_file',r->>'source_sheet',r->>'notes'
          );
          v_inserted := v_inserted + 1;
        else v_skipped := v_skipped + 1;
        end if;
      end if;
    exception when others then
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'table_name',p_table_name,'source_row',r->>'source_row','error',sqlerrm
      ));
    end;
  end loop;
  return jsonb_build_object('inserted',v_inserted,'updated',0,'skipped',v_skipped,'errors',v_errors);
end;
$$;
