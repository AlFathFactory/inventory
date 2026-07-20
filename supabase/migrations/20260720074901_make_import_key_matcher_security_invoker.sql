-- This helper only reads import keys and does not require elevated privileges.
alter function public.match_inventory_movement_keys_chunk_rpc(jsonb) security invoker;

revoke execute on function public.match_inventory_movement_keys_chunk_rpc(jsonb) from public;
grant execute on function public.match_inventory_movement_keys_chunk_rpc(jsonb) to anon, authenticated;
