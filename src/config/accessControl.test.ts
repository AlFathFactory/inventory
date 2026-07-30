import { describe, expect, it } from 'vitest'
import { canAccessPath } from './accessControl'

describe('canAccessPath', () => {
  it('allows inventory users to open the data import page', () => {
    expect(canAccessPath(['inventory'], '/import')).toBe(true)
  })

  it('allows inventory users to open the operations workspace', () => {
    expect(canAccessPath(['inventory'], '/operations')).toBe(true)
  })

  it('does not allow management-only users to open the data import page', () => {
    expect(canAccessPath(['management'], '/import')).toBe(false)
  })

  it('allows management users to open employee and supplier management', () => {
    expect(canAccessPath(['management'], '/parties')).toBe(true)
  })
})
