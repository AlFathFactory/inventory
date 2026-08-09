set local lock_timeout = '10s';
set local statement_timeout = '60s';

lock table
  public.projects,
  public.consumables,
  public.paints,
  public.screws,
  public.stock_screws,
  public.raw_materials,
  public.cylinders,
  public.inventory_operations
in share row exclusive mode;

do $migration$
declare
  old_name constant text := 'سفتي';
  new_name constant text := 'سيفتي';
  table_name text;
  old_prefix text;
  new_prefix text;
  unexpected_key_count integer;
  collision_count integer;
begin
  if (select count(*) from public.projects where name = new_name) <> 1 then
    raise exception 'Expected exactly one project named "%"', new_name;
  end if;

  if exists (select 1 from public.projects where name = old_name) then
    raise exception 'Both old and new project names are registered; aborting';
  end if;

  foreach table_name in array array[
    'consumables',
    'paints',
    'screws',
    'stock_screws',
    'raw_materials',
    'cylinders'
  ] loop
    old_prefix := lower(table_name) || '::' || lower(old_name) || '::';
    new_prefix := lower(table_name) || '::' || lower(new_name) || '::';

    execute format(
      'select count(*) from public.%I where project = $1 and left(item_key, char_length($2)) <> $2',
      table_name
    )
    into unexpected_key_count
    using old_name, old_prefix;

    if unexpected_key_count > 0 then
      raise exception '% rows in public.% have an unexpected item_key prefix',
        unexpected_key_count, table_name;
    end if;

    execute format(
      'select count(*)
         from public.%1$I source
         join public.%1$I target
           on target.item_key = $1 || substr(source.item_key, char_length($2) + 1)
          and target.id <> source.id
        where source.project = $3',
      table_name
    )
    into collision_count
    using new_prefix, old_prefix, old_name;

    if collision_count > 0 then
      raise exception '% item_key collisions would be created in public.%',
        collision_count, table_name;
    end if;

    execute format(
      'update public.%I
          set project = $1,
              item_key = $2 || substr(item_key, char_length($3) + 1)
        where project = $4',
      table_name
    )
    using new_name, new_prefix, old_prefix, old_name;
  end loop;

  update public.inventory_operations
  set project = case when project = old_name then new_name else project end,
      project_name = case when project_name = old_name then new_name else project_name end
  where project = old_name or project_name = old_name;
end
$migration$;

-- Production originally returned `project_name`, while the client contract
-- expects `name`. Recreate the function because PostgreSQL cannot rename an
-- output column with CREATE OR REPLACE FUNCTION.
drop function if exists public.get_used_project_names();

create function public.get_used_project_names()
returns table(name text)
language sql
stable
security invoker
set search_path = ''
as $function$
  select btrim(project) from public.consumables where nullif(btrim(project), '') is not null
  union select btrim(project) from public.paints where nullif(btrim(project), '') is not null
  union select btrim(project) from public.screws where nullif(btrim(project), '') is not null
  union select btrim(project) from public.stock_screws where nullif(btrim(project), '') is not null
  union select btrim(project) from public.raw_materials where nullif(btrim(project), '') is not null
  union select btrim(project) from public.cylinders where nullif(btrim(project), '') is not null
  union select btrim(project) from public.inventory_operations where nullif(btrim(project), '') is not null
  union select btrim(project_name) from public.inventory_operations where nullif(btrim(project_name), '') is not null;
$function$;

revoke all on function public.get_used_project_names() from public, anon;
grant execute on function public.get_used_project_names() to authenticated;

create or replace function public.prevent_used_project_rename()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.name is distinct from old.name and (
    exists (select 1 from public.consumables where project = old.name)
    or exists (select 1 from public.paints where project = old.name)
    or exists (select 1 from public.screws where project = old.name)
    or exists (select 1 from public.stock_screws where project = old.name)
    or exists (select 1 from public.raw_materials where project = old.name)
    or exists (select 1 from public.cylinders where project = old.name)
    or exists (select 1 from public.inventory_operations where project = old.name)
    or exists (select 1 from public.inventory_operations where project_name = old.name)
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'لا يمكن تعديل اسم هذا القسم لأنه مرتبط بأصناف أو حركات مخزون. يمكنك إنشاء قسم جديد بالاسم الصحيح وإيقاف القسم القديم.';
  end if;
  return new;
end;
$function$;

drop trigger if exists prevent_used_project_rename on public.projects;
create trigger prevent_used_project_rename
before update of name on public.projects
for each row execute function public.prevent_used_project_rename();

revoke all on function public.prevent_used_project_rename() from public, anon, authenticated;
