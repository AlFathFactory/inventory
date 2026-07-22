import { describe, expect, it } from 'vitest'
import { getItemDetailsRoute } from './itemRoutes'

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
})
