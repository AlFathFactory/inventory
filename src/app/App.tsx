import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { DashboardPage } from '../pages/DashboardPage'
import { AccessGate } from '../features/access/AccessGate'
import { AccessProvider } from '../features/access/AccessContext'
import { ToastProvider } from '../components/ToastProvider'

function AppHydrateFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm font-semibold text-slate-600" dir="rtl">
      جاري تحميل النظام...
    </div>
  )
}

// Hash routing keeps every request on index.html, so deep links continue to
// work when the static host is not configured with an SPA fallback.
const router = createHashRouter([
  {
    path: '/',
    Component: DashboardLayout,
    HydrateFallback: AppHydrateFallback,
    children: [
      {
        index: true,
        Component: DashboardPage,
      },
      {
        path: 'reports',
        lazy: async () => {
          const { ReportsPage } = await import('../pages/ReportsPage')
          return { Component: ReportsPage }
        },
      },
      {
        path: 'import',
        lazy: async () => {
          const { ImportExcelPage } = await import('../pages/ImportExcelPage')
          return { Component: ImportExcelPage }
        },
      },
      {
        path: 'low-stock',
        lazy: async () => {
          const { LowStockPage } = await import('../pages/LowStockPage')
          return { Component: LowStockPage }
        },
      },
      {
        path: 'item-code-guide',
        lazy: async () => {
          const { ItemCodeGuidePage } = await import('../pages/ItemCodeGuidePage')
          return { Component: ItemCodeGuidePage }
        },
      },
      {
        path: 'projects',
        lazy: async () => {
          const { ProjectsPage } = await import('../pages/ProjectsPage')
          return { Component: ProjectsPage }
        },
      },
      {
        path: 'dynamic-categories',
        lazy: async () => {
          const { DynamicCategoriesPage } = await import('../pages/DynamicCategoriesPage')
          return { Component: DynamicCategoriesPage }
        },
      },
      {
        path: 'dynamic-categories/:categoryId/items',
        lazy: async () => {
          const { DynamicCategoryItemsPage } = await import(
            '../pages/DynamicCategoryItemsPage'
          )
          return { Component: DynamicCategoryItemsPage }
        },
      },
      {
        path: 'dynamic-categories/:categoryId/items/:itemId',
        lazy: async () => {
          const { DynamicItemDetailsPage } = await import('../pages/DynamicItemDetailsPage')
          return { Component: DynamicItemDetailsPage }
        },
      },
      {
        path: 'operations',
        lazy: async () => {
          const { OperationsPage } = await import('../pages/OperationsPage')
          return { Component: OperationsPage }
        },
      },
      {
        path: 'parties',
        lazy: async () => {
          const { PartiesPage } = await import('../pages/PartiesPage')
          return { Component: PartiesPage }
        },
      },
      {
        path: 'stocktake',
        lazy: async () => {
          const { StocktakePage } = await import('../pages/StocktakePage')
          return { Component: StocktakePage }
        },
      },
      {
        path: 'sync-center',
        lazy: async () => {
          const { SyncCenterPage } = await import('../pages/SyncCenterPage')
          return { Component: SyncCenterPage }
        },
      },
      {
        path: 'out-of-stock',
        element: <Navigate to="/low-stock?status=out" replace />,
      },
      {
        path: 'category/:categoryKey',
        lazy: async () => {
          const { CategoryPage } = await import('../pages/CategoryPage')
          return { Component: CategoryPage }
        },
      },
      {
        path: 'category/:categoryKey/item/:itemId',
        lazy: async () => {
          const { ItemDetailsPage } = await import('../pages/ItemDetailsPage')
          return { Component: ItemDetailsPage }
        },
      },
      {
        path: '*',
        lazy: async () => {
          const { NotFoundPage } = await import('../pages/NotFoundPage')
          return { Component: NotFoundPage }
        },
      },
    ],
  },
])

export function App() {
  return (
    <ToastProvider>
      <AccessProvider>
        <AccessGate>
          <RouterProvider router={router} />
        </AccessGate>
      </AccessProvider>
    </ToastProvider>
  )
}
