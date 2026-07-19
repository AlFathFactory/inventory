import { createHashRouter, RouterProvider } from 'react-router-dom'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { CategoryPage } from '../pages/CategoryPage'
import { DashboardPage } from '../pages/DashboardPage'
import { ImportExcelPage } from '../pages/ImportExcelPage'
import { ItemDetailsPage } from '../pages/ItemDetailsPage'
import { ItemCodeGuidePage } from '../pages/ItemCodeGuidePage'
import { LowStockPage } from '../pages/LowStockPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { ProjectsPage } from '../pages/ProjectsPage'
import { SyncCenterPage } from '../pages/SyncCenterPage'
import { AccessGate } from '../features/access/AccessGate'
import { AccessProvider } from '../features/access/AccessContext'
import { ToastProvider } from '../components/ToastProvider'

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
