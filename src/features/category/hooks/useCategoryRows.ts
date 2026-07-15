import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { CategoryDefinition } from '../../../config/categoryConfig'
import { usePagination } from '../../../hooks/usePagination'
import type { CategorySummaryItem } from '../../../services/itemsService'
import { categoryQueryOptions } from '../../inventory/inventoryQueries'
import { useActiveProjects } from '../../projects/projectQueries'
import { filterCategoryRows, filterCategoryRowsByProject } from '../utils/categoryRows'

const emptyCategoryRows: CategorySummaryItem[] = []

export function useCategoryRows(category: CategoryDefinition | null) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProjectName, setSelectedProjectName] = useState('')
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
  const rows = query.data ?? emptyCategoryRows
  const deferredSearchTerm = useDeferredValue(searchTerm)

  useEffect(() => {
    setSelectedProjectName('')
  }, [category?.table])

  const projectOptions = useMemo(
    () => (projectsQuery.data ?? []).map((project) => project.name),
    [projectsQuery.data],
  )
  const filteredRows = useMemo(() => {
    const searchedRows = filterCategoryRows(rows, deferredSearchTerm)
    return filterCategoryRowsByProject(searchedRows, selectedProjectName)
  }, [deferredSearchTerm, rows, selectedProjectName])
  const pagination = usePagination(filteredRows, { initialPageSize: 10 })

  return {
    rows,
    filteredRows,
    pagination,
    isLoading: query.isPending,
    error: query.error instanceof Error ? query.error.message : null,
    searchTerm,
    setSearchTerm,
    projectOptions,
    selectedProjectName,
    setSelectedProjectName,
  }
}
