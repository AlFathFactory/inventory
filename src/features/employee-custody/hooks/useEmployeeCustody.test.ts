import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isDesktopRuntime: vi.fn(),
  listEmployeeCustodyItems: vi.fn(),
  getEmployeeCustodyItems: vi.fn(),
  useQuery: vi.fn(),
}))

vi.mock('../../../config/platform', () => ({ isDesktopRuntime: mocks.isDesktopRuntime }))
vi.mock('../../../repositories', () => ({
  getCustodyRepository: async () => ({
    listEmployeeCustodyItems: mocks.listEmployeeCustodyItems,
  }),
}))
vi.mock('../employeeCustodyService', () => ({
  getEmployeeCustodyItems: mocks.getEmployeeCustodyItems,
  employeeCustodyKeys: { employee: (id: string) => ['custody', id] },
  addEmployeeCustodyItems: vi.fn(),
  scrapEmployeeCustodyItem: vi.fn(),
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mocks.useQuery(options),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
}))

import { useEmployeeCustody } from './useEmployeeCustody'

/** Grabs the queryFn the hook handed to react-query. */
function useCapturedOptions() {
  useEmployeeCustody('e1')
  const options = mocks.useQuery.mock.calls.at(-1)?.[0] as { queryFn: () => Promise<unknown>; queryKey: unknown }
  return options
}

describe('useEmployeeCustody', () => {
  beforeEach(() => vi.clearAllMocks())

  it('keeps the existing query key', () => {
    expect(useCapturedOptions().queryKey).toEqual(['custody', 'e1'])
  })

  it('reads custody from SQLite on desktop, never the Supabase RPC', async () => {
    mocks.isDesktopRuntime.mockReturnValue(true)
    mocks.listEmployeeCustodyItems.mockResolvedValue({ data: [{ id: 'c1' }], error: null })

    await expect(useCapturedOptions().queryFn()).resolves.toEqual([{ id: 'c1' }])
    expect(mocks.getEmployeeCustodyItems).not.toHaveBeenCalled()
  })

  it('returns an empty custody list when nothing is synced locally', async () => {
    mocks.isDesktopRuntime.mockReturnValue(true)
    mocks.listEmployeeCustodyItems.mockResolvedValue({ data: [], error: null })

    await expect(useCapturedOptions().queryFn()).resolves.toEqual([])
    expect(mocks.getEmployeeCustodyItems).not.toHaveBeenCalled()
  })

  it('throws a typed error on desktop instead of falling back', async () => {
    mocks.isDesktopRuntime.mockReturnValue(true)
    mocks.listEmployeeCustodyItems.mockResolvedValue({ data: null, error: 'تعذر تحميل عهدة الموظف محليًا' })

    await expect(useCapturedOptions().queryFn()).rejects.toThrow('تعذر تحميل عهدة الموظف محليًا')
    expect(mocks.getEmployeeCustodyItems).not.toHaveBeenCalled()
  })

  it('keeps using the existing service on web', async () => {
    mocks.isDesktopRuntime.mockReturnValue(false)
    mocks.getEmployeeCustodyItems.mockResolvedValue([{ id: 'remote' }])

    await expect(useCapturedOptions().queryFn()).resolves.toEqual([{ id: 'remote' }])
    expect(mocks.listEmployeeCustodyItems).not.toHaveBeenCalled()
  })
})
