import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addEmployeeCustodyItem,
  employeeCustodyKeys,
  getEmployeeCustodyItems,
  scrapEmployeeCustodyItem,
} from '../employeeCustodyService'

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
    mutationFn: addEmployeeCustodyItem,
    onSuccess: () => queryClient.invalidateQueries({
      queryKey: employeeCustodyKeys.employee(employeeId),
    }),
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
