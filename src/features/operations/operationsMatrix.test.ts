import { describe, expect, it } from 'vitest'
import {
  buildMovementTotals,
  getMatrixCellTotal,
  getOperationsDisplayDates,
} from './operationsMatrix'

describe('getOperationsDisplayDates', () => {
  it('ends on today for the current month', () => {
    expect(getOperationsDisplayDates('2026-07', 'five-days', '2026-07-30')).toEqual([
      '2026-07-30',
      '2026-07-29',
      '2026-07-28',
      '2026-07-27',
      '2026-07-26',
    ])
  })

  it('returns every calendar day for the full-month view', () => {
    const dates = getOperationsDisplayDates(
      '2026-06',
      'full-month',
      '2026-07-30',
    )

    expect(dates).toHaveLength(30)
    expect(dates[0]).toBe('2026-06-01')
    expect(dates.at(-1)).toBe('2026-06-30')
  })
})

describe('buildMovementTotals', () => {
  it('adds multiple movements in the same item/day/type cell', () => {
    const totals = buildMovementTotals([
      {
        id: '1',
        tableName: 'consumables',
        itemId: '12',
        operationType: 'issue',
        quantity: 4,
        operationDate: '2026-07-30',
      },
      {
        id: '2',
        tableName: 'consumables',
        itemId: '12',
        operationType: 'issue',
        quantity: 6,
        operationDate: '2026-07-30',
      },
    ])

    expect(
      getMatrixCellTotal(
        totals,
        'consumables',
        '12',
        '2026-07-30',
        'issue',
      ),
    ).toBe(10)
  })
})
