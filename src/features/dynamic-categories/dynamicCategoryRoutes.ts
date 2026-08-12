export function getDynamicCategoryItemsRoute(categoryId: string) {
  return `/dynamic-categories/${encodeURIComponent(categoryId)}/items`
}

export function getDynamicItemDetailsRoute(categoryId: string, itemId: string) {
  return `${getDynamicCategoryItemsRoute(categoryId)}/${encodeURIComponent(itemId)}`
}
