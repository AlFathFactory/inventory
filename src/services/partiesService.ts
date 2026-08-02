import { getSupabaseConfigError, isSupabaseConfigured, supabaseClient } from '../lib/supabaseClient'
import { matchesAnySearchValue, normalizeSearchTerm } from '../utils/searchUtils'

export type Employee = {
  id: string
  name: string
  employee_code?: string | null
  department?: string | null
  phone?: string | null
  notes?: string | null
  is_active: boolean
  [key: string]: unknown
}

export type Supplier = {
  id: string
  name: string
  supplier_code?: string | null
  contact_person?: string | null
  phone?: string | null
  notes?: string | null
  is_active: boolean
  [key: string]: unknown
}

export type PartyKind = 'employee' | 'supplier'
export type Party = Employee | Supplier
export type IssueEmployeeAllocation = {
  id: string
  issue_operation_id: string
  employee_id: string
  employee_name_snapshot: string
  allocated_quantity: number | string | null
  returned_quantity: number | string
}

function client() {
  if (!isSupabaseConfigured || !supabaseClient) throw new Error(getSupabaseConfigError())
  return supabaseClient
}

export function normalizePartyName(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

export function filterPartiesForSearch(
  kind: PartyKind,
  parties: Party[],
  search: string,
) {
  const normalizedSearchTerm = normalizeSearchTerm(normalizePartyName(search))
  return parties.filter((party) => matchesAnySearchValue(
    kind === 'employee'
      ? [party.name, party.employee_code, party.department, party.phone]
      : [party.name, party.supplier_code, party.contact_person, party.phone],
    normalizedSearchTerm,
  ))
}

export async function searchActiveParties(kind: PartyKind, search = ''): Promise<Party[]> {
  const { data, error } = await client()
    .from(kind === 'employee' ? 'employees' : 'suppliers')
    .select('*')
    .eq('is_active', true)
    .order('name')
    .limit(1000)
  if (error) throw new Error(error.message)
  return filterPartiesForSearch(kind, (data ?? []) as Party[], search).slice(0, 20)
}

export async function getPartySummaries(kind: PartyKind): Promise<Party[]> {
  const view = kind === 'employee' ? 'employee_inventory_summary_v' : 'supplier_inventory_summary_v'
  const { data, error } = await client().from(view).select('*').order('name')
  if (error) throw new Error(error.message)
  return (data ?? []) as Party[]
}

export async function createParty(kind: PartyKind, values: Record<string, string>) {
  const name = normalizePartyName(values.name ?? '')
  const rpc = kind === 'employee' ? 'create_or_get_employee_rpc' : 'create_or_get_supplier_rpc'
  const args = kind === 'employee'
    ? {
        p_name: name, p_employee_code: values.code || null,
        p_department: values.department || null, p_phone: values.phone || null,
        p_notes: values.notes || null,
      }
    : {
        p_name: name, p_supplier_code: values.code || null,
        p_phone: values.phone || null, p_contact_person: values.contactPerson || null,
        p_notes: values.notes || null,
      }
  const { data, error } = await client().rpc(rpc, args)
  if (error) throw new Error(error.message)
  const record = data && typeof data === 'object' && 'employee' in data
    ? data.employee
    : data && typeof data === 'object' && 'supplier' in data
      ? data.supplier
      : data
  if (!record || typeof record !== 'object') throw new Error('لم تُرجع الخدمة بيانات السجل')
  return record as Party
}

export async function saveParty(kind: PartyKind, id: string, values: Record<string, unknown>) {
  const { data, error } = await client()
    .from(kind === 'employee' ? 'employees' : 'suppliers')
    .update(values).eq('id', id).select('*').single()
  if (error) throw new Error(error.message)
  return data as Party
}

export async function getEmployeeActivity(employeeId: string) {
  const { data, error } = await client()
    .from('employee_inventory_activity_v').select('*').eq('employee_id', employeeId)
    .order('issue_date', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as Record<string, unknown>[]
}

export async function getSupplierActivity(supplierId: string) {
  const { data, error } = await client()
    .from('inventory_operations').select('*').eq('supplier_id', supplierId)
    .eq('operation_type', 'add').order('operation_date', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as Record<string, unknown>[]
}

export async function getIssueEmployeeAllocations(issueOperationId: string) {
  const { data, error } = await client()
    .from('inventory_operation_employee_allocations')
    .select('*')
    .eq('issue_operation_id', issueOperationId)
    .order('created_at')
  if (error) throw new Error(error.message)
  return (data ?? []) as IssueEmployeeAllocation[]
}

export async function allocateGroupIssue(
  issueOperationId: string,
  allocations: Array<{ employeeId: string; quantity: number }>,
  updatedBy = 'user',
) {
  const { data, error } = await client().rpc('allocate_group_issue_rpc', {
    p_issue_operation_id: issueOperationId,
    p_allocations: allocations.map((allocation) => ({
      employee_id: allocation.employeeId,
      quantity: allocation.quantity,
    })),
    p_updated_by: updatedBy,
  })
  if (error) throw new Error(error.message)
  return data
}

export const partyKeys = {
  all: ['parties'] as const,
  list: (kind: PartyKind) => ['parties', kind, 'list'] as const,
  summary: (kind: PartyKind) => ['parties', kind, 'summary'] as const,
  activity: (kind: PartyKind, id: string) => ['parties', kind, 'activity', id] as const,
  issueAllocations: (id: string) => ['parties', 'issue-allocations', id] as const,
}
