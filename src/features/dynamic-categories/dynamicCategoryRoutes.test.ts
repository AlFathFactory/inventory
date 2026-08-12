import { describe, expect, it } from 'vitest'
import { getDynamicCategoryItemsRoute } from './dynamicCategoryRoutes'

describe('getDynamicCategoryItemsRoute', () => {
  it('builds an encoded route without affecting legacy category routes', () => {
    expect(getDynamicCategoryItemsRoute('category/id')).toBe(
      '/dynamic-categories/category%2Fid/items',
    )
  })
})
