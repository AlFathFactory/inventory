import { queryOptions, useQuery } from '@tanstack/react-query'
import { getActiveProjects, getProjects, getUnregisteredItemProjectNames } from '../../services/projectsService'
import { getCachedProjects } from '../../services/offlineBootstrapService'

export const projectKeys = {
  all: ['projects'] as const,
  active: ['projects', 'active'] as const,
  unregistered: ['projects', 'unregistered-item-names'] as const,
}

function requireData<T>(result: { data: T | null; error: string | null }) {
  if (result.error || result.data === null) throw new Error(result.error || 'تعذر تحميل المشاريع')
  return result.data
}

export const projectsQueryOptions = queryOptions({
  queryKey: projectKeys.all,
  queryFn: async () => navigator.onLine
    ? requireData(await getProjects())
    : getCachedProjects(),
})

export const activeProjectsQueryOptions = queryOptions({
  queryKey: projectKeys.active,
  queryFn: async () => navigator.onLine
    ? requireData(await getActiveProjects())
    : getCachedProjects(true),
})

export const unregisteredProjectsQueryOptions = queryOptions({
  queryKey: projectKeys.unregistered,
  queryFn: async () => requireData(await getUnregisteredItemProjectNames()),
})

export function useActiveProjects(enabled = true) {
  return useQuery({ ...activeProjectsQueryOptions, enabled })
}
