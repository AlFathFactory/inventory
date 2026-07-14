-- The current SPA does not establish an authenticated Supabase session yet,
-- so Data API calls use the anon role. This function is read-only and remains
-- SECURITY INVOKER, meaning underlying table RLS still controls visible rows.
revoke all on function public.get_inventory_dashboard_summary_rpc() from public;
grant execute on function public.get_inventory_dashboard_summary_rpc() to anon, authenticated;
