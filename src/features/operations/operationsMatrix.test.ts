import { describe, expect, it } from 'vitest'
import {
  buildMovementTotals,
  getMatrixCellTotal,
  getOperationsDisplayDates,
  getOperationsMatrixFrozenColumns,
  matchesMatrixScrewFilters,
} from './operationsMatrix'

describe('getOperationsDisplayDates', () => {
  it('returns every calendar day in the selected month', () => {
    const dates = getOperationsDisplayDates('2026-06')

    expect(dates).toHaveLength(30)
    expect(dates[0]).toBe('2026-06-01')
    expect(dates.at(-1)).toBe('2026-06-30')
  })

  it('includes leap day when the selected month is February in a leap year', () => {
    const dates = getOperationsDisplayDates('2028-02')

    expect(dates).toHaveLength(29)
    expect(dates.at(-1)).toBe('2028-02-29')
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

describe('getOperationsMatrixFrozenColumns', () => {
  it('places the screw section first from the right, before the item name', () => {
    expect(
      getOperationsMatrixFrozenColumns(true).map((column) => column.key),
    ).toEqual(['project', 'item', 'din', 'codeNumber', 'balance'])
  })

  it('keeps the compact columns for other inventory types', () => {
    expect(
      getOperationsMatrixFrozenColumns(false).map((column) => column.key),
    ).toEqual(['item', 'balance'])
  })

  it('shows raw-material identity and dimensions before the balance', () => {
    expect(
      getOperationsMatrixFrozenColumns(false, true).map((column) => column.key),
    ).toEqual([
      'codeNumber',
      'item',
      'length',
      'width',
      'dimension',
      'weight',
      'balance',
    ])
  })
})

describe('matchesMatrixScrewFilters', () => {
  it('applies DIN and code-number filters independently', () => {
    expect(matchesMatrixScrewFilters('DIN 933', 'SC-1250', {
      din: '933',
      codeNumber: '',
    })).toBe(true)
    expect(matchesMatrixScrewFilters('DIN 933', 'SC-1250', {
      din: '',
      codeNumber: '1250',
    })).toBe(true)
    expect(matchesMatrixScrewFilters('DIN 933', 'SC-1250', {
      din: '912',
      codeNumber: '1250',
    })).toBe(false)
  })
})
