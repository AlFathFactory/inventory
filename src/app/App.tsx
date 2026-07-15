import { createHashRouter, RouterProvider } from 'react-router-dom'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { CategoryPage } from '../pages/CategoryPage'
import { DashboardPage } from '../pages/DashboardPage'
import { ImportExcelPage } from '../pages/ImportExcelPage'
import { ItemDetailsPage } from '../pages/ItemDetailsPage'
import { ItemCodeGuidePage } from '../pages/ItemCodeGuidePage'
import { LowStockPage } from '../pages/LowStockPage'
import { NotFoundPage } from '../pages/NotFoundPage'

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
  return <RouterProvider router={router} />
}
