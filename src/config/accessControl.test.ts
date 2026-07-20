import { describe, expect, it } from 'vitest'
import { canAccessPath } from './accessControl'

describe('canAccessPath', () => {
  it('allows inventory users to open the data import page', () => {
    expect(canAccessPath(['inventory'], '/import')).toBe(true)
  })

  it('does not allow management-only users to open the data import page', () => {
    expect(canAccessPath(['management'], '/import')).toBe(false)
  })
})
