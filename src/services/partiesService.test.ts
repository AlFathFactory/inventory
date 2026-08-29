import { afterEach, describe, expect, it, vi } from 'vitest'

const { getCachedPartyRecords } = vi.hoisted(() => ({
  getCachedPartyRecords: vi.fn(),
}))

vi.mock('./offlineBootstrapService', () => ({
  cachePartyRecords: vi.fn(),
  getCachedPartyRecords,
}))

import {
  filterPartiesForSearch,
  searchAvailableParties,
  type Employee,
} from './partiesService'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('offline party search compatibility', () => {
  const employees: Employee[] = [
    {
      id: 'employee-1',
      name: 'أحمد محمد',
      employee_code: 'EMP-17',
      department: 'المخزن',
      phone: '01000000000',
      is_active: true,
    },
  ]

  it('searches Arabic names and employee metadata locally', () => {
    expect(filterPartiesForSearch('employee', employees, 'احمد')).toHaveLength(1)
    expect(filterPartiesForSearch('employee', employees, 'احمدمحمد')).toHaveLength(1)
    expect(filterPartiesForSearch('employee', employees, 'EMP-17')).toHaveLength(1)
    expect(filterPartiesForSearch('employee', employees, 'المخزن')).toHaveLength(1)
  })

  it('loads cached employees for the issue dropdown while offline', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    getCachedPartyRecords.mockResolvedValue([
      {
        id: 'employee-1', kind: 'employee', name: 'Ahmed', code: 'EMP-17',
        detail: 'Warehouse', phone: null, isActive: true,
      },
      {
        id: 'employee-2', kind: 'employee', name: 'Inactive employee', code: null,
        detail: null, phone: null, isActive: false,
      },
    ])

    await expect(searchAvailableParties('employee', '')).resolves.toEqual([
      expect.objectContaining({ id: 'employee-1', name: 'Ahmed' }),
    ])
  })

  it('loads cached suppliers for the addition dropdown while offline', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    getCachedPartyRecords.mockResolvedValue([
      {
        id: 'supplier-1', kind: 'supplier', name: 'Supplier One', code: 'SUP-1',
        detail: 'Contact', phone: '0100', isActive: true,
      },
    ])

    await expect(searchAvailableParties('supplier', '')).resolves.toEqual([
      expect.objectContaining({ id: 'supplier-1', name: 'Supplier One' }),
    ])
  })
})
