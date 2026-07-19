-- Project names are historical text in inventory records. Once a name has
-- been used, keep it immutable so those records cannot become detached.
create or replace function public.get_used_project_names()
returns table(name text)
language sql
security invoker
set search_path = ''
as $$
  select project from public.consumables where project is not null
  union select project from public.paints where project is not null
  union select project from public.screws where project is not null
  union select project from public.stock_screws where project is not null
  union select project from public.raw_materials where project is not null
  union select project from public.cylinders where project is not null
  union select project from public.inventory_operations where project is not null
  union select project_name from public.inventory_operations where project_name is not null;
$$;

create or replace function public.prevent_used_project_rename()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
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
      message = 'لا يمكن تعديل اسم هذا المشروع لأنه مرتبط بأصناف أو حركات مخزون. يمكنك إنشاء مشروع جديد بالاسم الصحيح وإيقاف المشروع القديم.';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_used_project_rename on public.projects;
create trigger prevent_used_project_rename
before update of name on public.projects
for each row execute function public.prevent_used_project_rename();

revoke all on function public.get_used_project_names() from public, anon;
grant execute on function public.get_used_project_names() to authenticated;
