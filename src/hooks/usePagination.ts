import { useEffect, useMemo, useState } from 'react'

type UsePaginationOptions = {
  initialPageSize?: number
}

export type PaginationState<TItem> = {
  currentPage: number
  pageSize: number
  totalItems: number
  totalPages: number
  pageStart: number
  pageEnd: number
  paginatedItems: TItem[]
  setCurrentPage: (page: number) => void
  setPageSize: (pageSize: number) => void
}

export function usePagination<TItem>(
  items: readonly TItem[],
  options: UsePaginationOptions = {},
): PaginationState<TItem> {
  const { initialPageSize = 10 } = options
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialPageSize)

  const totalItems = items.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

  useEffect(() => {
    setCurrentPage(1)
  }, [pageSize, totalItems])

  const safeCurrentPage = Math.min(currentPage, totalPages)

  const paginatedItems = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * pageSize
    return items.slice(startIndex, startIndex + pageSize)
  }, [items, pageSize, safeCurrentPage])

  const pageStart = totalItems === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1
  const pageEnd = totalItems === 0 ? 0 : pageStart + paginatedItems.length - 1

  return {
    currentPage: safeCurrentPage,
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
