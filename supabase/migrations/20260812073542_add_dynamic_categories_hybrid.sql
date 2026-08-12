-- ============================================================
-- HYBRID DYNAMIC CATEGORIES (Path B, additive — existing tables untouched)
-- ============================================================

-- 1) CATEGORIES registry (categories are ROWS, not tables) -----
create table if not exists public.categories (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,                         -- Arabic display name (source of truth)
  slug         text unique default ('cat_' || left(replace(gen_random_uuid()::text,'-',''),8)),
  parent_id    uuid references public.categories(id) on delete set null, -- future nesting
  is_archived  boolean default false,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- prevent duplicate active category names
create unique index if not exists categories_name_active_uidx
  on public.categories (name) where is_archived = false;
create index if not exists categories_parent_idx on public.categories (parent_id);

-- 2) INVENTORY_ITEMS shared table (standard stock model) -------
-- Mirrors consumables column-for-column so it UNIONs cleanly into
-- existing views, plus category_id to link to the registry.
create table if not exists public.inventory_items (
  id                  uuid primary key default gen_random_uuid(),
  category_id         uuid not null references public.categories(id),
  project             text,
  item_name           text,
  transaction_date    date,
  issued              numeric default 0,
  added               numeric default 0,
  total_added         numeric default 0,
  total_issued        numeric default 0,
  stock_balance       numeric default 0,
  min_quantity        numeric default 0,
  source_file         text,
  source_sheet        text,                 -- kept in sync with category name (for view compat)
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  item_key            text,
  is_archived         boolean default false,
  merged_into_item_id uuid,
  notes               text,
  opening_balance     numeric default 0,
  internal_code       text,
  supplier_name       text
);

create index if not exists inventory_items_category_idx on public.inventory_items (category_id);
create index if not exists inventory_items_archived_idx on public.inventory_items (is_archived);
create index if not exists inventory_items_item_key_idx on public.inventory_items (item_key);
create index if not exists inventory_items_internal_code_idx on public.inventory_items (internal_code);

-- 3) Triggers -------------------------------------------------
create or replace function public.tg_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.tg_sync_source_sheet()
returns trigger language plpgsql as $$
begin
  select c.name into new.source_sheet
  from public.categories c where c.id = new.category_id;
  return new;
end $$;

drop trigger if exists trg_categories_touch on public.categories;
create trigger trg_categories_touch before update on public.categories
  for each row execute function public.tg_touch_updated_at();

drop trigger if exists trg_items_touch on public.inventory_items;
create trigger trg_items_touch before update on public.inventory_items
  for each row execute function public.tg_touch_updated_at();

drop trigger if exists trg_items_sync_sheet on public.inventory_items;
create trigger trg_items_sync_sheet before insert or update of category_id on public.inventory_items
  for each row execute function public.tg_sync_source_sheet();

-- 4) RLS + policies (mirror consumables: anon full access) -----
alter table public.categories enable row level security;
alter table public.inventory_items enable row level security;

drop policy if exists "anon read categories"   on public.categories;
drop policy if exists "anon insert categories" on public.categories;
drop policy if exists "anon update categories" on public.categories;
drop policy if exists "anon delete categories" on public.categories;
create policy "anon read categories"   on public.categories for select to anon using (true);
create policy "anon insert categories" on public.categories for insert to anon with check (true);
create policy "anon update categories" on public.categories for update to anon using (true) with check (true);
create policy "anon delete categories" on public.categories for delete to anon using (true);

drop policy if exists "anon read items"   on public.inventory_items;
drop policy if exists "anon insert items" on public.inventory_items;
drop policy if exists "anon update items" on public.inventory_items;
drop policy if exists "anon delete items" on public.inventory_items;
create policy "anon read items"   on public.inventory_items for select to anon using (true);
create policy "anon insert items" on public.inventory_items for insert to anon with check (true);
create policy "anon update items" on public.inventory_items for update to anon using (true) with check (true);
create policy "anon delete items" on public.inventory_items for delete to anon using (true);

-- 5) Clean creation RPCs --------------------------------------
create or replace function public.create_category(p_name text, p_parent_id uuid default null)
returns public.categories language plpgsql security definer set search_path = public as $$
declare rec public.categories;
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'Category name is required';
  end if;
  insert into public.categories (name, parent_id)
  values (btrim(p_name), p_parent_id)
  returning * into rec;
  return rec;
end $$;

create or replace function public.create_inventory_item(
  p_category_id   uuid,
  p_item_name     text,
  p_opening_balance numeric default 0,
  p_min_quantity  numeric default 0,
  p_supplier_name text default null,
  p_notes         text default null
) returns public.inventory_items language plpgsql security definer set search_path = public as $$
declare rec public.inventory_items;
begin
  if p_category_id is null then raise exception 'category_id is required'; end if;
  if p_item_name is null or btrim(p_item_name) = '' then raise exception 'item_name is required'; end if;
  if not exists (select 1 from public.categories where id = p_category_id) then
    raise exception 'category % does not exist', p_category_id;
  end if;

  insert into public.inventory_items
    (category_id, item_name, opening_balance, stock_balance, min_quantity, supplier_name, notes)
  values
    (p_category_id, btrim(p_item_name), coalesce(p_opening_balance,0), coalesce(p_opening_balance,0),
     coalesce(p_min_quantity,0), p_supplier_name, p_notes)
  returning * into rec;
  return rec;
end $$;
