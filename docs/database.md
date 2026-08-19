# Inventory database

The repository contains an ordered Supabase baseline in `supabase/migrations`. Apply it to a new project with the Supabase CLI after reviewing the access policies for the deployment's user model.
## Stock tables
The stock-managed tables are `consumables`, `paints`, `screws`, `stock_screws`, `raw_materials`, and `cylinders`. Every record has a stable `item_key` protected by a unique index. The first five tables use `stock_balance`; cylinders use `gas_balance` and expose it as `stock_balance` through the summary view.

Balances must not be changed by browser-side read/modify/write code. Add, issue, and adjustment operations call `apply_inventory_operation_transactional_rpc`. The function validates the table allowlist, locks the item with `FOR UPDATE`, checks the resulting balance, updates the item, and writes the movement in one transaction. For an adjustment, `quantity` is the final counted balance rather than a difference.

## Custody tables

`cutting_discs` and `long_welding_gloves` represent individually received or assigned custody records. They are not fungible stock balances and therefore do not participate in the stock summary/details views or the transactional stock-operation RPC. Dedicated custody views expose these records without pretending they have minimum-stock or balance semantics.

## Movement history

`inventory_operations` is the append-only audit history for stock operations. `inventory_item_movements_view` supplies the normalized movement contract used by item details. Addition and issue views provide filtered histories.

Interactive operations have no `import_key`. Imported movements must have a deterministic `import_key` composed from file name, sheet name, source row, item key, operation type, operation date, and quantity. A partial unique index makes retries idempotent while allowing ordinary operations to keep a null key.

## Import flow

The custom importer sends bounded JSON chunks to three RPCs:

1. `import_normalized_items_chunk_rpc` upserts stock items by `item_key`.
2. `import_normalized_movements_chunk_rpc` resolves items and inserts movements using `import_key`; conflicts are counted as skipped.
3. `import_normalized_custody_chunk_rpc` upserts custody records by non-null code.

Every RPC returns `inserted`, `updated`, `skipped`, and `errors`. The frontend aggregates these values across completed chunks. A failed chunk stops subsequent work but preserves the completed counts and identifies the failed stage/chunk. Retrying the file cannot duplicate movements because the same source row produces the same `import_key`.

## Views and security

Inventory views are declared with `security_invoker = true`, so the caller's table policies remain effective. RLS is enabled on every exposed table. The baseline grants authenticated users read/write access because the current schema has no tenant or ownership column; deployments needing per-user or per-company isolation must add ownership predicates before production use. RPC execution is revoked from `PUBLIC` and `anon` and granted to `authenticated`.

The migration files are a reviewable baseline, not evidence that a remote project already matches them. Use `supabase db reset`, run database tests, and inspect Supabase security/performance advisors before deploying.
