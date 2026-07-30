import type { CategoryKey } from '../../config/categoryConfig'

export type ItemDetailsSource = 'category' | 'dashboard' | 'reports' | 'operations'

export function getItemDetailsRoute(
  categoryKey: CategoryKey,
  itemId: string,
  source: ItemDetailsSource = 'category',
) {
  const route = `/category/${categoryKey}/item/${encodeURIComponent(itemId)}`
  return source === 'category' ? route : `${route}?source=${source}`
}
