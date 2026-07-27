import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import type {
  InventoryReport,
  InventoryReportFilters,
} from '../../services/operationsService'
import { buildInventoryReportWorkbook } from './generateInventoryReportExcel'

const report: InventoryReport = {
  totalItems: 2,
  summary: {
    additionOperationsCount: 2,
    totalAddedQuantity: 19.5,
    issueOperationsCount: 1,
    totalIssuedQuantity: 3,
  },
  rows: [
    {
      tableName: 'consumables',
      itemId: '1',
      itemName: 'Item A',
      categoryName: 'مستهلكات',
      projectName: 'السجل 1',
      totalAddedQuantity: 12.5,
      totalIssuedQuantity: 3,
      codeNumber: null,
      weight: null,
      length: null,
      width: null,
      th: null,
    },
    {
      tableName: 'consumables',
      itemId: '2',
      itemName: 'Item B',
      categoryName: 'مستهلكات',
      projectName: 'السجل 1',
      totalAddedQuantity: 7,
      totalIssuedQuantity: 0,
      codeNumber: null,
      weight: null,
      length: null,
      width: null,
      th: null,
    },
  ],
}

const filters: InventoryReportFilters = {
  operationType: 'both',
  page: 1,
  pageSize: 10,
}

describe('buildInventoryReportWorkbook', () => {
  it('creates numbered rows with typed numeric totals', () => {
    const workbook = buildInventoryReportWorkbook(report, filters)
    const worksheet = workbook.Sheets['التقرير']
    const values = XLSX.utils.sheet_to_json<(string | number)[]>(worksheet, {
      header: 1,
    })

    expect(values).toHaveLength(3)
    expect(values[0]).toEqual([
      'م',
      'اسم الصنف',
      'القسم',
      'السجل',
      'إجمالي الكمية المضافة',
      'إجمالي الكمية المصروفة',
    ])
    expect(values[1]?.[0]).toBe(1)
    expect(values[2]?.[0]).toBe(2)
    expect(values[1]?.[4]).toBe(12.5)
    expect(values[1]?.[5]).toBe(3)
  })

  it('includes only the selected operation column', () => {
    const workbook = buildInventoryReportWorkbook(report, {
      ...filters,
      operationType: 'issue',
    })
    const worksheet = workbook.Sheets['التقرير']
    const values = XLSX.utils.sheet_to_json<(string | number)[]>(worksheet, {
      header: 1,
    })

    expect(values[0]).not.toContain('إجمالي الكمية المضافة')
    expect(values[0]).toContain('إجمالي الكمية المصروفة')
  })
})
