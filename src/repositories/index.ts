import { isDesktopRuntime } from '../config/platform'
import { supabaseReadRepositories } from './supabaseRepositories'
import type { ReadRepositories } from './contracts'

export type {
  RepositoryResult,
  ReadRepositories,
  InventoryReadRepository,
  MovementsReadRepository,
  ProjectsReadRepository,
  PartiesReadRepository,
  CustodyReadRepository,
  DashboardReadRepository,
  DashboardSummaryPayload,
} from './contracts'

let desktopRepositories: ReadRepositories | null = null

/**
 * The only place the runtime is inspected. Callers ask for a repository and
 * get the right implementation; pages, components and hooks never branch on
 * platform themselves.
 *
 * The SQLite implementations are imported dynamically, so on web that module
 * — and the Tauri APIs it reaches — is never loaded or executed.
 */
export async function getReadRepositories(): Promise<ReadRepositories> {
  if (!isDesktopRuntime()) {
    return supabaseReadRepositories
  }
  if (!desktopRepositories) {
    const { localReadRepositories } = await import('./localRepositories')
    desktopRepositories = localReadRepositories
  }
  return desktopRepositories
}

export async function getInventoryRepository() {
  return (await getReadRepositories()).inventory
}

export async function getMovementsRepository() {
  return (await getReadRepositories()).movements
}

export async function getProjectsRepository() {
  return (await getReadRepositories()).projects
}

export async function getPartiesRepository() {
  return (await getReadRepositories()).parties
}

export async function getCustodyRepository() {
  return (await getReadRepositories()).custody
}

export async function getDashboardRepository() {
  return (await getReadRepositories()).dashboard
}
