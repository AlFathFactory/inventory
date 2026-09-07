import { getCachedParties, partyKeys, type Party, type PartyKind } from '../../services/partiesService'
import { getPartiesRepository } from '../../repositories'
import { readForRuntime } from '../../repositories/readStrategy'

/**
 * Active employee/supplier list used by the party pickers.
 *
 * Web keeps reading the existing browser cache; desktop reads the synced
 * SQLite tables and never falls back to it. The query key is unchanged, so
 * existing invalidations keep working.
 */
export function loadPartyList(kind: PartyKind): Promise<Party[]> {
  return readForRuntime<Party[]>({
    desktop: async () => {
      const repository = await getPartiesRepository()
      const result = kind === 'employee'
        ? await repository.listEmployees()
        : await repository.listSuppliers()
      if (result.error !== null) throw new Error(result.error)
      return result.data
    },
    web: () => getCachedParties(kind),
  })
}

export function partyListQueryOptions(kind: PartyKind) {
  return {
    queryKey: partyKeys.list(kind),
    queryFn: () => loadPartyList(kind),
  }
}
