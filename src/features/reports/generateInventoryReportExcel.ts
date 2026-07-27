import * as XLSX from 'xlsx'
import type {
  InventoryReport,
  InventoryReportFilters,
} from '../../services/operationsService'

export function buildInventoryReportWorkbook(
  report: InventoryReport,
  filters: InventoryReportFilters,
) {
  const showRawMaterialFields = filters.categoryName === 'خامات'
  const headers = [
    'م',
    'اسم الصنف',
    'القسم',
    'السجل',
    ...(showRawMaterialFields
      ? ['رقم الكود', 'وزن', 'LENGTH', 'WIDTH', 'TH']
      : []),
    ...(filters.operationType !== 'issue'
      ? ['إجمالي الكمية المضافة']
      : []),
    ...(filters.operationType !== 'add'
      ? ['إجمالي الكمية المصروفة']
      : []),
  ]
  const rows = report.rows.map((row, index) => [
    index + 1,
    row.itemName,
    row.categoryName,
    row.projectName,
    ...(showRawMaterialFields
      ? [
          row.codeNumber ?? '',
          row.weight ?? '',
          row.length ?? '',
          row.width ?? '',
          row.th ?? '',
        ]
      : []),
    ...(filters.operationType !== 'issue'
      ? [row.totalAddedQuantity]
      : []),
    ...(filters.operationType !== 'add'
      ? [row.totalIssuedQuantity]
      : []),
  ])

  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
  worksheet['!cols'] = headers.map((header, index) => ({
    wch: index === 0
      ? 7
      : header === 'اسم الصنف'
        ? 32
        : Math.max(14, Math.min(24, header.length + 4)),
  }))
  worksheet['!autofilter'] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: rows.length, c: headers.length - 1 },
    }),
  }
  worksheet['!views'] = [{ RTL: true }]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'التقرير')
  return workbook
}

export function generateInventoryReportExcel(
  report: InventoryReport,
  filters: InventoryReportFilters,
) {
  const workbook = buildInventoryReportWorkbook(report, filters)
  const datePart = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(workbook, `inventory-report-${datePart}.xlsx`, {
    compression: true,
  })
}
