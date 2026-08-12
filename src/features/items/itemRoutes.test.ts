import { describe, expect, it } from 'vitest'
import { getDashboardRowDetailsRoute, getItemDetailsRoute } from './itemRoutes'

describe('getItemDetailsRoute', () => {
  it('builds a category item route', () => {
    expect(getItemDetailsRoute('consumables', '123')).toBe(
      '/category/consumables/item/123',
    )
  })

  it('encodes item ids that contain reserved URL characters', () => {
    expect(getItemDetailsRoute('raw_materials', 'sheet/4 #2')).toBe(
      '/category/raw_materials/item/sheet%2F4%20%232',
    )
  })

  it('preserves the dashboard source on the details route', () => {
    expect(getItemDetailsRoute('paints', '7', 'dashboard')).toBe(
      '/category/paints/item/7?source=dashboard',
    )
  })

  it('preserves the reports source on the details route', () => {
    expect(getItemDetailsRoute('raw_materials', '12', 'reports')).toBe(
      '/category/raw_materials/item/12?source=reports',
    )
  })

  it('preserves the operations source on the details route', () => {
    expect(getItemDetailsRoute('consumables', '24', 'operations')).toBe(
      '/category/consumables/item/24?source=operations',
    )
  })
})

describe('getDashboardRowDetailsRoute', () => {
  it('routes legacy rows through the static category route', () => {
    expect(getDashboardRowDetailsRoute('paints', null, '7', 'dashboard')).toBe(
      '/category/paints/item/7?source=dashboard',
    )
  })

  it('routes dynamic rows to the dynamic category item details route', () => {
    expect(
      getDashboardRowDetailsRoute('dynamic', 'category-9', 'item-3', 'dashboard'),
    ).toBe('/dynamic-categories/category-9/items/item-3')
  })

  it('encodes dynamic ids that contain reserved URL characters', () => {
    expect(
      getDashboardRowDetailsRoute('dynamic', 'cat/1', 'item 2', 'dashboard'),
    ).toBe('/dynamic-categories/cat%2F1/items/item%202')
  })
})
