import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../config/platform', () => ({ isDesktopRuntime: vi.fn() }))

// Fails the test if the desktop module is ever pulled in on web.
const localRepositoriesLoaded = vi.fn()
vi.mock('./localRepositories', () => {
  localRepositoriesLoaded()
  return {
    localReadRepositories: {
      inventory: { kind: 'local' },
      movements: { kind: 'local' },
      projects: { kind: 'local' },
      parties: { kind: 'local' },
      custody: { kind: 'local' },
    },
  }
})
vi.mock('./supabaseRepositories', () => ({
  supabaseReadRepositories: {
    inventory: { kind: 'supabase' },
    movements: { kind: 'supabase' },
    projects: { kind: 'supabase' },
    parties: { kind: 'supabase' },
    custody: { kind: 'supabase' },
  },
}))

describe('repository resolver', () => {
  afterEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('resolves the Supabase implementations on web', async () => {
    const { isDesktopRuntime } = await import('../config/platform')
    vi.mocked(isDesktopRuntime).mockReturnValue(false)

    const { getReadRepositories } = await import('./index')
    const repositories = await getReadRepositories()

    expect(repositories.inventory).toMatchObject({ kind: 'supabase' })
    expect(repositories.custody).toMatchObject({ kind: 'supabase' })
    // The SQLite module must never be imported in the web runtime.
    expect(localRepositoriesLoaded).not.toHaveBeenCalled()
  })

  it('resolves the SQLite implementations on desktop', async () => {
    const { isDesktopRuntime } = await import('../config/platform')
    vi.mocked(isDesktopRuntime).mockReturnValue(true)

    const { getReadRepositories } = await import('./index')
    const repositories = await getReadRepositories()

    expect(repositories.inventory).toMatchObject({ kind: 'local' })
    expect(repositories.movements).toMatchObject({ kind: 'local' })
  })

  it('caches the desktop implementations across calls', async () => {
    const { isDesktopRuntime } = await import('../config/platform')
    vi.mocked(isDesktopRuntime).mockReturnValue(true)

    const { getReadRepositories } = await import('./index')
    const first = await getReadRepositories()
    const second = await getReadRepositories()

    // Resolved once and reused — no repeated module load per call.
    expect(first).toBe(second)
  })

  it('returns the Supabase singleton itself on web, never a local instance', async () => {
    const { isDesktopRuntime } = await import('../config/platform')
    vi.mocked(isDesktopRuntime).mockReturnValue(false)

    const { supabaseReadRepositories } = await import('./supabaseRepositories')
    const { getReadRepositories } = await import('./index')

    expect(await getReadRepositories()).toBe(supabaseReadRepositories)
  })

  it('exposes each domain through its own accessor', async () => {
    const { isDesktopRuntime } = await import('../config/platform')
    vi.mocked(isDesktopRuntime).mockReturnValue(false)

    const module = await import('./index')

    expect(await module.getInventoryRepository()).toMatchObject({ kind: 'supabase' })
    expect(await module.getMovementsRepository()).toMatchObject({ kind: 'supabase' })
    expect(await module.getProjectsRepository()).toMatchObject({ kind: 'supabase' })
    expect(await module.getPartiesRepository()).toMatchObject({ kind: 'supabase' })
    expect(await module.getCustodyRepository()).toMatchObject({ kind: 'supabase' })
  })
})
