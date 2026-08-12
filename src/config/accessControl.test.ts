import { describe, expect, it } from 'vitest'
import { canAccessPath, isKnownApplicationPath } from './accessControl'

describe('canAccessPath', () => {
  it('allows inventory users to open the data import page', () => {
    expect(canAccessPath(['inventory'], '/import')).toBe(true)
  })

  it('allows inventory users to open the operations workspace', () => {
    expect(canAccessPath(['inventory'], '/operations')).toBe(true)
  })

  it('allows inventory users to manage dynamic categories and open their items', () => {
    expect(canAccessPath(['inventory'], '/dynamic-categories')).toBe(true)
    expect(canAccessPath(['inventory'], '/dynamic-categories/category-id/items')).toBe(true)
  })

  it('keeps dynamic category management outside management-only access', () => {
    expect(canAccessPath(['management'], '/dynamic-categories')).toBe(false)
    expect(canAccessPath(['management'], '/dynamic-categories/category-id/items')).toBe(false)
  })

  it('allows inventory users to open the reports page', () => {
    expect(canAccessPath(['inventory'], '/reports')).toBe(true)
  })

  it('does not allow management-only users to open the data import page', () => {
    expect(canAccessPath(['management'], '/import')).toBe(false)
  })

  it('allows management users to open employee and supplier management', () => {
    expect(canAccessPath(['management'], '/parties')).toBe(true)
  })

  it('allows inventory users to open employee and supplier management', () => {
    expect(canAccessPath(['inventory'], '/parties')).toBe(true)
  })

  it('allows management users to open stocktake', () => {
    expect(canAccessPath(['management'], '/stocktake')).toBe(true)
  })

  it('does not allow inventory-only users to open stocktake', () => {
    expect(canAccessPath(['inventory'], '/stocktake')).toBe(false)
  })

  it('allows both roles to follow the legacy out-of-stock route', () => {
    expect(canAccessPath(['management'], '/out-of-stock')).toBe(true)
    expect(canAccessPath(['inventory'], '/out-of-stock')).toBe(true)
  })

  it('distinguishes application routes from unknown paths', () => {
    expect(isKnownApplicationPath('/operations')).toBe(true)
    expect(isKnownApplicationPath('/category/paints/item/123')).toBe(true)
    expect(isKnownApplicationPath('/dynamic-categories/category-id/items')).toBe(true)
    expect(isKnownApplicationPath('/does-not-exist')).toBe(false)
  })
})
