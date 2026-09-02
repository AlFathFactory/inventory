import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { liveQuery } from 'dexie'
import type { CategoryDefinition } from '../../../config/categoryConfig'
import { useSearchParamsPagination } from '../../../hooks/useSearchParamsPagination'
import type { CategorySummaryItem } from '../../../services/itemsService'
import { categoryQueryOptions } from '../../inventory/inventoryQueries'
import { useActiveProjects } from '../../projects/projectQueries'
import { filterCategoryRows, filterCategoryRowsByProject } from '../utils/categoryRows'
import { offlineDb, type OfflineItem, type OfflineOperation } from '../../../lib/offlineDb'
import { projectOfflineChanges } from '../../inventory/offlineCache'
import { useNetworkStatus } from '../../../hooks/useNetworkStatus'

const emptyCategoryRows: CategorySummaryItem[] = []

export function useCategoryRows(category: CategoryDefinition | null) {
  const { isOnline } = useNetworkStatus()
  const [searchParams, setSearchParams] = useSearchParams()
  const searchTerm = searchParams.get('search') ?? ''
  const selectedProjectName = category?.table === 'raw_materials'
    ? ''
    : searchParams.get('project') ?? ''
  const [offlineItems, setOfflineItems] = useState<OfflineItem[]>([])
  const [offlineOperations, setOfflineOperations] = useState<OfflineOperation[]>([])
  const query = useQuery({
    ...(category
      ? categoryQueryOptions(category)
      : {
          queryKey: ['inventory', 'category', 'disabled'],
          queryFn: async () => [],
        }),
    enabled: Boolean(category),
  })
  const projectsQuery = useActiveProjects(Boolean(
    category?.createFields?.some((field) => String(field.key) === 'project'),
  ))
  useEffect(() => {
    if (!category) return
    setOfflineItems([])
    setOfflineOperations([])
    const subscription = liveQuery(async () => Promise.all([
      offlineDb.offline_items.where('tableName').equals(category.table).toArray(),
      offlineDb.offline_operations.where('tableName').equals(category.table).toArray(),
    ])).subscribe(([items, operations]) => {
      setOfflineItems(items)
      setOfflineOperations(operations)
    })
    return () => subscription.unsubscribe()
  }, [category])
  const rows = useMemo(
    () => projectOfflineChanges(query.data ?? emptyCategoryRows, offlineItems, offlineOperations),
    [offlineItems, offlineOperations, query.data],
  )
  const deferredSearchTerm = useDeferredValue(searchTerm)

  const projectOptions = useMemo(
    () => (projectsQuery.data ?? []).map((project) => project.name),
    [projectsQuery.data],
  )
  const filteredRows = useMemo(() => {
    const searchedRows = filterCategoryRows(rows, deferredSearchTerm)
    return filterCategoryRowsByProject(searchedRows, selectedProjectName)
  }, [deferredSearchTerm, rows, selectedProjectName])
  const pagination = useSearchParamsPagination(filteredRows, { initialPageSize: 10 })

  return {
    rows,
    filteredRows,
    pagination,
    isLoading: query.isPending && isOnline,
    error: isOnline && query.error instanceof Error ? query.error.message : null,
    searchTerm,
    setSearchTerm: (value: string) => {
      setSearchParams((currentParams) => {
        const nextParams = new URLSearchParams(currentParams)
        nextParams.delete('page')
        if (value) nextParams.set('search', value)
        else nextParams.delete('search')
        return nextParams
      }, { replace: true })
    },
    projectOptions,
    selectedProjectName,
    setSelectedProjectName: (value: string) => {
      setSearchParams((currentParams) => {
        const nextParams = new URLSearchParams(currentParams)
        nextParams.delete('page')
        if (value) nextParams.set('project', value)
        else nextParams.delete('project')
        return nextParams
      }, { replace: true })
    },
  }
}
