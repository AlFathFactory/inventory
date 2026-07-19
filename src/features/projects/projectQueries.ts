import { queryOptions, useQuery } from '@tanstack/react-query'
import { getActiveProjects, getProjects, getUnregisteredItemProjectNames, getUsedProjectNames } from '../../services/projectsService'
import { getCachedProjects } from '../../services/offlineBootstrapService'

export const projectKeys = {
  all: ['projects'] as const,
  active: ['projects', 'active'] as const,
  unregistered: ['projects', 'unregistered-item-names'] as const,
  used: ['projects', 'used-names'] as const,
}

function requireData<T>(result: { data: T | null; error: string | null }) {
  if (result.error || result.data === null) throw new Error(result.error || 'تعذر تحميل المشاريع')
  return result.data
}

export const projectsQueryOptions = queryOptions({
  queryKey: projectKeys.all,
  networkMode: 'always',
  queryFn: async () => navigator.onLine
    ? requireData(await getProjects())
    : getCachedProjects(),
})

export const activeProjectsQueryOptions = queryOptions({
  queryKey: projectKeys.active,
  networkMode: 'always',
  queryFn: async () => navigator.onLine
    ? requireData(await getActiveProjects())
    : getCachedProjects(true),
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
