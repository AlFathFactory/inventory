import {
  computeMovementReturnState,
  resolveAllocationStatus,
  type ItemMovement,
  type MovementEmployeeAllocation,
} from '../../services/itemsService'
import { asId, asNumeric, asText, type LocalRow } from './rowValues'

/**
 * SQLite reproduction of `public.inventory_item_movements_view`.
 *
 * The derived columns the item-details screen depends on — running totals,
 * `returned_quantity`, `return_status`, `remaining_returnable_quantity` and
 * the original-issue fields — are computed here exactly as the Postgres view
 * computes them, rather than being read off `inventory_operations` raw.
 *
 * The view's `PARTITION BY (table_name, item_id)` matches the WHERE clause,
 * so restricting rows first leaves the running totals unchanged.
 */

const RUNNING_TOTAL_WINDOW =
  'OVER (PARTITION BY op.table_name, op.item_id ORDER BY op.operation_date, op.created_at, op.id)'

/** Item tables the view joins for supplier/code metadata, keyed by alias. */
const METADATA_JOINS: ReadonlyArray<readonly [alias: string, table: string]> = [
  ['rm', 'raw_materials'],
  ['sc', 'screws'],
  ['ss', 'stock_screws'],
  ['co', 'consumables'],
  ['pa', 'paints'],
  ['cy', 'cylinders'],
  ['ii', 'inventory_items'],
]

/** `COALESCE(CASE WHEN table_name = 'x' THEN x.<column> END, ...)`. */
function metadataFallback(column: string, aliases: readonly string[]): string {
  const branches = METADATA_JOINS.filter(([alias]) => aliases.includes(alias)).map(
    ([alias, table]) => `CASE WHEN op.table_name = '${table}' THEN ${alias}.${column} END`,
  )
  return branches.join(',\n      ')
}

export const ITEM_MOVEMENTS_SQL = `SELECT
    op.id AS id,
    op.table_name AS table_name,
    COALESCE(op.category_name, op.category_label) AS category_name,
    op.category_label AS category_label,
    op.item_id AS item_id,
    op.item_name AS item_name,
    op.item_label AS item_label,
    op.project_name AS project_name,
    op.project AS project,
    op.operation_type AS operation_type,
    op.quantity AS quantity,
    op.operation_date AS operation_date,
    CASE WHEN op.operation_type = 'issue' THEN op.quantity ELSE 0 END AS issued_quantity,
    CASE WHEN op.operation_type = 'add' THEN op.quantity ELSE 0 END AS added_quantity,
    op.previous_balance AS previous_balance,
    op.new_balance AS new_balance,
    SUM(CASE WHEN op.operation_type = 'add' THEN op.quantity ELSE 0 END)
      ${RUNNING_TOTAL_WINDOW} AS total_added_until_operation,
    SUM(CASE WHEN op.operation_type = 'issue' THEN op.quantity ELSE 0 END)
      ${RUNNING_TOTAL_WINDOW} AS total_issued_until_operation,
    COALESCE(
      op.supplier_name,
      ${METADATA_JOINS.map(([alias]) => `${alias}.supplier_name`).join(', ')}
    ) AS supplier_name,
    op.issued_to AS issued_to,
    op.received_by AS received_by,
    op.purchase_order_number AS purchase_order_number,
    op.addition_code AS addition_code,
    op.issue_code AS issue_code,
    op.item_code AS item_code,
    COALESCE(
      ${metadataFallback('code_number', ['rm', 'sc', 'ss'])},
      op.item_code
    ) AS code_number,
    COALESCE(
      ${metadataFallback('internal_code', ['rm', 'sc', 'ss', 'co', 'pa', 'cy', 'ii'])}
    ) AS internal_code,
    op.notes AS notes,
    op.created_by AS created_by,
    op.created_at AS created_at,
    CASE
      WHEN op.operation_type = 'issue' THEN COALESCE(return_totals.returned_quantity, 0)
      WHEN op.operation_type = 'return' THEN op.quantity
      ELSE 0
    END AS returned_quantity,
    CASE
      WHEN op.operation_type <> 'issue' THEN 'not_returned'
      WHEN COALESCE(return_totals.returned_quantity, 0) <= 0 THEN 'not_returned'
      WHEN COALESCE(return_totals.returned_quantity, 0) >= op.quantity THEN 'fully_returned'
      ELSE 'partially_returned'
    END AS return_status,
    CASE
      WHEN op.operation_type = 'issue'
        THEN MAX(op.quantity - COALESCE(return_totals.returned_quantity, 0), 0)
      ELSE 0
    END AS remaining_returnable_quantity,
    op.related_operation_id AS related_operation_id,
    original_issue.issued_to AS original_issued_to,
    original_issue.operation_date AS original_issue_date,
    original_issue.issue_code AS original_issue_code
  FROM inventory_operations op
  ${METADATA_JOINS.map(([alias, table]) =>
    `LEFT JOIN ${table} ${alias} ON op.table_name = '${table}' AND op.item_id = ${alias}.id`,
  ).join('\n  ')}
  LEFT JOIN inventory_operations original_issue ON original_issue.id = op.related_operation_id
  LEFT JOIN (
    SELECT related_operation_id, SUM(quantity) AS returned_quantity
    FROM inventory_operations
    WHERE operation_type = 'return' AND related_operation_id IS NOT NULL
    GROUP BY related_operation_id
  ) return_totals ON return_totals.related_operation_id = op.id
  WHERE op.table_name = $1 AND op.item_id = $2
  ORDER BY op.operation_date DESC, op.created_at DESC, op.id DESC`

/** Per-employee allocations for the issue rows in a movement list. */
export function buildAllocationsSql(issueCount: number): string {
  const placeholders = Array.from({ length: issueCount }, (_, index) => `$${index + 1}`)
  return `SELECT issue_operation_id, employee_id, employee_name_snapshot,
            allocated_quantity, returned_quantity
     FROM inventory_operation_employee_allocations
     WHERE issue_operation_id IN (${placeholders.join(', ')})`
}

export function toEmployeeAllocation(row: LocalRow): MovementEmployeeAllocation {
  return {
    employee_id: String(asId(row.employee_id)),
    employee_name_snapshot: asText(row.employee_name_snapshot) ?? '',
    allocated_quantity: asNumeric(row.allocated_quantity),
    returned_quantity: asNumeric(row.returned_quantity) ?? 0,
  }
}

/**
 * Field-by-field projection of a movement row — no assertion over the raw
 * operation row. Derived return state and allocation status come from the
 * shared helpers the Supabase path also uses.
 */
export function toItemMovement(
  row: LocalRow,
  employeeAllocations: MovementEmployeeAllocation[],
): ItemMovement {
  return {
    id: asId(row.id),
    table_name: asText(row.table_name) ?? '',
    category_name: asText(row.category_name),
    category_label: asText(row.category_label),
    item_id: asId(row.item_id),
    internal_code: asText(row.internal_code),
    item_name: asText(row.item_name),
    item_label: asText(row.item_label),
    project_name: asText(row.project_name),
    project: asText(row.project),
    operation_type: asText(row.operation_type),
    quantity: asNumeric(row.quantity),
    operation_date: asText(row.operation_date),
    issued_quantity: asNumeric(row.issued_quantity),
    added_quantity: asNumeric(row.added_quantity),
    returned_quantity: asNumeric(row.returned_quantity),
    // Declared on the domain type but never projected by the Postgres view
    // either, so the desktop path leaves it unset the same way.
    quantity_already_returned: null,
    remaining_returnable_quantity: asNumeric(row.remaining_returnable_quantity),
    previous_balance: asNumeric(row.previous_balance),
    new_balance: asNumeric(row.new_balance),
    total_added_until_operation: asNumeric(row.total_added_until_operation),
    total_issued_until_operation: asNumeric(row.total_issued_until_operation),
    supplier_name: asText(row.supplier_name),
    issued_to: asText(row.issued_to),
    received_by: asText(row.received_by),
    purchase_order_number: asText(row.purchase_order_number),
    addition_code: asText(row.addition_code),
    issue_code: asText(row.issue_code),
    item_code: asText(row.item_code),
    code_number: asText(row.code_number),
    notes: asText(row.notes),
    created_by: asText(row.created_by),
    created_at: asText(row.created_at),
    related_operation_id: asText(row.related_operation_id),
    original_issued_to: asText(row.original_issued_to),
    original_issue_date: asText(row.original_issue_date),
    original_issue_code: asText(row.original_issue_code),
    ...computeMovementReturnState({
      quantity: row.quantity,
      returned_quantity: row.returned_quantity,
      return_status: row.return_status,
      related_operation_id: row.related_operation_id,
    }),
    employeeAllocations,
    allocationStatus: resolveAllocationStatus(employeeAllocations),
  }
}

/** Ids of the issue rows that can carry allocations. */
export function collectIssueIds(rows: LocalRow[]): string[] {
  return rows
    .filter((row) => row.operation_type === 'issue')
    .map((row) => String(asId(row.id)))
}
