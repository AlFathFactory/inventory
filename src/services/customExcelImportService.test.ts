import { describe, expect, it } from 'vitest'
import { buildMovementImportKey, prepareItem } from './customExcelImportService'
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

describe('prepareItem', () => {
  it('keeps a trimmed raw-material code number as text', () => {
    expect(prepareItem({
      __rowNumber: 2,
      table_name: 'raw_materials',
      item_key: 'raw:1',
      item_name: 'Steel',
      code_number: ' 001-A ',
    }).code_number).toBe('001-A')
  })

  it('stores a blank raw-material code number as null', () => {
    expect(prepareItem({
      __rowNumber: 3,
      table_name: 'raw_materials',
      item_key: 'raw:2',
      item_name: 'Plate',
      code_number: '   ',
    }).code_number).toBeNull()
  })

  it('does not map code_number to other inventory tables', () => {
    expect(prepareItem({
      __rowNumber: 4,
      table_name: 'consumables',
      item_key: 'consumable:1',
      item_name: 'Tape',
      code_number: '001',
    })).not.toHaveProperty('code_number')
  })

  it('keeps screw DIN and code number as trimmed text', () => {
    expect(prepareItem({
      __rowNumber: 2,
      table_name: 'screws',
      din: '  DIN-933 / A  ',
      code_number: '  001-A  ',
    })).toMatchObject({
      din: 'DIN-933 / A',
      code_number: '001-A',
    })
  })

  it('maps supported localized screw column names', () => {
    expect(prepareItem({
      __rowNumber: 3,
      table_name: 'stock_screws',
      'كود DIN': ' 912 ',
      'رقم الصنف': ' 0007/B ',
    })).toMatchObject({
      din: '912',
      code_number: '0007/B',
    })
  })

  it('stores empty screw DIN and code number as null', () => {
    expect(prepareItem({
      __rowNumber: 4,
      table_name: 'screws',
      DIN: '  ',
      'Code Number': '',
    })).toMatchObject({ din: null, code_number: null })
  })
})
