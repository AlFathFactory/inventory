import { describe, expect, it } from 'vitest'
import type { CategorySummaryItem } from '../../../services/itemsService'
import { filterCategoryRows, filterCategoryRowsByProject } from './categoryRows'

const row: CategorySummaryItem = {
  table_name: 'consumables',
  category_name: 'مستهلكات',
  item_id: 1,
  item_key: 'item-1',
  project_name: 'مشروع الاختبار',
  item_name: 'صنف الاختبار',
  supplier_name: 'المورد الرئيسي',
  stock_balance: 10,
  min_quantity: 2,
  status: 'آمن',
  total_added: 10,
  total_issued: 0,
  source_rows_count: 1,
  updated_at: null,
  created_at: null,
}

describe('filterCategoryRows', () => {
  it('finds an item by its supplier name', () => {
    expect(filterCategoryRows([row], 'المورد الرئيسي')).toEqual([row])
  })

  it('finds an item when the query omits stored dimension spacing', () => {
    const dimensionedRow = { ...row, item_name: 'مسمار 20 * 80' }
    expect(filterCategoryRows([dimensionedRow], 'مسمار20*80')).toEqual([dimensionedRow])
  })

  it('filters projects by exact stored name', () => {
    expect(filterCategoryRowsByProject([row], 'مشروع الاختبار')).toEqual([row])
    expect(filterCategoryRowsByProject([row], 'مشروع')).toEqual([])
  })
})
