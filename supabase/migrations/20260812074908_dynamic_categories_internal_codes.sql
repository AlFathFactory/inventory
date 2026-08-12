-- ============================================================
-- Internal-code support for dynamic categories (inventory_items)
-- Existing 8 tables are unaffected; only an inventory_items path is added.
-- ============================================================

-- 1) Each category carries its own code prefix (auto-assigned) ----
alter table public.categories add column if not exists code_prefix text;

create sequence if not exists public.categories_code_seq;

create or replace function public.tg_categories_set_prefix()
returns trigger language plpgsql as $$
begin
  if new.code_prefix is null or btrim(new.code_prefix) = '' then
    new.code_prefix := 'DC' || lpad(nextval('public.categories_code_seq')::text, 3, '0');
  else
    new.code_prefix := upper(btrim(new.code_prefix));
  end if;
  return new;
end $$;

drop trigger if exists trg_categories_prefix on public.categories;
create trigger trg_categories_prefix before insert on public.categories
  for each row execute function public.tg_categories_set_prefix();

-- unique so each category's sequence namespace is isolated
create unique index if not exists categories_code_prefix_uidx
  on public.categories (code_prefix);

-- 2) Allow 'inventory_items' in the internal-codes ledger ----------
alter table public.inventory_internal_codes
  drop constraint if exists inventory_internal_codes_table_name_check;
alter table public.inventory_internal_codes
  add constraint inventory_internal_codes_table_name_check
  check (table_name = any (array[
    'consumables','paints','screws','stock_screws','raw_materials',
    'cylinders','cutting_discs','long_welding_gloves','inventory_items'
  ]));

-- 3) assign_inventory_internal_code: add an inventory_items branch --
create or replace function public.assign_inventory_internal_code(
  p_table_name text, p_item_id uuid,
  p_project text default null, p_material_source text default null)
returns text language plpgsql as $function$
declare
  v_allowed text[] := array[
    'consumables','paints','screws','stock_screws','raw_materials',
    'cylinders','cutting_discs','long_welding_gloves','inventory_items'];
  v_prefix text; v_code text; v_sequence integer; v_existing text; v_row_count integer;
begin
  if not (p_table_name = any(v_allowed)) then
    raise exception 'Unsupported inventory table: %', p_table_name;
  end if;

  execute format('select internal_code from public.%I where id = $1', p_table_name)
    into v_existing using p_item_id;
  if v_existing is not null and length(trim(v_existing)) > 0 then
    return v_existing;
  end if;

  if p_table_name = 'inventory_items' then
    -- dynamic category: prefix comes from the linked category row
    select c.code_prefix into v_prefix
    from public.inventory_items i
    join public.categories c on c.id = i.category_id
    where i.id = p_item_id;
    if v_prefix is null then
      raise exception 'No code_prefix resolved for inventory_items id %', p_item_id;
    end if;
  else
    v_prefix := public.get_inventory_internal_prefix(p_table_name, p_project, p_material_source);
  end if;

  select a.internal_code, a.sequence_no into v_code, v_sequence
  from public.allocate_inventory_internal_code(v_prefix) a;

  execute format('update public.%I set internal_code = $1 where id = $2 and internal_code is null', p_table_name)
    using v_code, p_item_id;
  get diagnostics v_row_count = row_count;

  if v_row_count = 0 then
    execute format('select internal_code from public.%I where id = $1', p_table_name)
      into v_existing using p_item_id;
    if v_existing is not null then return v_existing; end if;
    raise exception 'Item not found or internal_code could not be assigned: table %, id %', p_table_name, p_item_id;
  end if;

  insert into public.inventory_internal_codes(internal_code, table_name, item_id, prefix, sequence_no)
  values (v_code, p_table_name, p_item_id, v_prefix, v_sequence)
  on conflict (internal_code) do nothing;

  return v_code;
end;
$function$;

-- 4) generate_inventory_internal_code_rpc: allow inventory_items ---
create or replace function public.generate_inventory_internal_code_rpc(p_table_name text, p_item_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_project text; v_material_source text; v_code text;
  v_allowed text[] := array[
    'consumables','paints','screws','stock_screws','raw_materials',
    'cylinders','cutting_discs','long_welding_gloves','inventory_items'];
begin
  if not (p_table_name = any(v_allowed)) then
    raise exception 'Unsupported inventory table: %', p_table_name;
  end if;

  if p_table_name = 'raw_materials' then
    select project, material_source into v_project, v_material_source
    from public.raw_materials where id = p_item_id;
  elsif p_table_name = 'cylinders' then
    select project, null::text into v_project, v_material_source
    from public.cylinders where id = p_item_id;
  elsif p_table_name in ('cutting_discs','long_welding_gloves') then
    select null::text, null::text into v_project, v_material_source;
  elsif p_table_name = 'inventory_items' then
    -- prefix handled inside assign_ via category; project/source not needed
    select null::text, null::text into v_project, v_material_source;
  else
    execute format('select project, null::text from public.%I where id = $1', p_table_name)
      into v_project, v_material_source using p_item_id;
  end if;

  v_code := public.assign_inventory_internal_code(p_table_name, p_item_id, v_project, v_material_source);

  return jsonb_build_object('ok', true, 'table_name', p_table_name, 'item_id', p_item_id, 'internal_code', v_code);
end;
$function$;
