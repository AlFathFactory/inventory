import { useEffect, useState } from 'react'
import { categoryConfig, categoryOptions, type CategoryKey } from '../../../config/categoryConfig'
import { isSupabaseConfigured } from '../../../lib/supabaseClient'
import {
  getCategoryRows,
  getLowStockRows,
  getOutOfStockRows,
  type InventoryRow,
} from '../../../services/inventoryService'
import { getStockStatus } from '../../../utils/statusUtils'
import { dashboardDemo } from '../data/dashboardDemo'
import type {
  CategoryCard,
  DashboardData,
  DashboardInventoryAlert,
  DashboardOperation,
  DashboardStats,
} from '../types'

type DashboardState = {
  data: DashboardData
  isLoading: boolean
  error: string | null
}

type ImportLogRow = InventoryRow & {
  file_name?: string
  imported_at?: string
}

const mainInventoryTables = new Set([
  'consumables',
  'paints',
  'cones4_materials',
  'screws',
  'stock_screws',
  'raw_materials',
  'cylinders',
])

function createInitialCards(): CategoryCard[] {
  return categoryOptions.map((category) => ({
    key: category.key,
    label: category.label,
    route: category.route,
    table: category.table,
    rowCount: 0,
  }))
}

function extractStringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function extractNumberValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsedValue = Number(value)
    return Number.isFinite(parsedValue) ? parsedValue : 0
  }

  return 0
}

function formatOperationDate(value: unknown): string {
  const dateValue = extractStringValue(value)

  if (!dateValue) {
    return '—'
  }

  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) {
    return dateValue
  }

  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}`
}

function buildRecentOperations(rowsByCategory: Array<{
  categoryKey: CategoryKey
  rows: InventoryRow[]
}>) {
  const operations: Array<DashboardOperation & { timestamp: number }> = []

  rowsByCategory.forEach(({ categoryKey, rows }) => {
    const category = categoryConfig[categoryKey]

    rows.forEach((row, index) => {
      const rawDate = row[category.dateField]
      const timestamp = extractStringValue(rawDate)
        ? new Date(String(rawDate)).getTime()
        : 0

      if (!timestamp) {
        return
      }

      const addedValue = extractNumberValue(row.added)
      const issuedValue = extractNumberValue(row.issued)

      let operationType = 'جرد'
      let quantity = 0

      if (addedValue > 0) {
        operationType = 'إضافة'
        quantity = addedValue
      } else if (issuedValue > 0) {
        operationType = 'صرف'
        quantity = issuedValue
      }

      const itemName =
        extractStringValue(row.item_name) ??
        extractStringValue(row.type_name) ??
        category.label

      operations.push({
        id: `${category.table}-${index}`,
        date: formatOperationDate(rawDate),
        operationType,
        itemName,
        quantity,
        userName: extractStringValue(row.project) ?? 'النظام',
        timestamp,
      })
    })
  })

  return operations
    .sort((first, second) => second.timestamp - first.timestamp)
    .slice(0, 4)
    .map(({ timestamp: _timestamp, ...operation }) => operation)
}

function buildAlerts(
  lowStockRowsByCategory: Array<{
    categoryKey: CategoryKey
    rows: InventoryRow[]
  }>,
): DashboardInventoryAlert[] {
  return lowStockRowsByCategory
    .flatMap(({ categoryKey, rows }) => {
      const category = categoryConfig[categoryKey]

      return rows.map((row, index) => {
        const itemName =
          extractStringValue(row.item_name) ??
          extractStringValue(row.type_name) ??
          extractStringValue(row.code) ??
          'عنصر غير مسمى'

        return {
          id: `${category.table}-alert-${index}`,
          category: category.label,
          itemName,
          stockBalance: extractNumberValue(row[category.stockField ?? '']),
          minQuantity: extractNumberValue(row[category.minQuantityField ?? '']),
          status:
            getStockStatus(
              row,
              category.stockField ?? '',
              category.minQuantityField ?? '',
            ) ?? 'safe',
          actionLabel: 'إضافة',
        }
      })
    })
    .sort((first, second) => first.stockBalance - second.stockBalance)
    .slice(0, 4)
}

export function useDashboardData(): DashboardState {
  const [state, setState] = useState<DashboardState>({
    data: {
      ...dashboardDemo,
      categoryCards: createInitialCards(),
      isDemo: !isSupabaseConfigured,
    },
    isLoading: true,
    error: null,
  })

  useEffect(() => {
    let isCancelled = false

    async function loadDashboard() {
      if (!isSupabaseConfigured) {
        setState({
          data: {
            ...dashboardDemo,
            categoryCards: createInitialCards(),
            isDemo: true,
          },
          isLoading: false,
          error: null,
        })
        return
      }

      const categoryEntries = Object.entries(categoryConfig) as Array<
        [CategoryKey, (typeof categoryConfig)[CategoryKey]]
      >

      const importsPromise = getCategoryRows<ImportLogRow>('imports')
      const rowCountPromises = categoryEntries.map(async ([key, category]) => ({
        key,
        category,
        result: await getCategoryRows(category.table),
      }))

      const lowStockPromises = categoryEntries
        .filter(([, category]) => category.stockField && category.minQuantityField)
        .map(async ([key, category]) => ({
          key,
          result: await getLowStockRows(
            category.table,
            category.stockField as string,
            category.minQuantityField as string,
          ),
        }))

      const outOfStockPromises = categoryEntries
        .filter(([, category]) => category.stockField)
        .map(async ([key, category]) => ({
          key,
          result: await getOutOfStockRows(category.table, category.stockField as string),
        }))

      const [importsResult, categoryRowResults, lowStockResults, outOfStockResults] =
        await Promise.all([
          importsPromise,
          Promise.all(rowCountPromises),
          Promise.all(lowStockPromises),
          Promise.all(outOfStockPromises),
        ])

      if (isCancelled) {
        return
      }

      const errorMessages: string[] = []

      if (importsResult.error) {
        errorMessages.push(`فشل تحميل سجل الاستيراد: ${importsResult.error}`)
      }

      categoryRowResults.forEach(({ category, result }) => {
        if (result.error) {
          errorMessages.push(`فشل تحميل جدول ${category.table}: ${result.error}`)
        }
      })

      const categoryCards = categoryRowResults.map(({ key, category, result }) => ({
        key,
        label: category.label,
        route: category.route,
        table: category.table,
        rowCount: result.data?.length ?? 0,
      }))

      const totalMainRows = categoryCards.reduce((total, card) => {
        return mainInventoryTables.has(card.table) ? total + card.rowCount : total
      }, 0)

      const totalImportedFiles = importsResult.data?.length ?? 0
      const latestImport = [...(importsResult.data ?? [])]
        .sort((firstRow, secondRow) => {
          const firstDate = extractStringValue(firstRow.imported_at)
          const secondDate = extractStringValue(secondRow.imported_at)
          return (
            new Date(secondDate ?? 0).getTime() - new Date(firstDate ?? 0).getTime()
          )
        })
        .at(0)

      const stats: DashboardStats = {
        totalCategories: categoryOptions.length,
        totalImportedFiles,
        totalMainRows,
        lowStockItemsCount: lowStockResults.reduce(
          (total, item) => total + (item.result.data?.length ?? 0),
          0,
        ),
        outOfStockItemsCount: outOfStockResults.reduce(
          (total, item) => total + (item.result.data?.length ?? 0),
          0,
        ),
        lastImportedFile: latestImport
          ? extractStringValue(latestImport.file_name)
          : null,
      }

      const recentOperations = buildRecentOperations(
        categoryRowResults.map(({ key, result }) => ({
          categoryKey: key,
          rows: result.data ?? [],
        })),
      )

      const alerts = buildAlerts(
        lowStockResults.map(({ key, result }) => ({
          categoryKey: key,
          rows: result.data ?? [],
        })),
      )

      const shouldFallbackToDemo =
        categoryCards.every((card) => card.rowCount === 0) &&
        totalImportedFiles === 0 &&
        alerts.length === 0 &&
        recentOperations.length === 0

      setState({
        data: shouldFallbackToDemo
          ? {
              ...dashboardDemo,
              categoryCards,
              isDemo: true,
            }
          : {
              stats,
              categoryCards,
              alerts,
              recentOperations,
              isDemo: false,
            },
        isLoading: false,
        error: errorMessages.length > 0 ? errorMessages.join(' | ') : null,
      })
    }

    void loadDashboard()

    return () => {
      isCancelled = true
    }
  }, [])

  return state
}
