import { loadCategoryRowsForTable } from '../features/category/utils/categoryRows'
import { getCustodyRecord, getItemDetails, getItemMovements } from '../services/itemsService'
import { getActiveProjects, getProjects } from '../services/projectsService'
import { searchActiveParties } from '../services/partiesService'
import { getEmployeeCustodyItems } from '../features/employee-custody/employeeCustodyService'
import {
  repositoryFailure,
  repositoryOk,
  type CustodyReadRepository,
  type InventoryReadRepository,
  type MovementsReadRepository,
  type PartiesReadRepository,
  type ProjectsReadRepository,
  type ReadRepositories,
} from './contracts'
import type { Employee, Supplier } from '../services/partiesService'

/**
 * Web implementations. Every method delegates to the service function the
 * app already used, so existing Supabase queries, RPCs, filters and error
 * messages are unchanged — this layer only re-exposes them behind the
 * repository contract.
 */

function toResult<T>(error: unknown, fallback: string) {
  return repositoryFailure<T>(error instanceof Error ? error.message : fallback)
}

const inventory: InventoryReadRepository = {
  async listCategoryRows(tableName) {
    const { data, error } = await loadCategoryRowsForTable(tableName)
    return error === null ? repositoryOk(data) : repositoryFailure(error)
  },
  getItemDetails: (tableName, itemId) => getItemDetails(tableName, itemId),
  getCustodyRecord: (tableName, recordId) => getCustodyRecord(tableName, recordId),
}

const movements: MovementsReadRepository = {
  listItemMovements: (tableName, itemId) => getItemMovements(tableName, itemId),
}

const projects: ProjectsReadRepository = {
  listProjects: () => getProjects(),
  listActiveProjects: () => getActiveProjects(),
}

const parties: PartiesReadRepository = {
  async listEmployees() {
    try {
      return repositoryOk((await searchActiveParties('employee')) as Employee[])
    } catch (error) {
      return toResult<Employee[]>(error, 'تعذر تحميل الموظفين')
    }
  },
  async listSuppliers() {
    try {
      return repositoryOk((await searchActiveParties('supplier')) as Supplier[])
    } catch (error) {
      return toResult<Supplier[]>(error, 'تعذر تحميل الموردين')
    }
  },
}

const custody: CustodyReadRepository = {
  async listEmployeeCustodyItems(employeeId) {
    try {
      return repositoryOk(await getEmployeeCustodyItems(employeeId))
    } catch (error) {
      return toResult(error, 'تعذر تحميل عهدة الموظف')
    }
  },
}

export const supabaseReadRepositories: ReadRepositories = {
  inventory,
  movements,
  projects,
  parties,
  custody,
}
