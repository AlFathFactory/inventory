import { describe, expect, it } from 'vitest'
import {
  getStockStatus,
  getStockStatusFromValues,
  getStockStatusLabel,
} from './statusUtils'

describe('stock status', () => {
  it.each([
    [0, 5, 'out'],
    [-1, 5, 'out'],
    [3, 5, 'low'],
    [5, 5, 'low'],
    [6, 5, 'safe'],
    ['5', '5', 'low'],
  ] as const)('maps balance %s with minimum %s to %s', (balance, minimum, expected) => {
    expect(getStockStatusFromValues(balance, minimum)).toBe(expected)
  })

  it('uses the same rule for configured row fields', () => {
    expect(getStockStatus({ gas_balance: 2, min_quantity: 3 }, 'gas_balance', 'min_quantity'))
      .toBe('low')
  })

  it('returns the Arabic label used by item details', () => {
    expect(getStockStatusLabel('low')).toBe('قليل')
  })

  it('does not invent a status when either quantity is missing', () => {
    expect(getStockStatusFromValues(null, 5)).toBeNull()
    expect(getStockStatusFromValues(5, undefined)).toBeNull()
  })
})
