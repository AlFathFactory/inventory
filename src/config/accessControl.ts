export type AccessArea = 'management' | 'inventory'

export type AccessUser = {
  /** A label shown only after access is granted. */
  name: string
  /** This is intentionally a simple client-side access code, not authentication. */
  password: string
  areas: AccessArea[]
}

// Add, remove, or change entries here to manage passwords and area access.
// Passwords are included in the frontend bundle, so this is a convenience gate,
// not protection for sensitive data.
export const accessUsers: AccessUser[] = [
  { name: 'الإدارة', password: 'mang26', areas: ['management'] },
  { name: 'المخزن', password: 'inv26', areas: ['inventory'] },
  { name: 'ادمن', password: 'admin26', areas: ['management', 'inventory'] },
]

const sharedPaths = ['/item-code-guide', '/out-of-stock']
const managementPaths = ['/', '/reports', '/low-stock', '/parties', '/stocktake']
const inventoryPaths = ['/', '/reports', '/import', '/low-stock', '/projects', '/dynamic-categories', '/operations', '/parties', '/sync-center']
const itemDetailsPath = /^\/category\/[^/]+\/item\/[^/]+$/
const categoryPath = /^\/category\/[^/]+$/
const dynamicCategoryItemsPath = /^\/dynamic-categories\/[^/]+\/items$/

export function isKnownApplicationPath(pathname: string) {
  return (
    sharedPaths.includes(pathname) ||
    managementPaths.includes(pathname) ||
    inventoryPaths.includes(pathname) ||
    categoryPath.test(pathname) ||
    itemDetailsPath.test(pathname) ||
    dynamicCategoryItemsPath.test(pathname)
  )
}

export function canAccessPath(areas: AccessArea[], pathname: string) {
  if (sharedPaths.includes(pathname)) return true
  if (
    areas.includes('management') &&
    (managementPaths.includes(pathname) || itemDetailsPath.test(pathname))
  ) {
    return true
  }

  return (
    areas.includes('inventory') &&
    (inventoryPaths.includes(pathname) ||
      pathname.startsWith('/category/') ||
      dynamicCategoryItemsPath.test(pathname))
  )
}
