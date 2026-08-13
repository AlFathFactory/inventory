# Dynamic categories

Dynamic categories let a user create, rename, and archive inventory categories at runtime — no code change, no new SQL table, no deployment. They exist alongside the original **legacy categories** (`consumables`, `paints`, `screws`, `stock_screws`, `raw_materials`, `cylinders`), which are still hardcoded in [`src/config/categoryConfig.ts`](../src/config/categoryConfig.ts), each backed by its own physical table. The two systems are read-unified in dashboards, low-stock alerts, and reports, but they are managed and written through separate code paths. This document covers the dynamic system only.

## Why it exists

The legacy model requires a new Postgres table plus frontend config for every category. Dynamic categories replace that with two generic tables — `categories` and one shared `inventory_items` table — so adding "قسم جديد" is a form submission, not a migration.

## Data model

Added by [`supabase/migrations/20260812073542_add_dynamic_categories_hybrid.sql`](../supabase/migrations/20260812073542_add_dynamic_categories_hybrid.sql).

### `categories`

| column | notes |
| --- | --- |
| `id` | uuid PK |
| `name` | Arabic display name; unique among active (non-archived) rows |
| `slug` | auto-generated, currently unused by the UI |
| `parent_id` | FK to `categories.id`, for future nesting — not used today |
| `code_prefix` | auto-assigned short code, e.g. `DC001`, `DC002`… (see below) |
| `is_archived` | soft-delete flag |
| `created_at` / `updated_at` | maintained by `trg_categories_touch` |

### `inventory_items`

Column-for-column shaped like the legacy stock tables so it unions cleanly into the shared views/RPCs:

`id, category_id (FK → categories), project, item_name, transaction_date, issued, added, total_added, total_issued, stock_balance, min_quantity, source_file, source_sheet, created_at, updated_at, item_key, is_archived, merged_into_item_id, notes, opening_balance, internal_code, supplier_name`

`source_sheet` is kept in sync with the parent category's `name` by a trigger, purely for backward compatibility with view logic written against the legacy tables' `source_sheet` column.

### Triggers

- `trg_categories_touch`, `trg_items_touch` — bump `updated_at`.
- `trg_items_sync_sheet` → `tg_sync_source_sheet()` — copies `categories.name` into `inventory_items.source_sheet` whenever `category_id` is set/changed.
- `trg_categories_prefix` → `tg_categories_set_prefix()` — on insert, if no `code_prefix` is supplied, assigns the next value from a sequence as `'DC' || nnn` (e.g. `DC001`). This code is permanent: renaming a category never changes it.
- `trg_record_new_inventory_item_as_add` → `record_new_stock_item_as_add_movement()` — on insert, automatically writes an `add` row into `inventory_operations` equal to the item's opening balance, labelled with `coalesce(source_sheet, 'قسم جديد')`.

### RLS

RLS is enabled on both tables, but the policies grant `anon` full `select/insert/update/delete` (`using (true)`), matching how the legacy tables are secured. **Postgres does not enforce access control here** — the app's authorization is a client-side password gate in [`src/config/accessControl.ts`](../src/config/accessControl.ts). Anyone with the anon key and network access to Supabase can read/write these tables directly.

### RPCs specific to dynamic categories

- `create_category(p_name, p_parent_id default null) → categories` — validates a non-empty name, inserts, returns the full row (`code_prefix` is filled in by the trigger).
- `create_inventory_item(p_category_id, p_item_name, p_opening_balance default 0, p_min_quantity default 0, p_supplier_name default null, p_notes default null) → inventory_items` — validates the category exists, inserts, and seeds both `stock_balance` and `added`/`total_added` with the opening balance so the item's own totals agree with the auto `add` movement.
- `generate_inventory_internal_code_rpc(p_table_name, p_item_id)` and `assign_inventory_internal_code` — extended (in [`20260812074908_dynamic_categories_internal_codes.sql`](../supabase/migrations/20260812074908_dynamic_categories_internal_codes.sql)) with an `inventory_items` branch: resolves the numbering prefix from the item's category's `code_prefix`, then allocates the next code from that category's own sequence via `allocate_inventory_internal_code(prefix)`, and records it in the shared `inventory_internal_codes` ledger.
- `get_used_project_names()` — widened with `union select ... from inventory_items` so the project-name autocomplete used when creating items also reflects projects used by dynamic items.

### Existing RPCs widened to accept `inventory_items` as `p_table_name`

All in [`20260812090000_dynamic_categories_shared_rpcs_and_views.sql`](../supabase/migrations/20260812090000_dynamic_categories_shared_rpcs_and_views.sql), so the generic stock-operation engine (add / issue / adjust / return / delete / match / update-details) works for dynamic items without a parallel implementation:

- `apply_inventory_operation_rpc`
- `apply_inventory_operation_transactional_rpc` (both overloads, with/without `p_request_id` for idempotency)
- `delete_inventory_operation_rpc`
- `delete_inventory_record_permanently_rpc`
- `match_inventory_item_rpc`
- `return_inventory_item_rpc`
- `update_inventory_item_details_rpc` / `update_inventory_item_details_with_version_rpc`

Unlike the legacy tables (which hardcode Arabic category labels like `'مستهلكات'`), when `p_table_name = 'inventory_items'` these functions resolve the label dynamically from `categories.name` (falling back to the item's own `source_sheet`).

### Views

- `inventory_category_items_summary_view` — has a `UNION ALL` arm for `inventory_items`, tagged `table_name = 'inventory_items'`, joined to `categories` for `category_name` (falls back to `source_sheet`, then `'غير مصنف'`). Status (`آمن` / `قليل` / `منتهي`) is computed the same way as the legacy arms.
- `inventory_item_movements_view` — `supplier_name`/`internal_code` lookups extended to also resolve from `inventory_items` when the movement's `table_name = 'inventory_items'`.

### Dashboard summary RPC

`get_inventory_dashboard_summary_rpc` (finalized in [`20260813100000_include_dynamic_items_in_dashboard.sql`](../supabase/migrations/20260813100000_include_dynamic_items_in_dashboard.sql)) returns one JSONB payload including:

- `dynamic_category_counts` — `[{category_id, category_name, row_count}]` for every active category with ≥1 non-archived item.
- `inventory_rows` — a 6th `UNION ALL` branch for `inventory_items`, each row tagged `table_name='inventory_items'`, with `category_id`/`category_name`.

Before this migration, `total_items`/`low_stock_count` were already correct (they read the summary view, which already unioned `inventory_items`), but `dashboard_rows`/`category_counts` were separately hand-written unions that had been left out when dynamic categories first shipped — so dynamic items were invisible on the dashboard even though totals were right. This migration closed that gap.

### Realtime publication

[`20260813120000_add_dynamic_inventory_realtime_publication.sql`](../supabase/migrations/20260813120000_add_dynamic_inventory_realtime_publication.sql) adds `categories` and `inventory_items` to the `supabase_realtime` publication:

```sql
foreach v_table_name in array array['inventory_items', 'categories'] loop
  alter publication supabase_realtime add table public.<table>;
end loop;
```

Before this, the frontend's realtime subscription code for these tables existed but silently received nothing, because Postgres logical replication was never emitting events for them.

## Frontend architecture

### Dynamic-categories feature module — `src/features/dynamic-categories/`

- `types.ts` — hand-written TypeScript types (there is no generated `database.types.ts` in this repo; types are maintained by hand alongside the schema).
- `dynamicCategoryService.ts` — all Supabase calls: `listDynamicCategories`, `createDynamicCategory`, `renameDynamicCategory`, `setDynamicCategoryArchived`, `listDynamicCategoryItems`, `createDynamicInventoryItem`, `updateDynamicInventoryItem`, `setDynamicInventoryItemArchived`, `getDynamicCategoryErrorMessage` (maps Postgres error codes to Arabic UI messages).
- `dynamicCategoryQueries.ts` — React Query hooks and the `dynamicCategoryKeys` query-key factory (see below).
- `dynamicCategoryRoutes.ts` — route-building helpers (`getDynamicCategoryItemsRoute`, `getDynamicItemDetailsRoute`).
- `dynamicItemUtils.ts` — client-side search matching (`matchesDynamicItemSearch`, Arabic-aware) and stock-status derivation (`getDynamicItemStockStatus`).
- `dynamicItemOperationService.ts` — wraps the shared add/issue/return RPCs for a dynamic item and exposes `invalidateDynamicItemStockData`.
- `components/DynamicItemFormDialog.tsx` — create/edit item form (name, opening balance, min quantity, supplier, notes).
- `components/DynamicItemOperationDialog.tsx` — add/issue/return dialog; internally builds an ad-hoc `CategoryDefinition`-shaped object (`table: 'inventory_items'`) so it can reuse the same `InventoryOperationModal` the legacy categories use.
- `components/DynamicStockStatusBadge.tsx` — renders safe/low/out badge.

### Pages

- [`src/pages/DynamicCategoriesPage.tsx`](../src/pages/DynamicCategoriesPage.tsx) — route `/dynamic-categories`. Category management: create, rename, archive/reactivate, search, status filter, summary metrics (active/archived count, total linked items).
- [`src/pages/DynamicCategoryItemsPage.tsx`](../src/pages/DynamicCategoryItemsPage.tsx) — route `/dynamic-categories/:categoryId/items`. Item list for one category: create item, search, stock-status filter, archive filter, sort by name/code/balance/updated.
- [`src/pages/DynamicItemDetailsPage.tsx`](../src/pages/DynamicItemDetailsPage.tsx) — route `/dynamic-categories/:categoryId/items/:itemId`. Item detail, movement history, add/issue/return operations.

### Shared/cross-cutting files that also touch dynamic categories

- `src/hooks/useInventoryRealtime.ts` + `src/services/inventoryRealtimeService.ts` — realtime subscription and query-invalidation mapping (see below).
- `src/services/inventoryService.ts` — `getDynamicLowStockRows()` for the low-stock page.
- `src/services/dashboardService.ts` — merges legacy `category_counts` and `dynamic_category_counts` into one dashboard payload.
- `src/features/dashboard/utils/dashboardInventoryRows.ts` — `buildDynamicDashboardInventoryRows` alongside the legacy `buildDashboardInventoryRows`.
- `src/features/low-stock/utils/lowStockRows.ts` — `mapDynamicLowStockRows` alongside `mapLowStockRows`.
- `src/features/inventory-operations/InventoryOperationModal.tsx` — the generic add/issue/adjust modal reused by both systems.
- `src/services/itemsService.ts` — `getItemMovements('inventory_items', itemId)` for movement history, shared with legacy items.
- `src/features/reports/*` — Excel/PDF report generation includes `inventory_items` rows automatically because it reads `inventory_category_items_summary_view`.
- `src/components/Sidebar.tsx` — nav entry "التصنيفات الديناميكية" linking to `/dynamic-categories`.
- `src/config/accessControl.ts` — route-access regexes for the dynamic-category routes.
- `src/app/App.tsx` — registers the three routes above.

Note: the Excel/JSON bulk import pipeline (`src/features/import/`, `src/utils/excelParser.ts`, `customExcelImportService.ts`) only targets the legacy tables — there is no bulk import into dynamic categories.

## End-to-end flow

### 1. Creating a category

`DynamicCategoriesPage.tsx` → "+ إضافة تصنيف" opens a dialog → `useCreateDynamicCategory().mutateAsync(name)` → `createDynamicCategory()` normalizes the name (trims/collapses whitespace) → `client.rpc('create_category', { p_name, p_parent_id: null })`. The trigger assigns `code_prefix`. On success, the `dynamic-categories` query is invalidated and the list refetches.

### 2. Renaming / archiving a category

- Rename: direct `client.from('categories').update({ name }).eq('id', categoryId)` — not an RPC. `code_prefix` never changes.
- Archive/reactivate: `client.from('categories').update({ is_archived })`.

### 3. Creating an item

A dynamic item can only be created from inside a category's item page — there is no free-text "type a new category" combobox like the legacy `project` field has. `DynamicCategoryItemsPage.tsx` → "+ إضافة صنف" opens `DynamicItemFormDialog` (name, opening balance, min quantity, supplier, notes) → `useCreateDynamicItem().mutateAsync(input)` → `createDynamicInventoryItem()` runs three steps:

1. `create_inventory_item` RPC inserts the row (fires the auto "add" movement trigger).
2. `generate_inventory_internal_code_rpc` allocates the item's internal code from the category's sequence. Failure here doesn't roll back the item — it's surfaced as a non-blocking toast (`DynamicItemCodeGenerationError`).
3. A refetch confirms `internal_code` is present.

### 4. Displaying and filtering

- Category list: table/cards with name, `DC` code badge, item count (via a Postgrest embedded `inventory_items(count)` select — no separate count query), status, created date. Filterable by search + active/archived/all.
- Item list within a category: server-side `ilike` search across `item_name` / `internal_code` / `supplier_name` / `project`, followed by a client-side Arabic-normalized re-filter and stock-status filter, plus sorting.
- Item detail: item info, movement history, and add/issue/return dialogs reusing the shared `InventoryOperationModal`.
- Dashboard: category cards for both systems are merged; the combined inventory-rows table tags each row `categoryKey: CategoryKey | 'dynamic'` with a `categoryLabel` resolved from `category_name` (or `'غير مصنف'`).
- Low-stock/out-of-stock alerts: the 5 legacy per-table queries run alongside `getDynamicLowStockRows()` (loads active categories for name lookup, paginates non-archived `inventory_items`, filters `stock_balance <= min_quantity` client-side), all merged into one severity-sorted table.
- Reports: Excel/PDF exports include dynamic items automatically since they're sourced from the unified summary view.

### 5. Deleting

There is no hard delete in the UI for either categories or items — only soft-archive (`is_archived`). An archived category disables its "+ إضافة صنف" button (no new items can be added to it) but remains browsable, and its existing items stay visible.

## Real-time updates and cache invalidation

Two layers work together:

**1. Supabase Realtime** (`src/services/inventoryRealtimeService.ts`) — a single channel subscribes to `postgres_changes` on all legacy tables plus `inventory_items`, `categories`, `projects`, and `imports`, calling a callback tagged with an event `kind` (`'inventory' | 'dynamic-inventory' | 'projects' | 'imports'`). This only works because `categories`/`inventory_items` are in the `supabase_realtime` publication (added by the migration above — before that, changes made in one browser tab were invisible in another).

**2. React Query invalidation** (`src/hooks/useInventoryRealtime.ts`) — batches incoming events with a 1s trailing debounce, then maps the event kind to query keys via `getInvalidationTargetsForEventKey`. For `'dynamic-inventory'` events it invalidates:

```ts
inventoryKeys.alerts()
dynamicCategoryKeys.all
dynamicCategoryKeys.detailRoot
dynamicCategoryKeys.itemsListRoot
dynamicCategoryKeys.itemRoot
dynamicCategoryKeys.movementsRoot
```

It also force-invalidates `inventoryKeys.dashboard()` if ≥2s have passed since the last fetch, regardless of event kind.

### Query keys (`dynamicCategoryQueries.ts`)

```ts
dynamicCategoryKeys = {
  all: ['dynamic-categories'],
  detail: (categoryId) => ['dynamic-category', categoryId],
  detailRoot: ['dynamic-category'],
  itemsRoot: (categoryId) => ['dynamic-category-items', categoryId],
  itemsListRoot: ['dynamic-category-items'],
  items: (categoryId, filters) => ['dynamic-category-items', categoryId, filters],
  item: (itemId) => ['dynamic-item', itemId],
  itemRoot: ['dynamic-item'],
  movements: (itemId) => ['dynamic-item-movements', itemId],
  movementsRoot: ['dynamic-item-movements'],
}
```

Every mutation (`useCreateDynamicCategory`, `useRenameDynamicCategory`, `useSetDynamicCategoryArchived`, `useCreateDynamicItem`, `useUpdateDynamicItem`, `useSetDynamicItemArchived`) invalidates the relevant subset on success. `invalidateDynamicItemStockData(queryClient, categoryId, itemId)` additionally invalidates `inventoryKeys.dashboard()`, `inventoryKeys.alerts()`, `reportKeys.all`, and `partyKeys.all` after a stock operation, since a balance change ripples into the dashboard, low-stock alerts, reports, and supplier/party views.

## Known gaps

- Category rename is not guarded server-side against categories that already have linked items (the only rename-guard trigger shipped, `prevent_used_project_rename`, protects the legacy `projects` table, not `categories`). The client-side error mapper anticipates a `P0001`/"linked inventory" error, but no trigger currently raises it for `categories`.
- RLS on `categories`/`inventory_items` grants `anon` unrestricted access; authorization is enforced only by the client-side password gate in `accessControl.ts`, not by Postgres.
- Bulk Excel/JSON import does not support dynamic categories — only the 5 legacy tables.
