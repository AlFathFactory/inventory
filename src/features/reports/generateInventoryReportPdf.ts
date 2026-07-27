import type {
  InventoryReport,
  InventoryReportFilters,
  InventoryReportRow,
} from '../../services/operationsService'

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
})

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(
    /[&<>'"]/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
      })[character] ?? character,
  )
}

function displayValue(value: number | string | null) {
  if (value === null || value === '') return '—'
  return typeof value === 'number' ? numberFormatter.format(value) : value
}

function formatDate(value: string) {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'medium' }).format(date)
}

function getFilterLabels(filters: InventoryReportFilters) {
  return [
    filters.fromDate ? `من: ${formatDate(filters.fromDate)}` : null,
    filters.toDate ? `إلى: ${formatDate(filters.toDate)}` : null,
    filters.categoryName ? `المخزن: ${filters.categoryName}` : 'المخزن: كل المخازن',
    filters.projectName ? `القسم: ${filters.projectName}` : 'القسم: كل الأقسام',
    `نوع العملية: ${filters.operationType === 'add' ? 'إضافة' : filters.operationType === 'issue' ? 'صرف' : 'الإضافة والصرف'}`,
    filters.searchTerm ? `البحث: ${filters.searchTerm}` : null,
  ].filter(Boolean) as string[]
}

function getTableData(rows: InventoryReportRow[], showRawMaterialFields: boolean, operationType: InventoryReportFilters['operationType']) {
  const headers = [
    'م',
    'اسم الصنف',
    'المخزن',
    'القسم',
    ...(showRawMaterialFields
      ? ['رقم الكود', 'وزن', 'LENGTH', 'WIDTH', 'TH']
      : []),
    ...(operationType !== 'issue' ? ['إجمالي الكمية المضافة'] : []),
    ...(operationType !== 'add' ? ['إجمالي الكمية المصروفة'] : []),
  ]

  const values = rows.map((row, index) => [
    numberFormatter.format(index + 1),
    row.itemName,
    row.categoryName,
    row.projectName,
    ...(showRawMaterialFields
      ? [
          displayValue(row.codeNumber),
          displayValue(row.weight),
          displayValue(row.length),
          displayValue(row.width),
          displayValue(row.th),
        ]
      : []),
    ...(operationType !== 'issue' ? [numberFormatter.format(row.totalAddedQuantity)] : []),
    ...(operationType !== 'add' ? [numberFormatter.format(row.totalIssuedQuantity)] : []),
  ])

  return { headers, values }
}

export function generateInventoryReportPdf(
  report: InventoryReport,
  filters: InventoryReportFilters,
  reportWindow = window.open('', '_blank'),
) {
  if (!reportWindow) {
    window.alert(
      'تعذر فتح معاينة PDF. يرجى السماح بالنوافذ المنبثقة ثم المحاولة مرة أخرى.',
    )
    return
  }

  reportWindow.opener = null
  const showRawMaterialFields = filters.categoryName === 'خامات'
  const { headers, values } = getTableData(
    report.rows,
    showRawMaterialFields,
    filters.operationType,
  )
  const generatedAt = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date())
  reportWindow.document.open()
  reportWindow.document.write(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>تقرير حركة المخزون</title>
  <style>
    @page { size: A4 landscape; margin: 11mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #101828; font-family: Arial, Tahoma, sans-serif; font-size: 10px; }
    header { border-bottom: 2px solid #155eef; padding-bottom: 10px; }
    h1 { margin: 0; font-size: 22px; color: #0b1f66; }
    .meta { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; margin-top: 7px; color: #475467; }
    .filters { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0; }
    .filter { border: 1px solid #d0d5dd; border-radius: 10px; padding: 5px 9px; background: #f9fafb; }
    table { width: 100%; border-collapse: collapse; table-layout: auto; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    th, td { border: 1px solid #cfd7e6; padding: 6px; text-align: right; vertical-align: middle; overflow-wrap: anywhere; }
    th { background: #eaf0ff; color: #0b1f66; font-weight: 700; white-space: nowrap; }
    tbody tr:nth-child(even) { background: #f9fafb; }
    footer { margin-top: 8px; color: #667085; text-align: left; }
  </style>
</head>
<body>
  <header>
    <h1>تقرير حركة المخزون</h1>
    <div class="meta"><span>عدد الأصناف: ${numberFormatter.format(report.totalItems)}</span><span>جميع النتائج المفلترة</span><span>تاريخ الإنشاء: ${escapeHtml(generatedAt)}</span></div>
  </header>
  <div class="filters">${getFilterLabels(filters).map((label) => `<span class="filter">${escapeHtml(label)}</span>`).join('')}</div>
  <table>
    <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
    <tbody>${values.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>
  <footer>مصنع الفتح - نظام إدارة المخزون</footer>
</body>
</html>`)
  reportWindow.document.close()
  void reportWindow.document.fonts.ready.then(() => {
    reportWindow.focus()
    reportWindow.print()
  })
}
