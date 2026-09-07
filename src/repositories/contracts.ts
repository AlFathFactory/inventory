import type {
  CategorySummaryItem,
  ItemDetails,
  ItemMovement,
} from '../services/itemsService'
import type { Project } from '../services/projectsService'
import type { Employee, Supplier } from '../services/partiesService'
import type { EmployeeCustodyRecord } from '../features/employee-custody/types'

/**
 * Same `{ data, error }` shape the existing services already return, so
 * callers and repositories interoperate without adapters.
 */
export type RepositoryResult<TData> =
  | { data: TData; error: null }
  | { data: null; error: string }

export function repositoryOk<TData>(data: TData): RepositoryResult<TData> {
  return { data, error: null }
}

export function repositoryFailure<TData = never>(error: string): RepositoryResult<TData> {
  return { data: null, error }
}

/**
 * Category/stock item lists and single-item details.
 *
 * Both sides return the derived summary shape the UI renders, not raw table
 * rows: on web that is the Supabase summary view, on desktop the equivalent
 * projection over the synced SQLite tables.
 */
export interface InventoryReadRepository {
  listCategoryRows(tableName: string): Promise<RepositoryResult<CategorySummaryItem[]>>
  getItemDetails(tableName: string, itemId: string): Promise<RepositoryResult<ItemDetails | null>>
}

/** Stock movement history for one item. */
export interface MovementsReadRepository {
  listItemMovements(tableName: string, itemId: string): Promise<RepositoryResult<ItemMovement[]>>
}

export interface ProjectsReadRepository {
  listProjects(): Promise<RepositoryResult<Project[]>>
  listActiveProjects(): Promise<RepositoryResult<Project[]>>
}

/** Employees and suppliers — the two party kinds used by operations. */
export interface PartiesReadRepository {
  listEmployees(): Promise<RepositoryResult<Employee[]>>
  listSuppliers(): Promise<RepositoryResult<Supplier[]>>
}

export interface CustodyReadRepository {
  listEmployeeCustodyItems(employeeId: string): Promise<RepositoryResult<EmployeeCustodyRecord[]>>
}

/** The full read surface resolved for the current runtime. */
export interface ReadRepositories {
  inventory: InventoryReadRepository
  movements: MovementsReadRepository
  projects: ProjectsReadRepository
  parties: PartiesReadRepository
  custody: CustodyReadRepository
}
