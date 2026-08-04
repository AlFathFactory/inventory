import { describe, expect, it } from 'vitest'
import { canAccessPath } from './accessControl'

describe('canAccessPath', () => {
  it('allows inventory users to open the data import page', () => {
    expect(canAccessPath(['inventory'], '/import')).toBe(true)
  })

  it('allows inventory users to open the operations workspace', () => {
    expect(canAccessPath(['inventory'], '/operations')).toBe(true)
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

  it('allows management users to open stocktake', () => {
    expect(canAccessPath(['management'], '/stocktake')).toBe(true)
  })

  it('does not allow inventory-only users to open stocktake', () => {
    expect(canAccessPath(['inventory'], '/stocktake')).toBe(false)
  })
})
