import type { CategoryKey } from '../../config/categoryConfig'
import { getDynamicItemDetailsRoute } from '../dynamic-categories/dynamicCategoryRoutes'

export type ItemDetailsSource = 'category' | 'dashboard' | 'reports' | 'operations'

export function getItemDetailsRoute(
  categoryKey: CategoryKey,
  itemId: string,
  source: ItemDetailsSource = 'category',
) {
  const route = `/category/${categoryKey}/item/${encodeURIComponent(itemId)}`
  return source === 'category' ? route : `${route}?source=${source}`
}

export function getDashboardRowDetailsRoute(
  categoryKey: CategoryKey | 'dynamic',
  categoryId: string | null,
  itemId: string,
  source: ItemDetailsSource = 'category',
) {
  if (categoryKey === 'dynamic') {
    return getDynamicItemDetailsRoute(categoryId ?? '', itemId)
  }
  return getItemDetailsRoute(categoryKey, itemId, source)
}
