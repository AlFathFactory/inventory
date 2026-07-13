import type { CategoryKey } from '../../config/categoryConfig'

export type ItemDetailsSource = 'category' | 'dashboard'

export function getItemDetailsRoute(
  categoryKey: CategoryKey,
  itemId: string,
  source: ItemDetailsSource = 'category',
) {
  const route = `/category/${categoryKey}/item/${encodeURIComponent(itemId)}`
  return source === 'dashboard' ? `${route}?source=dashboard` : route
}
