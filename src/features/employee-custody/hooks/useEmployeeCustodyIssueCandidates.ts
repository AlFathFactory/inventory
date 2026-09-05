import { useQuery } from '@tanstack/react-query'
import {
  employeeCustodyKeys,
  getEmployeeCustodyIssueCandidates,
} from '../employeeCustodyService'

export function useEmployeeCustodyIssueCandidates(employeeId: string, enabled = true) {
  return useQuery({
    queryKey: employeeCustodyKeys.issueCandidates(employeeId),
    queryFn: () => getEmployeeCustodyIssueCandidates(employeeId),
    enabled: enabled && Boolean(employeeId),
  })
}
