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
    it('reads category rows from the local table', async () => {
      selectMock.mockResolvedValue([{ id: 'a' }])

      const result = await localReadRepositories.inventory.listCategoryRows('consumables')

      expect(lastSql()).toBe('SELECT * FROM consumables')
      expect(result).toEqual({ data: [{ id: 'a' }], error: null })
    })

    it('rejects a table that is not synced locally', async () => {
      const result = await localReadRepositories.inventory.listCategoryRows('sqlite_master')

      expect(result.data).toBeNull()
      expect(result.error).toContain('sqlite_master')
      expect(selectMock).not.toHaveBeenCalled()
    })

    it('looks up item details by primary key', async () => {
      selectMock.mockResolvedValue([{ id: 'i1', item_name: 'صنف' }])

      const result = await localReadRepositories.inventory.getItemDetails('paints', 'i1')

      expect(lastSql()).toBe('SELECT * FROM paints WHERE id = $1 LIMIT 1')
      expect(selectMock.mock.calls.at(-1)?.[1]).toEqual(['i1'])
      expect(result.data).toMatchObject({ id: 'i1' })
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

      expect(lastSql()).toBe(
        'SELECT * FROM inventory_operations WHERE table_name = $1 AND item_id = $2 ' +
        'ORDER BY operation_date DESC, created_at DESC',
      )
      expect(selectMock.mock.calls.at(-1)?.[1]).toEqual(['raw_materials', 'i9'])
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
