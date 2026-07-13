import { describe, expect, it } from 'vitest'
import { buildMovementImportKey } from './customExcelImportService'
import type { CustomExcelRow } from '../utils/customExcelParser'

const movement: CustomExcelRow = {
  __rowNumber: 8,
  item_key: 'screws:m8',
  operation_type: 'issue',
  operation_date: '2026-07-13',
  quantity: 4,
}

describe('buildMovementImportKey', () => {
  it('returns the same key for the same import row', () => {
    expect(buildMovementImportKey('inventory.xlsx', movement)).toBe(
      buildMovementImportKey('inventory.xlsx', { ...movement }),
    )
  })

  it('returns different keys for different source rows', () => {
    expect(buildMovementImportKey('inventory.xlsx', movement)).not.toBe(
      buildMovementImportKey('inventory.xlsx', { ...movement, __rowNumber: 9 }),
    )
  })
})
