import { useQuery } from '@tanstack/react-query'
import {
  employeeCustodyKeys,
  getManualCustodyInventoryItems,
} from '../employeeCustodyService'

export function useCustodyInventoryCatalog(enabled = true) {
  return useQuery({
    queryKey: employeeCustodyKeys.inventoryCatalog,
    queryFn: getManualCustodyInventoryItems,
    enabled,
    staleTime: 5 * 60_000,
  })
}
