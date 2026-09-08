import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  employeeCustodyKeys,
  getEmployeeCustodyItems,
} from '../employeeCustodyService'
import type { AddEmployeeCustodyInput, ScrapEmployeeCustodyInput } from '../types'
import { getCustodyRepository } from '../../../repositories'
import { readForRuntime } from '../../../repositories/readStrategy'
import {
  isPendingInventoryWrite,
  requireAcceptedInventoryWrite,
  writeEmployeeCustodyAdds,
  writeEmployeeCustodyScrap,
} from '../../../services/inventoryWrite'

export function useEmployeeCustody(employeeId: string) {
  return useQuery({
    queryKey: employeeCustodyKeys.employee(employeeId),
    queryFn: () => readForRuntime({
      desktop: async () => {
        const result = await (await getCustodyRepository()).listEmployeeCustodyItems(employeeId)
        if (result.error !== null) throw new Error(result.error)
        return result.data
      },
      web: () => getEmployeeCustodyItems(employeeId),
    }),
    enabled: Boolean(employeeId),
  })
}

export function useAddEmployeeCustody(employeeId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (items: AddEmployeeCustodyInput[]) => writeEmployeeCustodyAdds(items),
    onSettled: (result) => result?.pendingCount ? undefined : Promise.all([
      queryClient.invalidateQueries({
        queryKey: employeeCustodyKeys.employee(employeeId),
      }),
      queryClient.invalidateQueries({
        queryKey: employeeCustodyKeys.issueCandidates(employeeId),
      }),
    ]),
  })
}

export function useScrapEmployeeCustody(employeeId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ScrapEmployeeCustodyInput) =>
      requireAcceptedInventoryWrite(await writeEmployeeCustodyScrap(input)),
    onSuccess: (result) => isPendingInventoryWrite(result)
      ? undefined
      : queryClient.invalidateQueries({
          queryKey: employeeCustodyKeys.employee(employeeId),
        }),
  })
}
