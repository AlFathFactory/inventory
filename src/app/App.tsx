import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { CategoryPage } from '../pages/CategoryPage'
import { DashboardPage } from '../pages/DashboardPage'
import { ImportExcelPage } from '../pages/ImportExcelPage'
import { ItemDetailsPage } from '../pages/ItemDetailsPage'
import { ItemsPage } from '../pages/ItemsPage'
import { LowStockPage } from '../pages/LowStockPage'
import { NotFoundPage } from '../pages/NotFoundPage'

const router = createBrowserRouter([
  {
    path: '/',
    element: <DashboardLayout />,
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: 'items',
        element: <ItemsPage />,
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
