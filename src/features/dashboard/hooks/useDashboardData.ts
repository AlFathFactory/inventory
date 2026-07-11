import { useEffect, useState } from 'react'
import {
  categoryEntries,
  categoryOptions,
  type CategoryDefinition,
  type CategoryKey,
} from '../../../config/categoryConfig'
import { isSupabaseConfigured } from '../../../lib/supabaseClient'
import {
  getCategoryRows,
  getLowStockRows,
  getOutOfStockRows,
  type InventoryRow,
} from '../../../services/inventoryService'
import { dashboardDemo } from '../data/dashboardDemo'
import type { CategoryCard, DashboardData, DashboardStats } from '../types'
import { buildDashboardInventoryRows } from '../utils/dashboardInventoryRows'

type DashboardState = {
  data: DashboardData
  isLoading: boolean
  error: string | null
}

type ImportLogRow = InventoryRow & {
  file_name?: string
  imported_at?: string
}

type StockCategoryDefinition = CategoryDefinition & {
  stockField: string
  minQuantityField: string
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

function hasStockConfig(
  category: CategoryDefinition,
): category is StockCategoryDefinition {
  return Boolean(category.stockField && category.minQuantityField)
}

function hasOnlyStockField(
  category: CategoryDefinition,
): category is CategoryDefinition & { stockField: string } {
  return Boolean(category.stockField)
}

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

      const entries: Array<[CategoryKey, CategoryDefinition]> = categoryEntries

      const importsPromise = getCategoryRows<ImportLogRow>('imports')
      const rowCountPromises = entries.map(async ([key, category]) => ({
        key,
        category,
        result: await getCategoryRows(category.table),
      }))

      const lowStockPromises = entries.reduce<
        Array<
          Promise<{
            key: CategoryKey
            category: StockCategoryDefinition
            result: Awaited<ReturnType<typeof getLowStockRows>>
          }>
        >
      >((promises, [key, category]) => {
        if (!hasStockConfig(category)) {
          return promises
        }

        promises.push(
          (async () => ({
            key,
            category,
            result: await getLowStockRows(
              category.table,
              category.stockField,
              category.minQuantityField,
            ),
          }))(),
        )

        return promises
      }, [])

      const outOfStockPromises = entries.reduce<
        Array<
          Promise<{
            key: CategoryKey
            category: CategoryDefinition & { stockField: string }
            result: Awaited<ReturnType<typeof getOutOfStockRows>>
          }>
        >
      >((promises, [key, category]) => {
        if (!hasOnlyStockField(category)) {
          return promises
        }

        promises.push(
          (async () => ({
            key,
            category,
            result: await getOutOfStockRows(category.table, category.stockField),
          }))(),
        )

        return promises
      }, [])

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

      const inventoryRows = buildDashboardInventoryRows(
        categoryRowResults.map(({ key, category, result }) => ({
          categoryKey: key,
          category,
          rows: result.data ?? [],
        })),
      )

      const shouldFallbackToDemo =
        categoryCards.every((card) => card.rowCount === 0) &&
        totalImportedFiles === 0 &&
        inventoryRows.length === 0

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
              inventoryRows,
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
