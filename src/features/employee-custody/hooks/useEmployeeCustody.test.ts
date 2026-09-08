import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isDesktopRuntime: vi.fn(),
  listEmployeeCustodyItems: vi.fn(),
  getEmployeeCustodyItems: vi.fn(),
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  invalidateQueries: vi.fn(),
  writeEmployeeCustodyAdds: vi.fn(),
  writeEmployeeCustodyScrap: vi.fn(),
}))

vi.mock('../../../config/platform', () => ({ isDesktopRuntime: mocks.isDesktopRuntime }))
vi.mock('../../../repositories', () => ({
  getCustodyRepository: async () => ({
    listEmployeeCustodyItems: mocks.listEmployeeCustodyItems,
  }),
}))
vi.mock('../employeeCustodyService', () => ({
  getEmployeeCustodyItems: mocks.getEmployeeCustodyItems,
  employeeCustodyKeys: {
    employee: (id: string) => ['custody', id],
    issueCandidates: (id: string) => ['custody-candidates', id],
  },
}))
vi.mock('../../../services/inventoryWrite', () => ({
  isPendingInventoryWrite: (result: { status: string }) =>
    result.status === 'queued' || result.status === 'syncing',
  requireAcceptedInventoryWrite: <T,>(result: T) => result,
  writeEmployeeCustodyAdds: mocks.writeEmployeeCustodyAdds,
  writeEmployeeCustodyScrap: mocks.writeEmployeeCustodyScrap,
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mocks.useQuery(options),
  useMutation: (options: unknown) => mocks.useMutation(options),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}))

import {
  useAddEmployeeCustody,
  useEmployeeCustody,
  useScrapEmployeeCustody,
} from './useEmployeeCustody'

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

  it('routes custody adds through the write service and keeps pending state local', async () => {
    const pendingResult = {
      savedCount: 1,
      pendingCount: 1,
      failures: [],
      results: [{ status: 'queued', commandId: 'command-1', runtime: 'desktop' }],
    }
    mocks.writeEmployeeCustodyAdds.mockResolvedValue(pendingResult)
    useAddEmployeeCustody('e1')
    const options = mocks.useMutation.mock.calls.at(-1)?.[0] as {
      mutationFn: (items: unknown[]) => Promise<unknown>
      onSettled: (result: typeof pendingResult) => unknown
    }
    const inputs = [{ employeeId: 'e1', itemId: 'item-1' }]

    await expect(options.mutationFn(inputs)).resolves.toBe(pendingResult)
    expect(mocks.writeEmployeeCustodyAdds).toHaveBeenCalledWith(inputs)
    expect(options.onSettled(pendingResult)).toBeUndefined()
    expect(mocks.invalidateQueries).not.toHaveBeenCalled()
  })

  it('routes custody scrap through the write service without optimistic invalidation', async () => {
    const queued = { status: 'queued', commandId: 'scrap-1', runtime: 'desktop' }
    mocks.writeEmployeeCustodyScrap.mockResolvedValue(queued)
    useScrapEmployeeCustody('e1')
    const options = mocks.useMutation.mock.calls.at(-1)?.[0] as {
      mutationFn: (input: unknown) => Promise<unknown>
      onSuccess: (result: typeof queued) => unknown
    }
    const input = { custodyId: 'custody-1', scrappedDate: '2026-09-08', reason: 'damaged' }

    await expect(options.mutationFn(input)).resolves.toBe(queued)
    expect(mocks.writeEmployeeCustodyScrap).toHaveBeenCalledWith(input)
    expect(options.onSuccess(queued)).toBeUndefined()
    expect(mocks.invalidateQueries).not.toHaveBeenCalled()
  })
})
