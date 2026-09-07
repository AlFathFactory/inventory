import { getLocalDb } from '../lib/localDb/connection'
import { normalizeCustodyRecord } from '../features/employee-custody/employeeCustodyService'
import { SYNC_TABLE_NAMES } from '../services/desktopSync/syncTables'
import {
  repositoryFailure,
  repositoryOk,
  type CustodyReadRepository,
  type InventoryReadRepository,
  type MovementsReadRepository,
  type PartiesReadRepository,
  type ProjectsReadRepository,
  type ReadRepositories,
  type RepositoryResult,
} from './contracts'
import {
  buildCategorySummarySql,
  buildItemDetailsSql,
  CYLINDER_BY_ID_SQL,
  CYLINDER_LIST_SQL,
  CYLINDERS_TABLE,
  hasCategorySummaryProjection,
  toCategorySummaryItem,
  toCylinderSummaryItem,
} from './local/categorySummaryProjection'
import {
  buildCustodyCategoryListSql,
  buildCustodyRecordSql,
  isCustodyCategoryTable,
  toCustodyCategorySummaryItem,
  toCustodyRecord,
} from './local/custodyCategoryProjection'
import {
  buildAllocationsSql,
  collectIssueIds,
  ITEM_MOVEMENTS_SQL,
  toEmployeeAllocation,
  toItemMovement,
} from './local/movementsProjection'
import type { LocalRow } from './local/rowValues'
import type { MovementEmployeeAllocation } from '../services/itemsService'
import type { Project } from '../services/projectsService'
import type { Employee, Supplier } from '../services/partiesService'
import type { EmployeeCustodyRecord } from '../features/employee-custody/types'

/**
 * Desktop implementations, reading the synced SQLite database only.
 *
 * These never fall back to Supabase: if local data cannot be read the
 * caller gets a typed failure, and a table with no synced rows returns an
 * empty list. That keeps "not synced yet" visible instead of silently
 * serving remote data on a machine expected to be offline-capable.
 */

const READABLE_TABLES = new Set<string>(SYNC_TABLE_NAMES)

/** Guards the only place a table name reaches SQL text. */
function assertReadableTable(tableName: string) {
  if (!READABLE_TABLES.has(tableName)) {
    throw new Error(`الجدول "${tableName}" غير متاح محليًا`)
  }
}

/** Category lists additionally need a projection for the table. */
function assertSummaryTable(tableName: string) {
  assertReadableTable(tableName)
  if (!hasCategorySummaryProjection(tableName) && !isCustodyCategoryTable(tableName)) {
    throw new Error(`لا يوجد ملخص أصناف محلي للجدول "${tableName}"`)
  }
}

/**
 * Rows come back untyped by default; the inventory and movement reads narrow
 * them through the projection mappers rather than asserting a domain type
 * onto a raw table row. The remaining reads select an explicit column list
 * that already matches their domain type one-for-one.
 */
async function selectRows<T = LocalRow>(sql: string, bindings: unknown[] = []): Promise<T[]> {
  const db = await getLocalDb()
  return db.select<T[]>(sql, bindings)
}

async function guard<T>(
  work: () => Promise<T>,
  fallback: string,
): Promise<RepositoryResult<T>> {
  try {
    return repositoryOk(await work())
  } catch (error) {
    return repositoryFailure<T>(error instanceof Error ? error.message : fallback)
  }
}

const inventory: InventoryReadRepository = {
  listCategoryRows(tableName) {
    return guard(async () => {
      assertSummaryTable(tableName)

      // Custody categories have no summary view behind them on web either.
      if (isCustodyCategoryTable(tableName)) {
        const rows = await selectRows(buildCustodyCategoryListSql(tableName))
        return rows.map((row) => toCustodyCategorySummaryItem(row, tableName))
      }

      // Cylinders come straight off their own table on web too, so the same
      // mapper is reused instead of the summary projection.
      if (tableName === CYLINDERS_TABLE) {
        return (await selectRows(CYLINDER_LIST_SQL)).map(toCylinderSummaryItem)
      }

      const rows = await selectRows(buildCategorySummarySql(tableName))
      return rows.map((row) => toCategorySummaryItem(row, tableName))
    }, `تعذر تحميل بيانات "${tableName}" محليًا`)
  },

  getItemDetails(tableName, itemId) {
    return guard(async () => {
      assertSummaryTable(tableName)

      if (tableName === CYLINDERS_TABLE) {
        const rows = await selectRows(CYLINDER_BY_ID_SQL, [itemId])
        return rows[0] ? toCylinderSummaryItem(rows[0]) : null
      }

      // Primary-key lookup.
      const rows = await selectRows(buildItemDetailsSql(tableName), [itemId])
      return rows[0] ? toCategorySummaryItem(rows[0], tableName) : null
    }, 'تعذر تحميل تفاصيل الصنف محليًا')
  },

  getCustodyRecord(tableName, recordId) {
    return guard(async () => {
      assertReadableTable(tableName)
      const rows = await selectRows(buildCustodyRecordSql(tableName), [recordId])
      return rows[0] ? toCustodyRecord(rows[0], tableName) : null
    }, 'تعذر تحميل تفاصيل سجل العهدة محليًا')
  },
}

const movements: MovementsReadRepository = {
  listItemMovements(tableName, itemId) {
    return guard(async () => {
      assertReadableTable(tableName)
      // Served by inventory_operations_item_idx (table_name, item_id).
      const rows = await selectRows(ITEM_MOVEMENTS_SQL, [tableName, itemId])
      if (rows.length === 0) return []

      const allocationsByIssue = await loadAllocations(collectIssueIds(rows))
      return rows.map((row) => toItemMovement(
        row,
        allocationsByIssue.get(String(row.id)) ?? [],
      ))
    }, 'تعذر تحميل حركات الصنف محليًا')
  },
}

/** Per-employee allocations for the issue rows, keyed by issue operation id. */
async function loadAllocations(issueIds: string[]) {
  const allocationsByIssue = new Map<string, MovementEmployeeAllocation[]>()
  if (issueIds.length === 0) return allocationsByIssue

  // Served by inventory_operation_employee_allocations_issue_idx.
  const rows = await selectRows(buildAllocationsSql(issueIds.length), issueIds)
  for (const row of rows) {
    const issueId = String(row.issue_operation_id)
    const current = allocationsByIssue.get(issueId) ?? []
    current.push(toEmployeeAllocation(row))
    allocationsByIssue.set(issueId, current)
  }
  return allocationsByIssue
}

const projects: ProjectsReadRepository = {
  listProjects() {
    return guard(
      () => selectRows<Project>(
        'SELECT id, name, code, status, notes, created_at, updated_at FROM projects ORDER BY name',
      ),
      'تعذر تحميل الأقسام محليًا',
    )
  },

  listActiveProjects() {
    return guard(
      () => selectRows<Project>(
        `SELECT id, name, code, status, notes, created_at, updated_at FROM projects
         WHERE status = 'active' ORDER BY name`,
      ),
      'تعذر تحميل الأقسام النشطة محليًا',
    )
  },
}

/** SQLite stores booleans as 0/1; the UI types expect real booleans. */
function withActiveFlag<T extends { is_active: unknown }>(rows: T[]) {
  return rows.map((row) => ({ ...row, is_active: Boolean(row.is_active) }))
}

const parties: PartiesReadRepository = {
  listEmployees() {
    return guard(async () => {
      const rows = await selectRows<Employee & { is_active: unknown }>(
        `SELECT id, name, employee_code, department, phone, notes, is_active, created_at, updated_at
         FROM employees WHERE is_active = 1 ORDER BY name`,
      )
      return withActiveFlag(rows) as Employee[]
    }, 'تعذر تحميل الموظفين محليًا')
  },

  listSuppliers() {
    return guard(async () => {
      const rows = await selectRows<Supplier & { is_active: unknown }>(
        `SELECT id, name, supplier_code, phone, contact_person, notes, is_active, created_at, updated_at
         FROM suppliers WHERE is_active = 1 ORDER BY name`,
      )
      return withActiveFlag(rows) as Supplier[]
    }, 'تعذر تحميل الموردين محليًا')
  },
}

const custody: CustodyReadRepository = {
  listEmployeeCustodyItems(employeeId) {
    return guard(async () => {
      // Served by employee_custody_items_employee_idx.
      const custodyRows = await selectRows<LocalRow>(
        `SELECT * FROM employee_custody_items WHERE employee_id = $1 ORDER BY received_date DESC`,
        [employeeId],
      )
      if (custodyRows.length === 0) {
        return [] as EmployeeCustodyRecord[]
      }

      // Item names live in the per-category tables; fetch only the ids we need.
      const idsByTable = new Map<string, string[]>()
      for (const row of custodyRows) {
        const table = String(row.table_name ?? '')
        const itemId = String(row.item_id ?? '')
        if (!READABLE_TABLES.has(table) || !itemId) continue
        idsByTable.set(table, [...(idsByTable.get(table) ?? []), itemId])
      }

      const itemsByKey = new Map<string, LocalRow>()
      for (const [table, ids] of idsByTable) {
        const placeholders = ids.map((_, index) => `$${index + 1}`).join(', ')
        const items = await selectRows<LocalRow>(
          `SELECT * FROM ${table} WHERE id IN (${placeholders})`,
          ids,
        )
        for (const item of items) {
          itemsByKey.set(`${table}:${String(item.id)}`, item)
        }
      }

      // Reuse the existing normalizer so desktop rows land in the same shape
      // the web path produces.
      return custodyRows.map((row) => normalizeCustodyRecord({
        ...row,
        item: itemsByKey.get(`${String(row.table_name)}:${String(row.item_id)}`) ?? null,
      }))
    }, 'تعذر تحميل عهدة الموظف محليًا')
  },
}

export const localReadRepositories: ReadRepositories = {
  inventory,
  movements,
  projects,
  parties,
  custody,
}
