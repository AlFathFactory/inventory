import { beforeEach, describe, expect, it, vi } from 'vitest'

const { selectMock } = vi.hoisted(() => ({ selectMock: vi.fn() }))

vi.mock('../lib/localDb/connection', () => ({
  getLocalDb: vi.fn().mockResolvedValue({ select: selectMock }),
}))

import { localReadRepositories } from './localRepositories'

/** Last SQL statement issued, whitespace-collapsed for readable assertions. */
function lastSql() {
  return String(selectMock.mock.calls.at(-1)?.[0]).replace(/\s+/g, ' ').trim()
}

describe('localReadRepositories', () => {
  beforeEach(() => {
    selectMock.mockReset()
    selectMock.mockResolvedValue([])
  })

  describe('inventory', () => {
    it('returns summary items, not raw table rows', async () => {
      selectMock.mockResolvedValue([{
        item_id: 'a',
        category_name: 'مستهلكات',
        item_name: 'صنف',
        stock_balance: 2,
        min_quantity: 5,
        status: 'قليل',
        source_rows_count: 1,
      }])

      const result = await localReadRepositories.inventory.listCategoryRows('consumables')

      expect(lastSql()).toContain('FROM consumables t')
      expect(result.data?.[0]).toMatchObject({
        table_name: 'consumables',
        category_name: 'مستهلكات',
        item_id: 'a',
        status: 'قليل',
        source_rows_count: 1,
      })
    })

    it('orders and filters the list the way the web view does', async () => {
      await localReadRepositories.inventory.listCategoryRows('consumables')

      expect(lastSql()).toContain('WHERE COALESCE(t.is_archived, 0) = 0')
      expect(lastSql()).toContain('ORDER BY t.item_name, t.id')
    })

    it('projects raw-material dimensions and metadata', async () => {
      await localReadRepositories.inventory.listCategoryRows('raw_materials')

      const sql = lastSql()
      expect(sql).toContain('t.weight AS weight')
      expect(sql).toContain('t.material_source AS material_source')
      expect(sql).toContain('t.code_number AS code_number')
      expect(sql).toContain('t.dimension_text AS dimension_text')
    })

    it('projects the paint production date the web path merges in', async () => {
      await localReadRepositories.inventory.listCategoryRows('paints')

      expect(lastSql()).toContain('t.production_date AS production_date')
    })

    it('resolves dynamic item categories through the categories table', async () => {
      await localReadRepositories.inventory.listCategoryRows('inventory_items')

      expect(lastSql()).toContain("COALESCE(cat.name, t.source_sheet, 'غير مصنف')")
      expect(lastSql()).toContain('LEFT JOIN categories cat ON cat.id = t.category_id')
    })

    it('reads cylinders from their own table, like the web path', async () => {
      selectMock.mockResolvedValue([{ id: 'cy1', type_name: 'أكسجين', gas_balance: 3, min_quantity: 1 }])

      const result = await localReadRepositories.inventory.listCategoryRows('cylinders')

      expect(lastSql()).toBe('SELECT * FROM cylinders ORDER BY type_name, id')
      expect(result.data?.[0]).toMatchObject({
        table_name: 'cylinders',
        category_name: 'اسطوانات',
        item_id: 'cy1',
        item_name: 'أكسجين',
        stock_balance: 3,
        status: 'آمن',
      })
    })

    it('rejects a table that is not synced locally', async () => {
      const result = await localReadRepositories.inventory.listCategoryRows('sqlite_master')

      expect(result.data).toBeNull()
      expect(result.error).toContain('sqlite_master')
      expect(selectMock).not.toHaveBeenCalled()
    })

    it('rejects a synced table that has no summary projection', async () => {
      const result = await localReadRepositories.inventory.listCategoryRows('employees')

      expect(result.data).toBeNull()
      expect(result.error).toContain('employees')
      expect(selectMock).not.toHaveBeenCalled()
    })

    it('reads cutting discs locally instead of reporting them unavailable', async () => {
      selectMock.mockResolvedValue([{ id: 'cd1', type_name: 'صاروخ', code: 'C-1' }])

      const result = await localReadRepositories.inventory.listCategoryRows('cutting_discs')

      expect(result.error).toBeNull()
      expect(lastSql()).toBe('SELECT * FROM cutting_discs ORDER BY received_date DESC')
      expect(result.data?.[0]).toMatchObject({
        table_name: 'cutting_discs',
        category_name: 'صواريخ',
        item_id: 'cd1',
        item_name: 'صاروخ',
        code: 'C-1',
        source_rows_count: 1,
      })
    })

    it('reads long welding gloves locally, filtering archived rows', async () => {
      selectMock.mockResolvedValue([{ id: 'g1', type_name: 'جوانتي' }])

      const result = await localReadRepositories.inventory.listCategoryRows('long_welding_gloves')

      expect(result.error).toBeNull()
      expect(lastSql()).toBe(
        'SELECT * FROM long_welding_gloves WHERE COALESCE(is_archived, 0) = 0 ' +
        'ORDER BY received_date DESC',
      )
      expect(result.data?.[0]).toMatchObject({
        table_name: 'long_welding_gloves',
        category_name: 'جوانتي لحام طويل',
        item_name: 'جوانتي',
      })
    })

    it('reads a single custody record by primary key', async () => {
      selectMock.mockResolvedValue([{ id: 'cd1', type_name: 'صاروخ', scrapped_date: '2026-01-01' }])

      const result = await localReadRepositories.inventory.getCustodyRecord('cutting_discs', 'cd1')

      expect(lastSql()).toBe('SELECT * FROM cutting_discs WHERE id = $1 LIMIT 1')
      expect(selectMock.mock.calls.at(-1)?.[1]).toEqual(['cd1'])
      expect(result.data).toMatchObject({ id: 'cd1', scrapped_date: '2026-01-01' })
    })

    it('returns null for a custody record missing locally', async () => {
      expect(await localReadRepositories.inventory.getCustodyRecord('cutting_discs', 'nope'))
        .toEqual({ data: null, error: null })
    })

    it('looks up item details by primary key', async () => {
      selectMock.mockResolvedValue([{ item_id: 'i1', item_name: 'صنف' }])

      const result = await localReadRepositories.inventory.getItemDetails('paints', 'i1')

      expect(lastSql()).toContain('WHERE t.id = $1 LIMIT 1')
      expect(selectMock.mock.calls.at(-1)?.[1]).toEqual(['i1'])
      expect(result.data).toMatchObject({ item_id: 'i1', table_name: 'paints' })
    })

    it('returns null details when the item is not present locally', async () => {
      expect(await localReadRepositories.inventory.getItemDetails('paints', 'missing'))
        .toEqual({ data: null, error: null })
    })

    it('returns an empty list rather than an error for an empty local table', async () => {
      expect(await localReadRepositories.inventory.listCategoryRows('screws'))
        .toEqual({ data: [], error: null })
    })

    it('reports a typed failure when the local database is unavailable', async () => {
      selectMock.mockRejectedValue(new Error('database is locked'))

      expect(await localReadRepositories.inventory.listCategoryRows('screws'))
        .toEqual({ data: null, error: 'database is locked' })
    })
  })

  describe('movements', () => {
    it('queries the indexed (table_name, item_id) pair, newest first', async () => {
      await localReadRepositories.movements.listItemMovements('raw_materials', 'i9')

      const sql = lastSql()
      expect(sql).toContain('WHERE op.table_name = $1 AND op.item_id = $2')
      expect(sql).toContain('ORDER BY op.operation_date DESC, op.created_at DESC, op.id DESC')
      expect(selectMock.mock.calls.at(-1)?.[1]).toEqual(['raw_materials', 'i9'])
    })

    it('derives the running totals and return state in SQL', async () => {
      await localReadRepositories.movements.listItemMovements('screws', 'i9')

      const sql = lastSql()
      expect(sql).toContain('PARTITION BY op.table_name, op.item_id')
      expect(sql).toContain('AS total_added_until_operation')
      expect(sql).toContain('AS total_issued_until_operation')
      expect(sql).toContain('AS return_status')
      expect(sql).toContain('AS remaining_returnable_quantity')
      expect(sql).toContain('original_issue.issued_to AS original_issued_to')
    })

    it('maps a partially returned issue into the derived movement shape', async () => {
      selectMock
        .mockResolvedValueOnce([{
          id: 'op1',
          table_name: 'screws',
          item_id: 'i9',
          operation_type: 'issue',
          quantity: 10,
          returned_quantity: 4,
          return_status: 'partially_returned',
          remaining_returnable_quantity: 6,
          related_operation_id: null,
          total_issued_until_operation: 10,
          internal_code: 'SC-1',
        }])
        .mockResolvedValueOnce([])

      const result = await localReadRepositories.movements.listItemMovements('screws', 'i9')

      expect(result.data?.[0]).toMatchObject({
        id: 'op1',
        internal_code: 'SC-1',
        returned_quantity: 4,
        returnedQuantity: 4,
        returnStatus: 'partially_returned',
        remainingReturnableQuantity: 6,
        remaining_returnable_quantity: 6,
        relatedOperationId: null,
        allocationStatus: 'allocated',
      })
    })

    it('carries the original issue fields onto a return row', async () => {
      selectMock.mockResolvedValueOnce([{
        id: 'op2',
        operation_type: 'return',
        quantity: 4,
        returned_quantity: 4,
        return_status: 'not_returned',
        related_operation_id: 'op1',
        original_issued_to: 'أحمد',
        original_issue_date: '2026-01-05',
        original_issue_code: 'IS-9',
      }])

      const result = await localReadRepositories.movements.listItemMovements('screws', 'i9')

      expect(result.data?.[0]).toMatchObject({
        related_operation_id: 'op1',
        relatedOperationId: 'op1',
        original_issued_to: 'أحمد',
        original_issue_date: '2026-01-05',
        original_issue_code: 'IS-9',
      })
      // No issue rows, so the allocation query is skipped.
      expect(selectMock).toHaveBeenCalledTimes(1)
    })

    it('attaches employee allocations and flags pending distribution', async () => {
      selectMock
        .mockResolvedValueOnce([{
          id: 'op1',
          operation_type: 'issue',
          quantity: 10,
          returned_quantity: 0,
          return_status: 'not_returned',
        }])
        .mockResolvedValueOnce([
          {
            issue_operation_id: 'op1',
            employee_id: 'e1',
            employee_name_snapshot: 'أحمد',
            allocated_quantity: null,
            returned_quantity: 0,
          },
          {
            issue_operation_id: 'op1',
            employee_id: 'e2',
            employee_name_snapshot: 'سعيد',
            allocated_quantity: 4,
            returned_quantity: 0,
          },
        ])

      const result = await localReadRepositories.movements.listItemMovements('screws', 'i9')

      expect(lastSql()).toContain('FROM inventory_operation_employee_allocations')
      expect(result.data?.[0].employeeAllocations).toHaveLength(2)
      expect(result.data?.[0].allocationStatus).toBe('pending_distribution')
    })

    it('returns an empty list without querying allocations', async () => {
      expect(await localReadRepositories.movements.listItemMovements('screws', 'i9'))
        .toEqual({ data: [], error: null })
      expect(selectMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('projects', () => {
    it('lists all projects ordered by name', async () => {
      await localReadRepositories.projects.listProjects()

      expect(lastSql()).toContain('FROM projects ORDER BY name')
    })

    it('filters active projects in SQL', async () => {
      await localReadRepositories.projects.listActiveProjects()

      expect(lastSql()).toContain("WHERE status = 'active' ORDER BY name")
    })
  })

  describe('parties', () => {
    it('lists only active employees and restores boolean flags', async () => {
      selectMock.mockResolvedValue([{ id: 'e1', name: 'اسم', is_active: 1 }])

      const result = await localReadRepositories.parties.listEmployees()

      expect(lastSql()).toContain('FROM employees WHERE is_active = 1 ORDER BY name')
      expect(result.data?.[0].is_active).toBe(true)
    })

    it('lists only active suppliers', async () => {
      selectMock.mockResolvedValue([{ id: 's1', name: 'مورد', is_active: 1 }])

      const result = await localReadRepositories.parties.listSuppliers()

      expect(lastSql()).toContain('FROM suppliers WHERE is_active = 1 ORDER BY name')
      expect(result.data?.[0].is_active).toBe(true)
    })
  })

  describe('custody', () => {
    it('resolves custody rows and their item names', async () => {
      selectMock
        .mockResolvedValueOnce([{
          id: 'c1',
          employee_id: 'e1',
          table_name: 'consumables',
          item_id: 'i1',
          quantity: 2,
          received_date: '2026-01-01',
          scrapped_date: null,
          scrap_reason: null,
          notes: null,
        }])
        .mockResolvedValueOnce([{ id: 'i1', item_name: 'قفازات' }])

      const result = await localReadRepositories.custody.listEmployeeCustodyItems('e1')

      expect(result.error).toBeNull()
      expect(result.data).toHaveLength(1)
      expect(result.data?.[0]).toMatchObject({
        id: 'c1',
        employeeId: 'e1',
        tableName: 'consumables',
        itemId: 'i1',
        quantity: 2,
        itemName: 'قفازات',
      })
    })

    it('skips the item lookup entirely when the employee has no custody', async () => {
      const result = await localReadRepositories.custody.listEmployeeCustodyItems('e1')

      expect(result).toEqual({ data: [], error: null })
      expect(selectMock).toHaveBeenCalledTimes(1)
    })
  })
})
