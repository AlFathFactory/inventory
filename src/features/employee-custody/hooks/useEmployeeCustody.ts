import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addEmployeeCustodyItems,
  employeeCustodyKeys,
  getEmployeeCustodyItems,
  scrapEmployeeCustodyItem,
} from '../employeeCustodyService'
import type { AddEmployeeCustodyInput } from '../types'

export function useEmployeeCustody(employeeId: string) {
  return useQuery({
    queryKey: employeeCustodyKeys.employee(employeeId),
    queryFn: () => getEmployeeCustodyItems(employeeId),
    enabled: Boolean(employeeId),
  })
}

export function useAddEmployeeCustody(employeeId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (items: AddEmployeeCustodyInput[]) => addEmployeeCustodyItems(items),
    onSettled: () => Promise.all([
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
    mutationFn: scrapEmployeeCustodyItem,
    onSuccess: () => queryClient.invalidateQueries({
      queryKey: employeeCustodyKeys.employee(employeeId),
    }),
  })
}
