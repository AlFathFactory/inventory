import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isDesktopRuntime: vi.fn(),
  listEmployees: vi.fn(),
  listSuppliers: vi.fn(),
  getCachedParties: vi.fn(),
}))

vi.mock('../../config/platform', () => ({ isDesktopRuntime: mocks.isDesktopRuntime }))
vi.mock('../../repositories', () => ({
  getPartiesRepository: async () => ({
    listEmployees: mocks.listEmployees,
    listSuppliers: mocks.listSuppliers,
  }),
}))
vi.mock('../../services/partiesService', () => ({
  getCachedParties: mocks.getCachedParties,
  partyKeys: { list: (kind: string) => ['parties', kind, 'list'] },
}))

import { loadPartyList, partyListQueryOptions } from './partyQueries'

describe('partyQueries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCachedParties.mockResolvedValue([{ id: 'cached' }])
  })

  it('keeps the existing query key', () => {
    expect(partyListQueryOptions('employee').queryKey).toEqual(['parties', 'employee', 'list'])
  })

  describe('desktop', () => {
    beforeEach(() => mocks.isDesktopRuntime.mockReturnValue(true))

    it('reads employees from SQLite without touching the browser cache', async () => {
      mocks.listEmployees.mockResolvedValue({ data: [{ id: 'e1' }], error: null })

      await expect(loadPartyList('employee')).resolves.toEqual([{ id: 'e1' }])
      expect(mocks.getCachedParties).not.toHaveBeenCalled()
    })

    it('reads suppliers from SQLite', async () => {
      mocks.listSuppliers.mockResolvedValue({ data: [{ id: 's1' }], error: null })

      await expect(loadPartyList('supplier')).resolves.toEqual([{ id: 's1' }])
      expect(mocks.listEmployees).not.toHaveBeenCalled()
    })

    it('returns an empty list for an empty local table', async () => {
      mocks.listEmployees.mockResolvedValue({ data: [], error: null })

      await expect(loadPartyList('employee')).resolves.toEqual([])
      expect(mocks.getCachedParties).not.toHaveBeenCalled()
    })

    it('throws a typed error instead of falling back', async () => {
      mocks.listEmployees.mockResolvedValue({ data: null, error: 'تعذر تحميل الموظفين محليًا' })

      await expect(loadPartyList('employee')).rejects.toThrow('تعذر تحميل الموظفين محليًا')
      expect(mocks.getCachedParties).not.toHaveBeenCalled()
    })
  })

  describe('web', () => {
    beforeEach(() => mocks.isDesktopRuntime.mockReturnValue(false))

    it('keeps reading the existing browser cache', async () => {
      await expect(loadPartyList('employee')).resolves.toEqual([{ id: 'cached' }])
      expect(mocks.getCachedParties).toHaveBeenCalledWith('employee')
      expect(mocks.listEmployees).not.toHaveBeenCalled()
    })
  })
})
