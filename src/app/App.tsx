import { lazy } from 'react'
import { createHashRouter, RouterProvider } from 'react-router-dom'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { DashboardPage } from '../pages/DashboardPage'
import { AccessGate } from '../features/access/AccessGate'
import { AccessProvider } from '../features/access/AccessContext'
import { ToastProvider } from '../components/ToastProvider'

const CategoryPage = lazy(() => import('../pages/CategoryPage').then((module) => ({ default: module.CategoryPage })))
const ImportExcelPage = lazy(() => import('../pages/ImportExcelPage').then((module) => ({ default: module.ImportExcelPage })))
const ItemDetailsPage = lazy(() => import('../pages/ItemDetailsPage').then((module) => ({ default: module.ItemDetailsPage })))
const ItemCodeGuidePage = lazy(() => import('../pages/ItemCodeGuidePage').then((module) => ({ default: module.ItemCodeGuidePage })))
const LowStockPage = lazy(() => import('../pages/LowStockPage').then((module) => ({ default: module.LowStockPage })))
const NotFoundPage = lazy(() => import('../pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })))
const ProjectsPage = lazy(() => import('../pages/ProjectsPage').then((module) => ({ default: module.ProjectsPage })))
const ReportsPage = lazy(() => import('../pages/ReportsPage').then((module) => ({ default: module.ReportsPage })))
const SyncCenterPage = lazy(() => import('../pages/SyncCenterPage').then((module) => ({ default: module.SyncCenterPage })))
const PartiesPage = lazy(() => import('../pages/PartiesPage').then((module) => ({ default: module.PartiesPage })))
const OperationsPage = lazy(() => import('../pages/OperationsPage').then((module) => ({ default: module.OperationsPage })))
const StocktakePage = lazy(() => import('../pages/StocktakePage').then((module) => ({ default: module.StocktakePage })))

// Hash routing keeps every request on index.html, so deep links continue to
// work when the static host is not configured with an SPA fallback.
const router = createHashRouter([
  {
    path: '/',
    element: <DashboardLayout />,
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: 'reports',
        element: <ReportsPage />,
      },
      {
        path: 'import',
        element: <ImportExcelPage />,
      },
      {
        path: 'low-stock',
        element: <LowStockPage />,
      },
      {
        path: 'item-code-guide',
        element: <ItemCodeGuidePage />,
      },
      {
        path: 'projects',
        element: <ProjectsPage />,
      },
      {
        path: 'operations',
        element: <OperationsPage />,
      },
      {
        path: 'parties',
        element: <PartiesPage />,
      },
      {
        path: 'stocktake',
        element: <StocktakePage />,
      },
      {
        path: 'sync-center',
        element: <SyncCenterPage />,
      },
      {
        path: 'out-of-stock',
        element: <DashboardPage />,
      },
      {
        path: 'category/:categoryKey',
        element: <CategoryPage />,
      },
      {
        path: 'category/:categoryKey/item/:itemId',
        element: <ItemDetailsPage />,
      },
      {
        path: '*',
        element: <NotFoundPage />,
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
