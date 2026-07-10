import { useRef, useState, type ChangeEvent } from 'react'
import { insertRows, type InventoryRow } from '../services/inventoryService'
import {
  parseInventoryExcel,
  type ExcelImportPreview,
  type ParsedInventoryRow,
} from '../utils/excelParser'

type ImportStatus = {
  type: 'success' | 'error'
  message: string
}

type ImportLogRow = InventoryRow & {
  file_name: string
  total_rows: number
  matched_sheets: string[]
  ignored_sheets: string[]
  rows_by_table: Record<string, number>
  parsing_errors: string[]
  status: string
  imported_at: string
}

type PreviewTableRow = {
  key: string
  sheetName: string
  tableName: string
  rowCount: number
  status: 'ready' | 'error' | 'ignored'
}

function getRowsCountByTable(preview: ExcelImportPreview) {
  return Object.fromEntries(
    Object.entries(preview.rowsByTable).map(([tableName, rows]) => [
      tableName,
      rows.length,
    ]),
  ) as Record<string, number>
}

function buildImportLogRow(
  preview: ExcelImportPreview,
  status: 'success' | 'failed',
): ImportLogRow {
  return {
    file_name: preview.fileName,
    total_rows: preview.totalRows,
    matched_sheets: preview.matchedSheets.map((sheet) => sheet.sheetName),
    ignored_sheets: preview.ignoredSheets,
    rows_by_table: getRowsCountByTable(preview),
    parsing_errors: preview.errors,
    status,
    imported_at: new Date().toISOString(),
  }
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
}

function getSheetStatus(sheetName: string, errors: readonly string[]) {
  return errors.some((errorMessage) => errorMessage.includes(`"${sheetName}"`))
    ? 'error'
    : 'ready'
}

function buildPreviewTableRows(preview: ExcelImportPreview): PreviewTableRow[] {
  return [
    ...preview.matchedSheets.map((sheet) => ({
      key: `matched-${sheet.table}-${sheet.sheetName}`,
      sheetName: sheet.sheetName,
      tableName: sheet.table,
      rowCount: sheet.rowCount,
      status: getSheetStatus(sheet.sheetName, preview.errors) as PreviewTableRow['status'],
    })),
    ...preview.ignoredSheets.map((sheetName) => ({
      key: `ignored-${sheetName}`,
      sheetName,
      tableName: 'غير معروف',
      rowCount: 0,
      status: 'ignored' as const,
    })),
  ]
}

export function ImportExcelPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedFileName, setSelectedFileName] = useState('')
  const [preview, setPreview] = useState<ExcelImportPreview | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [status, setStatus] = useState<ImportStatus | null>(null)

  const canConfirmImport = preview
    ? preview.matchedSheets.length > 0 && preview.totalRows > 0 && !isImporting
    : false

  const previewTableRows = preview ? buildPreviewTableRows(preview) : []
  const metricCards = preview
    ? [
        {
          label: 'الشيتات المعروفة',
          value: preview.matchedSheets.length,
          hint: 'تم التعرف عليها',
          valueClassName: 'text-[var(--app-success)]',
        },
        {
          label: 'الشيتات المتجاهلة',
          value: preview.ignoredSheets.length,
          hint: 'تحتاج مراجعة',
          valueClassName: 'text-[var(--app-warning)]',
        },
        {
          label: 'إجمالي الصفوف',
          value: preview.totalRows,
          hint: 'جاهزة للمعاينة',
          valueClassName: 'text-[var(--app-primary)]',
        },
        {
          label: 'الأخطاء',
          value: preview.errors.length,
          hint: preview.errors.length > 0 ? 'صفوف غير مكتملة' : 'لا توجد أخطاء',
          valueClassName: 'text-[var(--app-danger)]',
        },
      ]
    : []

  function resetPreviewState() {
    setSelectedFileName('')
    setPreview(null)
    setStatus(null)

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  function handleOpenFilePicker() {
    if (!isParsing && !isImporting) {
      fileInputRef.current?.click()
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    setStatus(null)
    setPreview(null)

    if (!file) {
      setSelectedFileName('')
      return
    }

    setSelectedFileName(file.name)
    setIsParsing(true)

    try {
      const parsedPreview = await parseInventoryExcel(file)
      setPreview(parsedPreview)
    } catch (error) {
      setStatus({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'حدث خطأ أثناء قراءة ملف Excel.',
      })
    } finally {
      setIsParsing(false)
      event.target.value = ''
    }
  }

  async function handleConfirmImport() {
    if (!preview || preview.matchedSheets.length === 0) {
      return
    }

    setIsImporting(true)
    setStatus(null)

    const importErrors: string[] = []

    for (const [tableName, rows] of Object.entries(preview.rowsByTable)) {
      if (rows.length === 0) {
        continue
      }

      const result = await insertRows<ParsedInventoryRow>(
        tableName,
        rows as readonly ParsedInventoryRow[],
      )

      if (result.error) {
        importErrors.push(`فشل استيراد جدول ${tableName}: ${result.error}`)
      }
    }

    const importLogStatus = importErrors.length === 0 ? 'success' : 'failed'
    const importLogResult = await insertRows<ImportLogRow>('imports', [
      buildImportLogRow(preview, importLogStatus),
    ])

    if (importLogResult.error) {
      importErrors.push(
        `فشل حفظ سجل الاستيراد في جدول imports: ${importLogResult.error}`,
      )
    }

    if (importErrors.length > 0) {
      setStatus({
        type: 'error',
        message: importErrors.join(' | '),
      })
    } else {
      setStatus({
        type: 'success',
        message: `تم استيراد ${preview.totalRows} صف بنجاح من الملف ${preview.fileName}.`,
      })
    }

    setIsImporting(false)
  }

  return (
    <section className="space-y-8">
      <div className="rounded-[24px] border border-dashed border-[var(--app-border-strong)] bg-[#fbfcff] px-6 py-10 text-center shadow-[var(--app-shadow)]">
        <label className="sr-only" htmlFor="excel-import-input">
          اختيار ملف Excel
        </label>
        <input
          id="excel-import-input"
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileChange}
          className="hidden"
        />

        <h2 className="text-[28px] font-bold tracking-tight text-[var(--app-primary)]">
          اسحب ملف Excel هنا أو اختر من جهازك
        </h2>
        <p className="mt-3 text-[15px] text-[var(--app-text-muted)]">
          هذه الميزة اختيارية لتسريع إدخال البيانات أو نقل ملفات قديمة
        </p>
        <button
          type="button"
          onClick={handleOpenFilePicker}
          disabled={isParsing || isImporting}
          className="mt-6 inline-flex h-[42px] min-w-[180px] items-center justify-center rounded-[12px] bg-[var(--app-primary)] px-6 text-[14px] font-semibold text-white transition hover:bg-[var(--app-primary-strong)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isParsing ? 'جاري تحليل الملف...' : 'اختيار ملف'}
        </button>

        {selectedFileName ? (
          <p className="mt-4 text-sm text-[var(--app-text-muted)]">
            الملف المحدد: {selectedFileName}
          </p>
        ) : null}
      </div>

      {status ? (
        <div
          className={[
            'rounded-[18px] border px-4 py-4 text-sm shadow-[var(--app-shadow)]',
            status.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700',
          ].join(' ')}
        >
          {status.message}
        </div>
      ) : null}

      {preview ? (
        <div className="space-y-8">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {metricCards.map((card) => (
              <div
                key={card.label}
                className="rounded-[18px] border border-[var(--app-border)] bg-[var(--app-panel)] px-6 py-4 text-right shadow-[var(--app-shadow)]"
              >
                <p className="text-[13px] font-medium text-[var(--app-text-muted)]">
                  {card.label}
                </p>
                <p className={['mt-2 text-[30px] font-bold', card.valueClassName].join(' ')}>
                  {formatNumber(card.value)}
                </p>
                <p className="mt-1 text-[12px] text-[var(--app-text-muted)]">
                  {card.hint}
                </p>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-[18px] border border-[var(--app-border)] bg-[var(--app-panel)] shadow-[var(--app-shadow)]">
            <div className="overflow-x-auto">
              <table className="min-w-full text-right text-[12px]">
                <thead className="bg-[var(--app-panel-soft)] text-[#344054]">
                  <tr>
                    <th className="px-4 py-3 text-[12px] font-semibold">اسم الشيت</th>
                    <th className="px-4 py-3 text-[12px] font-semibold">جدول Supabase</th>
                    <th className="px-4 py-3 text-[12px] font-semibold">عدد الصفوف</th>
                    <th className="px-4 py-3 text-[12px] font-semibold">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {previewTableRows.map((row, index) => (
                    <tr
                      key={row.key}
                      className={index % 2 === 0 ? 'bg-white' : 'bg-[#fcfcfd]'}
                    >
                      <td className="px-4 py-3 text-[13px] text-slate-700">
                        {row.sheetName}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-slate-700">
                        {row.tableName}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-slate-700">
                        {row.rowCount > 0 ? formatNumber(row.rowCount) : '—'}
                      </td>
                      <td
                        className={[
                          'px-4 py-3 text-[13px] font-medium',
                          row.status === 'ready'
                            ? 'text-slate-800'
                            : row.status === 'error'
                              ? 'text-[var(--app-danger)]'
                              : 'text-[var(--app-warning)]',
                        ].join(' ')}
                      >
                        {row.status === 'ready'
                          ? 'جاهز'
                          : row.status === 'error'
                            ? 'خطأ'
                            : 'متجاهل'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {preview.errors.length > 0 ? (
            <div className="space-y-3">
              {preview.errors.map((errorMessage, index) => (
                <div
                  key={`${errorMessage}-${index}`}
                  className="rounded-[16px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-[var(--app-shadow)]"
                >
                  {errorMessage}
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-start gap-4">
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={!canConfirmImport}
              className="inline-flex h-[42px] min-w-[220px] items-center justify-center rounded-[12px] bg-[var(--app-primary)] px-6 text-[14px] font-semibold text-white transition hover:bg-[var(--app-primary-strong)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isImporting ? 'جاري الاستيراد...' : 'تأكيد الاستيراد'}
            </button>
            <button
              type="button"
              onClick={resetPreviewState}
              disabled={isImporting}
              className="inline-flex h-[42px] min-w-[150px] items-center justify-center rounded-[12px] border border-[var(--app-border)] bg-white px-6 text-[14px] font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              إلغاء
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
