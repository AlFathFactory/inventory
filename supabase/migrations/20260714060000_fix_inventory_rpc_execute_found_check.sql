do $$
declare
  rpc record;
  fixed_definition text;
begin
  for rpc in
    select p.oid, pg_get_functiondef(p.oid) as definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'apply_inventory_operation_transactional_rpc'
  loop
    fixed_definition := rpc.definition;

    if fixed_definition like '%v_current_balance numeric%'
       and fixed_definition like '%if not found then%' then
      fixed_definition := replace(
        fixed_definition,
        'if not found then',
        'if v_current_balance is null then'
      );
    elsif fixed_definition like '%previous_balance numeric%'
          and fixed_definition like '%if not found then%' then
      fixed_definition := replace(
        fixed_definition,
        'if not found then',
        'if previous_balance is null then'
      );
    else
      continue;
    end if;

    execute fixed_definition;
  end loop;
end;
$$;
