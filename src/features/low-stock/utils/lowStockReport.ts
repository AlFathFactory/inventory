import type { LowStockRow } from '../types'
import { formatNumber, getAlertStatusLabel } from './lowStockRows'

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] ?? character))
}

export function generateLowStockReport(rows: LowStockRow[], showExpiryDate: boolean) {
  const reportWindow = window.open('', '_blank')
  if (!reportWindow) {
    window.alert('تعذر فتح معاينة التقرير. يرجى السماح بالنوافذ المنبثقة ثم المحاولة مرة أخرى.')
    return
  }
  reportWindow.opener = null
  const headers = ['الحالة', 'القسم', 'الصنف', 'السجل', ...(showExpiryDate ? ['تاريخ الانتهاء'] : []), 'الرصيد الحالي', 'الحد الأدنى']
  const reportRows = rows.map((row) => [getAlertStatusLabel(row.status), row.categoryLabel, row.itemName, row.projectName ?? '—', ...(showExpiryDate ? [row.expiryDateLabel] : []), formatNumber(row.stockBalance), formatNumber(row.minQuantity)])
  const generatedAt = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())
  reportWindow.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8" /><title>تقرير تنبيهات المخزون</title><style>@page { size: A4 landscape; margin: 14mm; } * { box-sizing: border-box; } body { color: #0f172a; font-family: Arial, Tahoma, sans-serif; font-size: 12px; } h1 { margin: 0; font-size: 22px; } .meta { display: flex; justify-content: space-between; margin: 8px 0 20px; color: #475569; } table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: right; vertical-align: top; } th { background: #e2e8f0; font-weight: 700; } tr { break-inside: avoid; }</style></head><body><h1>تقرير تنبيهات المخزون</h1><div class="meta"><span>عدد النتائج: ${rows.length}</span><span>تاريخ الإنشاء: ${escapeHtml(generatedAt)}</span></div><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${reportRows.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`)
  reportWindow.document.close()
  reportWindow.focus()
  reportWindow.print()
}
