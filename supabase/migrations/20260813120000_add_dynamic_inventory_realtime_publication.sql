-- Add public.inventory_items and public.categories to the realtime
-- publication so dynamic-item mutations propagate cross-session/cross-tab,
-- the same way the legacy stock tables already do.
--
-- Audit: `select * from pg_publication_tables where pubname =
-- 'supabase_realtime'` showed consumables, paints, screws, stock_screws,
-- raw_materials, cylinders, cutting_discs, long_welding_gloves, projects,
-- imports — but NOT inventory_items or categories. That is the entire
-- root cause: Postgres never emitted logical-replication change events for
-- those two tables, so no realtime payload could ever reach any browser
-- tab regardless of frontend subscription code. This is a pure backend
-- publication gap; the frontend subscribes to whatever tables are in this
-- publication and cannot work around its absence.
--
-- Follows the exact idempotent-guard pattern already used in
-- 20260809104141_optimize_dashboard_realtime_and_offline_idempotency.sql
-- (existence-checked per table, so re-running this migration, or this
-- migration running after a manual fix, is a safe no-op).
--
-- No RLS/grant changes: publication membership only controls which
-- committed row changes are broadcast over realtime, not who can read
-- rows via the normal PostgREST/RPC path (unchanged).

do $$
declare
  v_table_name text;
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;

  foreach v_table_name in array array['inventory_items', 'categories'] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table_name
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        v_table_name
      );
    end if;
  end loop;
end;
$$;
