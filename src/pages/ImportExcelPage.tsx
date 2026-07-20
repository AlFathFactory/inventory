import { useRef, useState, type ChangeEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { TablePagination } from '../components/TablePagination'
import { usePagination } from '../hooks/usePagination'
import { ToastOnChange } from '../components/ToastProvider'
import {
  importInventoryRowsFromExcel,
  importNormalizedInventoryJson,
  insertRows,
  type InventoryImportResult,
  type InventoryRow,
} from '../services/inventoryService'
import {
  parseInventoryExcel,
  type ExcelImportPreview,
} from '../utils/excelParser'
import { parseNormalizedInventoryJson, type NormalizedInventoryImport } from '../utils/jsonImportParser'
import { parseCustomInventoryExcel, type CustomExcelPreview } from '../utils/customExcelParser'
import {
  importCustomInventoryExcel,
  prepareCustomInventoryPreview,
  type CustomImportProgress,
} from '../services/customExcelImportService'
import { inventoryKeys } from '../features/inventory/inventoryQueryKeys'

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
  parserType: string
  parsedRows: number
  parsedItems: number
  parsedMovements: number
  skippedRows: number
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
    parsing_errors: [...preview.errors, ...preview.warnings],
    status,
    imported_at: new Date().toISOString(),
  }
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
}

function formatImportResult(result: InventoryImportResult) {
  const inserted =
    result.insertedItemsCount +
    result.insertedMovementsCount +
    (result.insertedCustodyCount ?? 0)
  const updated =
    result.updatedItemsCount +
    (result.updatedMovementsCount ?? 0) +
    (result.updatedCustodyCount ?? 0)
  const skipped =
    (result.skippedItemsCount ?? 0) +
    (result.skippedMovementsCount ?? 0) +
    (result.skippedCustodyCount ?? 0)
  const parts = [
    `المضاف: ${formatNumber(inserted)}`,
    `المحدّث: ${formatNumber(updated)}`,
    `المتخطى: ${formatNumber(skipped)}`,
    `الحزم المكتملة: ${formatNumber(result.completedChunks ?? 0)}`,
  ]

  if (result.failedStage) {
    parts.push(
      `مرحلة الفشل: ${result.failedStage}${result.failedChunk ? `، الحزمة ${result.failedChunk}` : ''}`,
    )
  }
  if (result.errors.length > 0) {
    parts.push(`التفاصيل: ${result.errors.join(' | ')}`)
  }

  return parts.join(' — ')
}

function getSheetStatus(sheetName: string, errors: readonly string[]) {
  return errors.some((errorMessage) => errorMessage.includes(`"${sheetName}"`))
    ? 'error'
    : 'ready'
}

function buildPreviewTableRows(preview: ExcelImportPreview): PreviewTableRow[] {
  return preview.sheetDiagnoses.map((sheet) => ({
    key: `${sheet.originalSheetName}-${sheet.targetTable ?? 'ignored'}`,
    sheetName: sheet.originalSheetName,
    tableName: sheet.targetTable ?? 'غير معروف',
    parserType: sheet.parserType ?? 'غير مدعوم',
    parsedRows: preview.matchedSheets.find(
      (matched) => matched.sheetName === sheet.originalSheetName,
    )?.rowCount ?? 0,
    parsedItems: sheet.parsedItemsCount,
    parsedMovements: sheet.parsedMovementsCount,
    skippedRows: sheet.skippedRowsCount,
    status: sheet.matchedCategory
      ? getSheetStatus(sheet.originalSheetName, preview.errors) as PreviewTableRow['status']
      : 'ignored',
  }))
}

export function ImportExcelPage() {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedFileName, setSelectedFileName] = useState('')
  const [preview, setPreview] = useState<ExcelImportPreview | null>(null)
  const [jsonDocument, setJsonDocument] = useState<NormalizedInventoryImport | null>(null)
  const [customPreview, setCustomPreview] = useState<CustomExcelPreview | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<CustomImportProgress | null>(null)
  const [status, setStatus] = useState<ImportStatus | null>(null)

  const canConfirmImport = !isImporting && !customPreview?.errors.length && (customPreview !== null || jsonDocument !== null || Boolean(preview?.matchedSheets.length && preview.totalRows > 0))

  const previewTableRows = preview ? buildPreviewTableRows(preview) : []
  const previewPagination = usePagination(previewTableRows, { initialPageSize: 10 })
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
        {
          label: 'التحذيرات',
          value: preview.warnings.length,
          hint: preview.warnings.length > 0 ? 'تحتاج مراجعة قبل الحفظ' : 'لا توجد تحذيرات',
          valueClassName: 'text-[var(--app-warning)]',
        },
      ]
    : []

  function resetPreviewState() {
    setSelectedFileName('')
    setPreview(null)
    setJsonDocument(null)
    setCustomPreview(null)
    setStatus(null)
    setImportProgress(null)

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
    setImportProgress(null)
    setPreview(null)
    setJsonDocument(null)
    setCustomPreview(null)

    if (!file) {
      setSelectedFileName('')
      return
    }

    setSelectedFileName(file.name)
    setIsParsing(true)

    try {
      if (file.name.toLowerCase().endsWith('.json')) {
        setJsonDocument(await parseNormalizedInventoryJson(file))
      } else {
        const custom = await parseCustomInventoryExcel(file)
        if (custom) setCustomPreview(await prepareCustomInventoryPreview(custom, setImportProgress))
        else setPreview(await parseInventoryExcel(file))
      }
    } catch (error) {
      setStatus({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'حدث خطأ أثناء قراءة الملف.',
      })
    } finally {
      setIsParsing(false)
      event.target.value = ''
    }
  }

  async function handleConfirmImport() {
    if (!customPreview && !jsonDocument && (!preview || preview.matchedSheets.length === 0)) {
      return
    }

    setIsImporting(true)
    setStatus(null)
    setImportProgress(null)

    try {
    const importErrors: string[] = []
    let importResult
    try {
      importResult = customPreview
        ? await importCustomInventoryExcel(customPreview, setImportProgress)
        : jsonDocument
          ? await importNormalizedInventoryJson(jsonDocument)
          : await importInventoryRowsFromExcel(preview!.rowsByTable)
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'حدث خطأ أثناء الاستيراد.' })
      return
    }

    if (importResult.error) {
      importErrors.push(importResult.error)
    }

    importErrors.push(...(importResult.data?.errors ?? []))

    const importLogStatus = importErrors.length === 0 ? 'success' : 'failed'
    const importLogResult = customPreview ? { error: null } : await insertRows<ImportLogRow>('imports', [
      jsonDocument ? {
        file_name: selectedFileName,
        total_rows: jsonDocument.items.length + jsonDocument.movements.length,
        matched_sheets: [], ignored_sheets: [],
        rows_by_table: jsonDocument.items.reduce<Record<string, number>>((result, item) => {
          result[item.table_name] = (result[item.table_name] ?? 0) + 1
          return result
        }, {}),
        parsing_errors: jsonDocument.warnings,
        status: importLogStatus,
        imported_at: new Date().toISOString(),
      } : buildImportLogRow(preview!, importLogStatus),
    ])

    if (importLogResult.error) {
      importErrors.push(
        `فشل حفظ سجل الاستيراد في جدول imports: ${importLogResult.error}`,
      )
    }

    await queryClient.invalidateQueries({ queryKey: inventoryKeys.all })

    if (customPreview && importResult.data) {
      const customResult = importResult.data
      setStatus({
        type:
          customResult.completed && customResult.errors.length === 0
            ? 'success'
            : 'error',
        message: formatImportResult(customResult),
      })
    } else if (importErrors.length > 0) {
      setStatus({
        type: 'error',
        message: importErrors.join(' | '),
      })
    } else {
      setStatus({
        type: 'success',
        message: customPreview ? 'تم استيراد ملف المخزون المخصص بنجاح' : `تم استيراد ${importResult.data?.insertedMovementsCount ?? 0} حركة لعدد ${importResult.data?.processedItemCount ?? 0} صنف من الملف ${selectedFileName}.`,
      })
    }

    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'حدث خطأ أثناء الاستيراد.',
      })
    } finally {
      setIsImporting(false)
      setImportProgress(null)
    }
  }

  return (
    <section className="space-y-8">
      <div className="rounded-[24px] border border-dashed border-[var(--app-border-strong)] bg-[#fbfcff] px-6 py-10 text-center shadow-[var(--app-shadow)]">
        <label className="sr-only" htmlFor="excel-import-input">
          اختيار ملف JSON أو Excel
        </label>
        <input
          id="excel-import-input"
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.json"
          onChange={handleFileChange}
          className="hidden"
        />

        <h2 className="text-[28px] font-bold tracking-tight text-[var(--app-primary)]">
          اسحب ملف JSON أو Excel هنا أو اختر من جهازك
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

      <ToastOnChange message={status?.message ?? null} type={status?.type} />

      {jsonDocument ? (
        <div className="space-y-4 rounded-[18px] border border-[var(--app-border)] bg-[var(--app-panel)] p-6 shadow-[var(--app-shadow)]">
          <h3 className="text-lg font-bold text-[var(--app-primary)]">JSON inventory_import_v1 جاهز للاستيراد</h3>
          <p className="text-sm text-[var(--app-text-muted)]">
            {formatNumber(jsonDocument.items.length)} صنف، {formatNumber(jsonDocument.movements.length)} حركة، {formatNumber(jsonDocument.cylinder_records.length)} سجل أسطوانات، و{formatNumber(jsonDocument.custody_records.cutting_discs.length + jsonDocument.custody_records.long_welding_gloves.length)} سجل عهدة.
          </p>
          <div className="flex flex-wrap gap-4">
            <button type="button" onClick={handleConfirmImport} disabled={!canConfirmImport} className="inline-flex h-[42px] min-w-[220px] items-center justify-center rounded-[12px] bg-[var(--app-primary)] px-6 text-[14px] font-semibold text-white disabled:opacity-60">
              {isImporting ? 'جاري الاستيراد...' : 'تأكيد الاستيراد'}
            </button>
            <button type="button" onClick={resetPreviewState} disabled={isImporting} className="inline-flex h-[42px] min-w-[150px] items-center justify-center rounded-[12px] border border-[var(--app-border)] bg-white px-6 text-[14px] font-semibold text-slate-900">إلغاء</button>
          </div>
        </div>
      ) : null}

      {customPreview ? (
        <div className="space-y-5 rounded-[18px] border border-[var(--app-border)] bg-[var(--app-panel)] p-6 shadow-[var(--app-shadow)]">
          <h3 className="text-lg font-bold text-[var(--app-primary)]">ملف Excel المخصص جاهز للاستيراد</h3>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[
              ['أصناف موجودة سيتم تحديثها', customPreview.matching?.matched.length ?? 0],
              ['أصناف جديدة سيتم إضافتها', customPreview.matching?.newItems.length ?? 0],
              ['أصناف غير واضحة تحتاج مراجعة', customPreview.matching?.ambiguous.length ?? 0],
              ['صفوف مكررة داخل Excel', customPreview.duplicateItemsCount],
              ['حركات جديدة', customPreview.matching?.newMovementsCount ?? customPreview.movements.length],
              ['حركات مكررة سيتم تخطيها', customPreview.matching?.duplicateMovementsCount ?? 0],
              ['صواريخ القطع', customPreview.cuttingDiscs.length],
              ['جوانتي اللحام الطويل', customPreview.longWeldingGloves.length],
              ['التحذيرات', customPreview.warnings.length],
              ['الشيتات المتجاهلة', customPreview.ignoredSheets.length],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-[14px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4">
                <p className="text-sm text-[var(--app-text-muted)]">{label}</p>
                <p className="mt-1 text-2xl font-bold text-[var(--app-primary)]">{formatNumber(Number(value))}</p>
              </div>
            ))}
          </div>
          {customPreview.errors.map((message, index) => (
            <div key={`${message}-${index}`} className="rounded-[14px] border border-red-200 bg-red-50 p-3 text-sm text-red-700">{message}</div>
          ))}
          {customPreview.matching?.ambiguous.length ? (
            <div className="space-y-3 rounded-[14px] border border-red-200 bg-red-50 p-4">
              <h4 className="font-bold text-red-800">أصناف تحتاج مراجعة يدوية قبل الاستيراد</h4>
              {customPreview.matching.ambiguous.map(({ sourceItem, candidateIds }) => (
                <div key={sourceItem.client_key} className="rounded-[10px] border border-red-200 bg-white p-3 text-sm text-red-800">
                  <p className="font-semibold">{sourceItem.project_name} — {sourceItem.item_name}</p>
                  <p>الشيت: {sourceItem.source.sheet}، الصف: {sourceItem.source.row}، الجدول: {sourceItem.table_name}</p>
                  <p>المعرفات المرشحة: {candidateIds.join(', ') || 'غير متاحة'}</p>
                </div>
              ))}
            </div>
          ) : null}
          {customPreview.warnings.length > 0 ? (
            <div className="space-y-2">
              {customPreview.warnings.map((message, index) => (
                <div key={`${message}-${index}`} className="rounded-[14px] border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{message}</div>
              ))}
            </div>
          ) : null}
          {isImporting && importProgress ? (
            <div className="space-y-2 rounded-[14px] border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
              <div className="flex items-center justify-between gap-4">
                <span>{importProgress.label} {importProgress.chunk} / {importProgress.totalChunks}</span>
                <span>{formatNumber(importProgress.current)} / {formatNumber(importProgress.total)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-blue-100">
                <div className="h-full rounded-full bg-blue-600 transition-[width]" style={{ width: `${importProgress.total ? Math.round((importProgress.current / importProgress.total) * 100) : 0}%` }} />
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-4">
            <button type="button" onClick={handleConfirmImport} disabled={!canConfirmImport} className="inline-flex h-[42px] min-w-[220px] items-center justify-center rounded-[12px] bg-[var(--app-primary)] px-6 text-sm font-semibold text-white disabled:opacity-60">
              {isImporting ? 'جاري الاستيراد...' : 'تأكيد الاستيراد'}
            </button>
            <button type="button" onClick={resetPreviewState} disabled={isImporting} className="inline-flex h-[42px] min-w-[150px] items-center justify-center rounded-[12px] border border-[var(--app-border)] bg-white px-6 text-sm font-semibold">إلغاء</button>
          </div>
        </div>
      ) : null}

      {preview ? (
        <div className="space-y-8">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
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
                    <th className="px-4 py-3 text-[12px] font-semibold">نوع التحليل</th>
                    <th className="px-4 py-3 text-[12px] font-semibold">صفوف / أصناف / حركات</th>
                    <th className="px-4 py-3 text-[12px] font-semibold">صفوف متخطاة</th>
                    <th className="px-4 py-3 text-[12px] font-semibold">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {previewPagination.paginatedItems.map((row, index) => (
                    <tr
                      key={row.key}
                      className={
                        (previewPagination.pageStart + index) % 2 === 1
                          ? 'bg-white'
                          : 'bg-[#fcfcfd]'
                      }
                    >
                      <td className="px-4 py-3 text-[13px] text-slate-700">
                        {row.sheetName}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-slate-700">
                        {row.tableName}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-slate-700">
                        {row.parserType}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-slate-700">
                        {formatNumber(row.parsedRows)} / {formatNumber(row.parsedItems)} / {formatNumber(row.parsedMovements)}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-slate-700">
                        {formatNumber(row.skippedRows)}
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
            <TablePagination
              currentPage={previewPagination.currentPage}
              pageSize={previewPagination.pageSize}
              totalItems={previewPagination.totalItems}
              totalPages={previewPagination.totalPages}
              pageStart={previewPagination.pageStart}
              pageEnd={previewPagination.pageEnd}
              onPageChange={previewPagination.setCurrentPage}
              onPageSizeChange={previewPagination.setPageSize}
            />
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

          {preview.warnings.length > 0 ? (
            <div className="space-y-3">
              {preview.warnings.map((warningMessage, index) => (
                <div
                  key={`${warningMessage}-${index}`}
                  className="rounded-[16px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-[var(--app-shadow)]"
                >
                  {warningMessage}
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
