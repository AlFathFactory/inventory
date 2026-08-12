-- ROLLBACK SNAPSHOT — captured immediately before applying
-- 20260812090000_dynamic_categories_shared_rpcs_and_views.sql
-- (production project fifbsrsuazoztwvzijpx)
--
-- To roll back inventory_category_items_summary_view or
-- inventory_item_movements_view, run:
--   create or replace view public.<name> as <definition below>;
--
-- To roll back a trigger, run the CREATE TRIGGER statement below
-- (drop trigger if exists <name> on <table> first).

-- ============================================================
-- VIEW: inventory_category_items_summary_view (pre-migration)
-- ============================================================
create or replace view public.inventory_category_items_summary_view as
 SELECT 'consumables'::text AS table_name,
    'مستهلكات'::text AS category_name,
    c.id AS item_id,
    c.item_key,
    c.project AS project_name,
    c.item_name,
    c.stock_balance,
    c.min_quantity,
        CASE
            WHEN (COALESCE(c.stock_balance, (0)::numeric) <= (0)::numeric) THEN 'منتهي'::text
            WHEN (COALESCE(c.stock_balance, (0)::numeric) <= COALESCE(c.min_quantity, (0)::numeric)) THEN 'قليل'::text
            ELSE 'آمن'::text
        END AS status,
    c.total_added,
    c.total_issued,
    (1)::bigint AS source_rows_count,
    NULL::numeric AS weight,
    NULL::numeric AS length,
    NULL::numeric AS width,
    NULL::numeric AS th,
    NULL::text AS material_source,
    NULL::date AS expire_date,
    c.supplier_name,
    c.notes,
    c.updated_at,
    c.created_at,
    NULL::text AS code_number,
    NULL::text AS din,
    c.internal_code
   FROM consumables c
  WHERE (COALESCE(c.is_archived, false) = false)
UNION ALL
 SELECT 'paints'::text AS table_name,
    'الدهانات'::text AS category_name,
    p.id AS item_id,
    p.item_key,
    p.project AS project_name,
    p.item_name,
    p.stock_balance,
    p.min_quantity,
        CASE
            WHEN (COALESCE(p.stock_balance, (0)::numeric) <= (0)::numeric) THEN 'منتهي'::text
            WHEN (COALESCE(p.stock_balance, (0)::numeric) <= COALESCE(p.min_quantity, (0)::numeric)) THEN 'قليل'::text
            ELSE 'آمن'::text
        END AS status,
    p.total_added,
    p.total_issued,
    (1)::bigint AS source_rows_count,
    NULL::numeric AS weight,
    NULL::numeric AS length,
    NULL::numeric AS width,
    NULL::numeric AS th,
    NULL::text AS material_source,
    p.expire_date,
    p.supplier_name,
    p.notes,
    p.updated_at,
    p.created_at,
    NULL::text AS code_number,
    NULL::text AS din,
    p.internal_code
   FROM paints p
  WHERE (COALESCE(p.is_archived, false) = false)
UNION ALL
 SELECT 'screws'::text AS table_name,
    'مسامير'::text AS category_name,
    s.id AS item_id,
    s.item_key,
    s.project AS project_name,
    s.item_name,
    s.stock_balance,
    s.min_quantity,
        CASE
            WHEN (COALESCE(s.stock_balance, (0)::numeric) <= (0)::numeric) THEN 'منتهي'::text
            WHEN (COALESCE(s.stock_balance, (0)::numeric) <= COALESCE(s.min_quantity, (0)::numeric)) THEN 'قليل'::text
            ELSE 'آمن'::text
        END AS status,
    s.total_added,
    s.total_issued,
    (1)::bigint AS source_rows_count,
    NULL::numeric AS weight,
    NULL::numeric AS length,
    NULL::numeric AS width,
    NULL::numeric AS th,
    NULL::text AS material_source,
    NULL::date AS expire_date,
    s.supplier_name,
    s.notes,
    s.updated_at,
    s.created_at,
    s.code_number,
    s.din,
    s.internal_code
   FROM screws s
  WHERE (COALESCE(s.is_archived, false) = false)
UNION ALL
 SELECT 'stock_screws'::text AS table_name,
    'مسامير استوك'::text AS category_name,
    ss.id AS item_id,
    ss.item_key,
    ss.project AS project_name,
    ss.item_name,
    ss.stock_balance,
    ss.min_quantity,
        CASE
            WHEN (COALESCE(ss.stock_balance, (0)::numeric) <= (0)::numeric) THEN 'منتهي'::text
            WHEN (COALESCE(ss.stock_balance, (0)::numeric) <= COALESCE(ss.min_quantity, (0)::numeric)) THEN 'قليل'::text
            ELSE 'آمن'::text
        END AS status,
    ss.total_added,
    ss.total_issued,
    (1)::bigint AS source_rows_count,
    NULL::numeric AS weight,
    NULL::numeric AS length,
    NULL::numeric AS width,
    NULL::numeric AS th,
    NULL::text AS material_source,
    NULL::date AS expire_date,
    ss.supplier_name,
    ss.notes,
    ss.updated_at,
    ss.created_at,
    ss.code_number,
    ss.din,
    ss.internal_code
   FROM stock_screws ss
  WHERE (COALESCE(ss.is_archived, false) = false)
UNION ALL
 SELECT 'raw_materials'::text AS table_name,
    'خامات'::text AS category_name,
    r.id AS item_id,
    r.item_key,
    r.project AS project_name,
    r.item_name,
    r.stock_balance,
    r.min_quantity,
        CASE
            WHEN (COALESCE(r.stock_balance, (0)::numeric) <= (0)::numeric) THEN 'منتهي'::text
            WHEN (COALESCE(r.stock_balance, (0)::numeric) <= COALESCE(r.min_quantity, (0)::numeric)) THEN 'قليل'::text
            ELSE 'آمن'::text
        END AS status,
    r.total_added,
    r.total_issued,
    (1)::bigint AS source_rows_count,
    r.weight,
    r.length,
    r.width,
    r.th,
    r.material_source,
    NULL::date AS expire_date,
    r.supplier_name,
    r.notes,
    r.updated_at,
    r.created_at,
    r.code_number,
    r.din,
    r.internal_code
   FROM raw_materials r
  WHERE (COALESCE(r.is_archived, false) = false)
UNION ALL
 SELECT 'cylinders'::text AS table_name,
    'اسطوانات'::text AS category_name,
    cy.id AS item_id,
    cy.item_key,
    cy.project AS project_name,
    cy.type_name AS item_name,
    cy.gas_balance AS stock_balance,
    COALESCE(cy.min_quantity, (0)::numeric) AS min_quantity,
        CASE
            WHEN (COALESCE(cy.gas_balance, (0)::numeric) <= (0)::numeric) THEN 'منتهي'::text
            WHEN (COALESCE(cy.gas_balance, (0)::numeric) <= COALESCE(cy.min_quantity, (0)::numeric)) THEN 'قليل'::text
            ELSE 'آمن'::text
        END AS status,
    cy.full_count AS total_added,
    cy.empty_count AS total_issued,
    (1)::bigint AS source_rows_count,
    NULL::numeric AS weight,
    NULL::numeric AS length,
    NULL::numeric AS width,
    NULL::numeric AS th,
    NULL::text AS material_source,
    NULL::date AS expire_date,
    cy.supplier_name,
    cy.notes,
    cy.updated_at,
    cy.created_at,
    NULL::text AS code_number,
    NULL::text AS din,
    cy.internal_code
   FROM cylinders cy
  WHERE (COALESCE(cy.is_archived, false) = false);

-- ============================================================
-- VIEW: inventory_item_movements_view (pre-migration)
-- ============================================================
create or replace view public.inventory_item_movements_view as
 SELECT op.id,
    op.table_name,
        CASE
            WHEN (op.table_name = 'cones4_materials'::text) THEN 'raw_materials'::text
            ELSE op.table_name
        END AS display_table_name,
    COALESCE(op.category_name, op.category_label) AS category_name,
    op.category_label,
    op.item_id,
    op.item_name,
    op.item_label,
    op.project_name,
    op.project,
    op.operation_type,
    op.quantity,
    op.operation_date,
        CASE
            WHEN (op.operation_type = 'issue'::text) THEN op.quantity
            ELSE (0)::numeric
        END AS issued_quantity,
        CASE
            WHEN (op.operation_type = 'add'::text) THEN op.quantity
            ELSE (0)::numeric
        END AS added_quantity,
    op.previous_balance,
    op.new_balance,
    sum(
        CASE
            WHEN (op.operation_type = 'add'::text) THEN op.quantity
            ELSE (0)::numeric
        END) OVER (PARTITION BY op.table_name, op.item_id ORDER BY op.operation_date, op.created_at, op.id) AS total_added_until_operation,
    sum(
        CASE
            WHEN (op.operation_type = 'issue'::text) THEN op.quantity
            ELSE (0)::numeric
        END) OVER (PARTITION BY op.table_name, op.item_id ORDER BY op.operation_date, op.created_at, op.id) AS total_issued_until_operation,
    COALESCE(op.supplier_name, rm.supplier_name, sc.supplier_name, ss.supplier_name, co.supplier_name, pa.supplier_name, cy.supplier_name) AS supplier_name,
    op.issued_to,
    op.received_by,
    op.purchase_order_number,
    op.addition_code,
    op.issue_code,
    op.item_code,
        CASE
            WHEN (op.table_name = 'raw_materials'::text) THEN rm.weight
            ELSE NULL::numeric
        END AS weight,
        CASE
            WHEN (op.table_name = 'raw_materials'::text) THEN rm.length
            ELSE NULL::numeric
        END AS length,
        CASE
            WHEN (op.table_name = 'raw_materials'::text) THEN rm.width
            ELSE NULL::numeric
        END AS width,
        CASE
            WHEN (op.table_name = 'raw_materials'::text) THEN rm.th
            ELSE NULL::numeric
        END AS th,
        CASE
            WHEN (op.table_name = 'raw_materials'::text) THEN rm.material_source
            ELSE NULL::text
        END AS material_source,
    op.notes,
    op.created_by,
    op.created_at,
    COALESCE(
        CASE
            WHEN (op.table_name = 'raw_materials'::text) THEN rm.code_number
            ELSE NULL::text
        END,
        CASE
            WHEN (op.table_name = 'screws'::text) THEN sc.code_number
            ELSE NULL::text
        END,
        CASE
            WHEN (op.table_name = 'stock_screws'::text) THEN ss.code_number
            ELSE NULL::text
        END, op.item_code) AS code_number,
    COALESCE(
        CASE
            WHEN (op.table_name = 'raw_materials'::text) THEN rm.din
            ELSE NULL::text
        END,
        CASE
            WHEN (op.table_name = 'screws'::text) THEN sc.din
            ELSE NULL::text
        END,
        CASE
            WHEN (op.table_name = 'stock_screws'::text) THEN ss.din
            ELSE NULL::text
        END) AS din,
    COALESCE(
        CASE
            WHEN (op.table_name = 'raw_materials'::text) THEN rm.internal_code
            ELSE NULL::text
        END,
        CASE
            WHEN (op.table_name = 'screws'::text) THEN sc.internal_code
            ELSE NULL::text
        END,
        CASE
            WHEN (op.table_name = 'stock_screws'::text) THEN ss.internal_code
            ELSE NULL::text
        END,
        CASE
            WHEN (op.table_name = 'consumables'::text) THEN co.internal_code
            ELSE NULL::text
        END,
        CASE
            WHEN (op.table_name = 'paints'::text) THEN pa.internal_code
            ELSE NULL::text
        END,
        CASE
            WHEN (op.table_name = 'cylinders'::text) THEN cy.internal_code
            ELSE NULL::text
        END) AS internal_code,
        CASE
            WHEN (op.operation_type = 'issue'::text) THEN COALESCE(return_totals.returned_quantity, (0)::numeric)
            WHEN (op.operation_type = 'return'::text) THEN op.quantity
            ELSE (0)::numeric
        END AS returned_quantity,
        CASE
            WHEN (op.operation_type <> 'issue'::text) THEN 'not_returned'::text
            WHEN (COALESCE(return_totals.returned_quantity, (0)::numeric) <= (0)::numeric) THEN 'not_returned'::text
            WHEN (COALESCE(return_totals.returned_quantity, (0)::numeric) >= op.quantity) THEN 'fully_returned'::text
            ELSE 'partially_returned'::text
        END AS return_status,
        CASE
            WHEN (op.operation_type = 'issue'::text) THEN GREATEST((op.quantity - COALESCE(return_totals.returned_quantity, (0)::numeric)), (0)::numeric)
            ELSE (0)::numeric
        END AS remaining_returnable_quantity,
    op.related_operation_id,
    original_issue.issued_to AS original_issued_to,
    original_issue.operation_date AS original_issue_date,
    original_issue.issue_code AS original_issue_code
   FROM inventory_operations op
     LEFT JOIN raw_materials rm ON (op.table_name = 'raw_materials'::text) AND (op.item_id = rm.id)
     LEFT JOIN screws sc ON (op.table_name = 'screws'::text) AND (op.item_id = sc.id)
     LEFT JOIN stock_screws ss ON (op.table_name = 'stock_screws'::text) AND (op.item_id = ss.id)
     LEFT JOIN consumables co ON (op.table_name = 'consumables'::text) AND (op.item_id = co.id)
     LEFT JOIN paints pa ON (op.table_name = 'paints'::text) AND (op.item_id = pa.id)
     LEFT JOIN cylinders cy ON (op.table_name = 'cylinders'::text) AND (op.item_id = cy.id)
     LEFT JOIN inventory_operations original_issue ON (original_issue.id = op.related_operation_id)
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(return_op.quantity), (0)::numeric) AS returned_quantity
           FROM inventory_operations return_op
          WHERE (return_op.related_operation_id = op.id) AND (return_op.operation_type = 'return'::text)) return_totals ON (true);

-- ============================================================
-- TRIGGERS affected by the migration (pre-migration state)
-- trg_record_new_inventory_item_as_add does NOT exist yet — it is
-- newly created by the migration.
-- ============================================================
CREATE TRIGGER trg_record_new_consumable_as_add AFTER INSERT ON public.consumables FOR EACH ROW EXECUTE FUNCTION record_new_stock_item_as_add_movement();
CREATE TRIGGER trg_record_new_paint_as_add AFTER INSERT ON public.paints FOR EACH ROW EXECUTE FUNCTION record_new_stock_item_as_add_movement();
CREATE TRIGGER trg_record_new_screw_as_add AFTER INSERT ON public.screws FOR EACH ROW EXECUTE FUNCTION record_new_stock_item_as_add_movement();
CREATE TRIGGER trg_record_new_stock_screw_as_add AFTER INSERT ON public.stock_screws FOR EACH ROW EXECUTE FUNCTION record_new_stock_item_as_add_movement();
CREATE TRIGGER trg_record_new_raw_material_as_add AFTER INSERT ON public.raw_materials FOR EACH ROW EXECUTE FUNCTION record_new_stock_item_as_add_movement();
CREATE TRIGGER trg_record_new_cylinder_as_add AFTER INSERT ON public.cylinders FOR EACH ROW EXECUTE FUNCTION record_new_stock_item_as_add_movement();
CREATE TRIGGER trg_items_touch BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION tg_touch_updated_at();
CREATE TRIGGER trg_items_sync_sheet BEFORE INSERT OR UPDATE OF category_id ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION tg_sync_source_sheet();
-- Rollback for the new trigger: DROP TRIGGER IF EXISTS trg_record_new_inventory_item_as_add ON public.inventory_items;
