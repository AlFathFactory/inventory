import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { PaginationState } from './usePagination'

type UseSearchParamsPaginationOptions = {
  initialPageSize?: number
}

function toPositiveInteger(value: string | number | null, fallback: number) {
  const parsedValue = Number(value)
  return Number.isFinite(parsedValue) && parsedValue >= 1
    ? Math.floor(parsedValue)
    : fallback
}

export function useSearchParamsPagination<TItem>(
  items: readonly TItem[],
  options: UseSearchParamsPaginationOptions = {},
): PaginationState<TItem> {
  const { initialPageSize = 10 } = options
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedPage = toPositiveInteger(searchParams.get('page'), 1)
  const pageSize = toPositiveInteger(
    searchParams.get('pageSize'),
    initialPageSize,
  )
  const totalItems = items.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const currentPage = Math.min(requestedPage, totalPages)

  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return items.slice(startIndex, startIndex + pageSize)
  }, [currentPage, items, pageSize])

  const setCurrentPage = useCallback((page: number) => {
    const nextPage = toPositiveInteger(page, 1)
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams)
      if (nextPage === 1) nextParams.delete('page')
      else nextParams.set('page', String(nextPage))
      return nextParams
    }, { replace: true })
  }, [setSearchParams])

  const setPageSize = useCallback((nextPageSizeValue: number) => {
    const nextPageSize = toPositiveInteger(
      nextPageSizeValue,
      initialPageSize,
    )
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams)
      nextParams.delete('page')
      if (nextPageSize === initialPageSize) nextParams.delete('pageSize')
      else nextParams.set('pageSize', String(nextPageSize))
      return nextParams
    }, { replace: true })
  }, [initialPageSize, setSearchParams])

  const pageStart = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const pageEnd = totalItems === 0 ? 0 : pageStart + paginatedItems.length - 1

  return {
    currentPage,
    pageSize,
    totalItems,
    totalPages,
    pageStart,
    pageEnd,
    paginatedItems,
    setCurrentPage,
    setPageSize,
  }
}
