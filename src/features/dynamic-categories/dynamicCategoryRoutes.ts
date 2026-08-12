export function getDynamicCategoryItemsRoute(categoryId: string) {
  return `/dynamic-categories/${encodeURIComponent(categoryId)}/items`
}
