import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { CategoryPage } from '../pages/CategoryPage'
import { DashboardPage } from '../pages/DashboardPage'
import { ImportExcelPage } from '../pages/ImportExcelPage'
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
        path: 'operations',
        element: <DashboardPage />,
      },
      {
        path: 'items',
        element: <DashboardPage />,
      },
      {
        path: 'projects',
        element: <DashboardPage />,
      },
      {
        path: 'import',
        element: <ImportExcelPage />,
      },
      {
        path: 'low-stock',
        element: <DashboardPage />,
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
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
])

export function App() {
  return <RouterProvider router={router} />
}
