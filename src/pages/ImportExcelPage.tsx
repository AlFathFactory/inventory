import { useState, type ChangeEvent } from 'react'
import { categoryConfig, type CategoryKey } from '../config/categoryConfig'
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

function getCategoryLabel(categoryKey: CategoryKey) {
  return categoryConfig[categoryKey].label
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

function buildPreviewTableRows(preview: ExcelImportPreview) {
  return preview.matchedSheets.map((sheet) => ({
    ...sheet,
    categoryLabel: getCategoryLabel(sheet.categoryKey),
  }))
}

export function ImportExcelPage() {
  const [selectedFileName, setSelectedFileName] = useState('')
  const [preview, setPreview] = useState<ExcelImportPreview | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [status, setStatus] = useState<ImportStatus | null>(null)

  const previewRows = preview ? buildPreviewTableRows(preview) : []
  const previewData = preview
  const canConfirmImport = previewData
    ? previewData.matchedSheets.length > 0 &&
      previewData.totalRows > 0 &&
      !isImporting
    : false

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
    <section className="space-y-6 p-6 sm:p-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">استيراد Excel</h1>
        <p className="text-sm text-slate-500">
          اختر ملف Excel لقراءة الشيتات ومراجعة البيانات قبل الحفظ.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-slate-700">
            اختر ملف Excel
          </span>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            className="block w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 file:ms-0 file:me-4 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
          />
        </label>

        {selectedFileName ? (
          <p className="mt-3 text-sm text-slate-500">
            الملف المحدد: {selectedFileName}
          </p>
        ) : null}
      </div>

      {isParsing ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
          جاري تحليل ملف Excel...
        </div>
      ) : null}

      {status ? (
        <div
          className={[
            'rounded-2xl px-4 py-4 text-sm',
            status.type === 'success'
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border border-red-200 bg-red-50 text-red-700',
          ].join(' ')}
        >
          {status.message}
        </div>
      ) : null}

      {preview ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">اسم الملف</p>
              <p className="mt-2 font-medium text-slate-900">{preview.fileName}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">الشيتات المطابقة</p>
              <p className="mt-2 font-medium text-slate-900">
                {preview.matchedSheets.length}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">الشيتات المتجاهلة</p>
              <p className="mt-2 font-medium text-slate-900">
                {preview.ignoredSheets.length}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">إجمالي الصفوف</p>
              <p className="mt-2 font-medium text-slate-900">{preview.totalRows}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="font-medium text-slate-900">ملخص الشيتات المطابقة</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-right">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-sm font-semibold text-slate-700">
                      اسم الشيت
                    </th>
                    <th className="px-4 py-3 text-sm font-semibold text-slate-700">
                      الفئة
                    </th>
                    <th className="px-4 py-3 text-sm font-semibold text-slate-700">
                      الجدول
                    </th>
                    <th className="px-4 py-3 text-sm font-semibold text-slate-700">
                      عدد الصفوف
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewRows.map((row) => (
                    <tr key={`${row.table}-${row.sheetName}`}>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {row.sheetName}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {row.categoryLabel}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {row.table}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {row.rowCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="font-medium text-slate-900">عدد الصفوف لكل فئة</h2>
              <div className="mt-4 space-y-3">
                {previewRows.length > 0 ? (
                  previewRows.map((row) => (
                    <div
                      key={`${row.categoryKey}-count`}
                      className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"
                    >
                      <span className="text-sm text-slate-700">
                        {row.categoryLabel}
                      </span>
                      <span className="text-sm font-medium text-slate-900">
                        {row.rowCount}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">
                    لا توجد شيتات مطابقة داخل الملف.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="font-medium text-slate-900">الشيتات المتجاهلة</h2>
              <div className="mt-4 space-y-3">
                {preview.ignoredSheets.length > 0 ? (
                  preview.ignoredSheets.map((sheetName) => (
                    <div
                      key={sheetName}
                      className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700"
                    >
                      {sheetName}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">
                    لا توجد شيتات متجاهلة.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="font-medium text-slate-900">أخطاء التحليل</h2>
            <div className="mt-4 space-y-3">
              {preview.errors.length > 0 ? (
                preview.errors.map((errorMessage, index) => (
                  <div
                    key={`${errorMessage}-${index}`}
                    className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
                  >
                    {errorMessage}
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">لا توجد أخطاء في التحليل.</p>
              )}
            </div>
          </div>

          <div className="flex justify-start">
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={!canConfirmImport}
              className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isImporting ? 'جاري الاستيراد...' : 'تأكيد الاستيراد'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
