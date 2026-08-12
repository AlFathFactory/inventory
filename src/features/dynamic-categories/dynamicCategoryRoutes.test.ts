import { describe, expect, it } from 'vitest'
import { getDynamicCategoryItemsRoute, getDynamicItemDetailsRoute } from './dynamicCategoryRoutes'

describe('getDynamicCategoryItemsRoute', () => {
  it('builds an encoded route without affecting legacy category routes', () => {
    expect(getDynamicCategoryItemsRoute('category/id')).toBe(
      '/dynamic-categories/category%2Fid/items',
    )
  })

  it('builds a separate dynamic item-details route', () => {
    expect(getDynamicItemDetailsRoute('category-id', 'item/id')).toBe(
      '/dynamic-categories/category-id/items/item%2Fid',
    )
  })
})
