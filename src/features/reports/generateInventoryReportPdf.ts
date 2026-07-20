import type {
  InventoryReport,
  InventoryReportFilters,
  InventoryReportRow,
} from '../../services/operationsService'

const numberFormatter = new Intl.NumberFormat('ar-EG', {
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
    : new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(date)
}

function getFilterLabels(filters: InventoryReportFilters) {
  return [
    filters.fromDate ? `من: ${formatDate(filters.fromDate)}` : null,
    filters.toDate ? `إلى: ${formatDate(filters.toDate)}` : null,
    filters.categoryName ? `القسم: ${filters.categoryName}` : 'القسم: جميع الأقسام',
    filters.projectName ? `المشروع: ${filters.projectName}` : 'المشروع: جميع المشاريع',
  ].filter(Boolean) as string[]
}

function getTableData(rows: InventoryReportRow[], showRawMaterialFields: boolean) {
  const headers = [
    'اسم الصنف',
    'القسم',
    'المشروع',
    ...(showRawMaterialFields
      ? ['رقم الكود', 'وزن', 'LENGTH', 'WIDTH', 'TH']
      : []),
    'نوع العملية',
    'الكمية',
    'التاريخ',
  ]

  const values = rows.map((row) => [
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
    row.operationType === 'add' ? 'إضافة' : 'صرف',
    numberFormatter.format(row.quantity),
    formatDate(row.operationDate),
  ])

  return { headers, values }
}

export function generateInventoryReportPdf(
  report: InventoryReport,
  filters: InventoryReportFilters,
) {
  const reportWindow = window.open('', '_blank')
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
  )
  const generatedAt = new Intl.DateTimeFormat('ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date())
  const summary = [
    ['عدد عمليات الإضافة', report.summary.additionOperationsCount],
    ['إجمالي الكمية المضافة', report.summary.totalAddedQuantity],
    ['عدد عمليات الصرف', report.summary.issueOperationsCount],
    ['إجمالي الكمية المصروفة', report.summary.totalIssuedQuantity],
  ]

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
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0 16px; }
    .card { border: 1px solid #dbe3f0; border-radius: 10px; padding: 9px; background: #f8faff; }
    .card-label { color: #667085; }
    .card-value { margin-top: 4px; font-size: 17px; font-weight: 700; color: #155eef; }
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
    <div class="meta"><span>عدد النتائج: ${numberFormatter.format(report.rows.length)}</span><span>تاريخ الإنشاء: ${escapeHtml(generatedAt)}</span></div>
  </header>
  <div class="filters">${getFilterLabels(filters).map((label) => `<span class="filter">${escapeHtml(label)}</span>`).join('')}</div>
  <section class="summary">${summary.map(([label, value]) => `<div class="card"><div class="card-label">${escapeHtml(label)}</div><div class="card-value">${numberFormatter.format(Number(value))}</div></div>`).join('')}</section>
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
