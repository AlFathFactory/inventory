import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCategoryRows: vi.fn(),
  getItemDetails: vi.fn(),
  getItemMovements: vi.fn(),
  getProjects: vi.fn(),
  getActiveProjects: vi.fn(),
  searchActiveParties: vi.fn(),
  getEmployeeCustodyItems: vi.fn(),
}))

vi.mock('../services/inventoryService', () => ({ getCategoryRows: mocks.getCategoryRows }))
vi.mock('../services/itemsService', () => ({
  getItemDetails: mocks.getItemDetails,
  getItemMovements: mocks.getItemMovements,
}))
vi.mock('../services/projectsService', () => ({
  getProjects: mocks.getProjects,
  getActiveProjects: mocks.getActiveProjects,
}))
vi.mock('../services/partiesService', () => ({ searchActiveParties: mocks.searchActiveParties }))
vi.mock('../features/employee-custody/employeeCustodyService', () => ({
  getEmployeeCustodyItems: mocks.getEmployeeCustodyItems,
}))

import { supabaseReadRepositories } from './supabaseRepositories'

describe('supabaseReadRepositories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('delegates category rows to the existing service unchanged', async () => {
    const expected = { data: [{ id: '1' }], error: null }
    mocks.getCategoryRows.mockResolvedValue(expected)

    const result = await supabaseReadRepositories.inventory.listCategoryRows('consumables')

    expect(mocks.getCategoryRows).toHaveBeenCalledWith('consumables')
    expect(result).toBe(expected)
  })

  it('delegates item details and movements with the same arguments', async () => {
    mocks.getItemDetails.mockResolvedValue({ data: { id: 'i1' }, error: null })
    mocks.getItemMovements.mockResolvedValue({ data: [], error: null })

    await supabaseReadRepositories.inventory.getItemDetails('paints', 'i1')
    await supabaseReadRepositories.movements.listItemMovements('paints', 'i1')

    expect(mocks.getItemDetails).toHaveBeenCalledWith('paints', 'i1')
    expect(mocks.getItemMovements).toHaveBeenCalledWith('paints', 'i1')
  })

  it('passes service failures straight through', async () => {
    mocks.getCategoryRows.mockResolvedValue({ data: null, error: 'boom' })

    expect(await supabaseReadRepositories.inventory.listCategoryRows('screws'))
      .toEqual({ data: null, error: 'boom' })
  })

  it('delegates both project queries', async () => {
    mocks.getProjects.mockResolvedValue({ data: [], error: null })
    mocks.getActiveProjects.mockResolvedValue({ data: [], error: null })

    await supabaseReadRepositories.projects.listProjects()
    await supabaseReadRepositories.projects.listActiveProjects()

    expect(mocks.getProjects).toHaveBeenCalledOnce()
    expect(mocks.getActiveProjects).toHaveBeenCalledOnce()
  })

  it('wraps party lookups by kind', async () => {
    mocks.searchActiveParties.mockResolvedValue([{ id: 'e1', name: 'n', is_active: true }])

    const employees = await supabaseReadRepositories.parties.listEmployees()
    const suppliers = await supabaseReadRepositories.parties.listSuppliers()

    expect(mocks.searchActiveParties).toHaveBeenNthCalledWith(1, 'employee')
    expect(mocks.searchActiveParties).toHaveBeenNthCalledWith(2, 'supplier')
    expect(employees.data).toHaveLength(1)
    expect(suppliers.error).toBeNull()
  })

  it('converts thrown service errors into typed failures', async () => {
    mocks.getEmployeeCustodyItems.mockRejectedValue(new Error('تعذر التحميل'))

    expect(await supabaseReadRepositories.custody.listEmployeeCustodyItems('e1'))
      .toEqual({ data: null, error: 'تعذر التحميل' })
  })
})
