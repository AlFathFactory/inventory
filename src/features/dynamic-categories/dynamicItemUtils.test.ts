import { describe, expect, it } from 'vitest'
import type { DynamicCategoryItem } from './types'
import {
  buildDynamicItemArchivePatch,
  buildDynamicItemEditPatch,
  DYNAMIC_ITEM_NAME_REQUIRED,
  DYNAMIC_ITEM_QUANTITY_INVALID,
  getDynamicItemStockStatus,
  matchesDynamicItemSearch,
  validateDynamicItemValues,
} from './dynamicItemUtils'

const item = {
  id: 'item-1',
  category_id: 'category-1',
  item_name: 'مسمار تثبيت',
  internal_code: 'DC001-001',
  project: 'خط الإنتاج',
  supplier_name: 'المورد الرئيسي',
  opening_balance: 5,
  stock_balance: 5,
  min_quantity: 2,
  added: 5,
  issued: 0,
  total_added: 5,
  total_issued: 0,
  notes: null,
  source_sheet: 'قطع الغيار',
  is_archived: false,
  transaction_date: null,
  created_at: '2026-08-12T00:00:00Z',
  updated_at: '2026-08-12T00:00:00Z',
} satisfies DynamicCategoryItem

describe('dynamic item utilities', () => {
  it('matches the backend stock-status rules', () => {
    expect(getDynamicItemStockStatus(0, 0)).toBe('out')
    expect(getDynamicItemStockStatus(-1, 5)).toBe('out')
    expect(getDynamicItemStockStatus(3, 3)).toBe('low')
    expect(getDynamicItemStockStatus(4, 3)).toBe('safe')
  })

  it('searches name, code, supplier, and project', () => {
    expect(matchesDynamicItemSearch(item, 'تثبيت')).toBe(true)
    expect(matchesDynamicItemSearch(item, 'DC001')).toBe(true)
    expect(matchesDynamicItemSearch(item, 'الرئيسي')).toBe(true)
    expect(matchesDynamicItemSearch(item, 'الإنتاج')).toBe(true)
    expect(matchesDynamicItemSearch(item, 'غير موجود')).toBe(false)
  })

  it('ignores spacing differences when searching dynamic item names', () => {
    expect(
      matchesDynamicItemSearch(
        { ...item, item_name: 'مسمار 20 * 80' },
        'مسمار20*80',
      ),
    ).toBe(true)
  })

  it('supports an empty filtered result', () => {
    expect([item].filter((row) => matchesDynamicItemSearch(row, 'لا يطابق'))).toEqual([])
  })

  it('validates required names and non-negative quantities', () => {
    expect(validateDynamicItemValues('   ', 0, 0)).toBe(DYNAMIC_ITEM_NAME_REQUIRED)
    expect(validateDynamicItemValues('صنف', -1, 0)).toBe(DYNAMIC_ITEM_QUANTITY_INVALID)
    expect(validateDynamicItemValues('صنف', 0, Number.NaN)).toBe(DYNAMIC_ITEM_QUANTITY_INVALID)
    expect(validateDynamicItemValues('صنف', 0, 0)).toBeNull()
  })

  it('builds a safe edit patch without system or stock fields', () => {
    expect(
      buildDynamicItemEditPatch({
        itemName: '  مسمار  جديد ',
        project: ' ',
        supplierName: ' مورد ',
        minQuantity: 3,
        notes: ' ملاحظة ',
      }),
    ).toEqual({
      item_name: 'مسمار جديد',
      project: null,
      supplier_name: 'مورد',
      min_quantity: 3,
      notes: 'ملاحظة',
    })
  })

  it('archives and restores with is_archived only', () => {
    expect(buildDynamicItemArchivePatch(true)).toEqual({ is_archived: true })
    expect(buildDynamicItemArchivePatch(false)).toEqual({ is_archived: false })
  })
})
