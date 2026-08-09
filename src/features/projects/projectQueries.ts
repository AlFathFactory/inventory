import { queryOptions, useQuery } from '@tanstack/react-query'
import { getActiveProjects, getProjects, getUnregisteredItemProjectNames, getUsedProjectNames } from '../../services/projectsService'
import { getCachedProjects } from '../../services/offlineBootstrapService'
import { isTransportError } from '../../services/connectivityService'

export const projectKeys = {
  all: ['projects'] as const,
  active: ['projects', 'active'] as const,
  unregistered: ['projects', 'unregistered-item-names'] as const,
  used: ['projects', 'used-names'] as const,
}

function requireData<T>(result: { data: T | null; error: string | null }) {
  if (result.error || result.data === null) throw new Error(result.error || 'تعذر تحميل الأقسام')
  return result.data
}

async function withProjectFallback<T>(server: () => Promise<T>, cached: () => Promise<T>) {
  if (!navigator.onLine) return cached()
  try {
    return await server()
  } catch (error) {
    if (isTransportError(error)) return cached()
    throw error
  }
}

export const projectsQueryOptions = queryOptions({
  queryKey: projectKeys.all,
  networkMode: 'always',
  queryFn: () => withProjectFallback(
    async () => requireData(await getProjects()),
    () => getCachedProjects(),
  ),
})

export const activeProjectsQueryOptions = queryOptions({
  queryKey: projectKeys.active,
  networkMode: 'always',
  queryFn: () => withProjectFallback(
    async () => requireData(await getActiveProjects()),
    () => getCachedProjects(true),
  ),
})

export const unregisteredProjectsQueryOptions = queryOptions({
  queryKey: projectKeys.unregistered,
  networkMode: 'always',
  queryFn: async () => navigator.onLine
    ? requireData(await getUnregisteredItemProjectNames())
    : [],
})

export const usedProjectNamesQueryOptions = queryOptions({
  queryKey: projectKeys.used,
  networkMode: 'always',
  queryFn: async () => navigator.onLine
    ? requireData(await getUsedProjectNames())
    : [],
})

export function useActiveProjects(enabled = true) {
  return useQuery({ ...activeProjectsQueryOptions, enabled })
}
