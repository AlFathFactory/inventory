import { useMemo } from 'react'
import type { CategoryDefinition } from '../../../config/categoryConfig'
import type { DataTableColumn } from '../../../components/DataTable'
import { isCustodyTable, type CategorySummaryItem } from '../../../services/itemsService'
import type { InventoryOperationType } from '../../../services/operationsService'
import { getStockStatusClass } from '../../../utils/statusUtils'
import { CategoryOperationButton } from './CategoryOperationButton'

type CategoryTableColumnsProps = {
  category: CategoryDefinition | null
  onEdit: (row: CategorySummaryItem) => void
  onDelete: (row: CategorySummaryItem) => void
  onArchive: (row: CategorySummaryItem) => void
  onOperation: (
    row: CategorySummaryItem,
    operationType: InventoryOperationType,
  ) => void
}

function getDisplayValue(value: string | number | null | undefined) {
  return value === null || value === undefined || value === '' ? '—' : String(value)
}

function getStatusBadgeClass(status: string | null) {
  switch (status) {
    case 'آمن':
      return getStockStatusClass('safe')
    case 'قليل':
      return getStockStatusClass('low')
    case 'منتهي':
      return getStockStatusClass('out')
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

function stopPropagation(action: () => void) {
  return (event: React.MouseEvent) => {
    event.stopPropagation()
    action()
  }
}

function renderInternalCode(value: string | null | undefined, offlineState?: string | number | null) {
  return (
    <span className="flex flex-col items-start gap-1">
      <span dir="ltr" onClick={(event) => event.stopPropagation()} className="inline-block select-all font-mono font-semibold text-slate-700">
        {getDisplayValue(value)}
      </span>
      {offlineState ? (
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${offlineState === 'failed' ? 'bg-red-50 text-red-700' : offlineState === 'local' ? 'bg-sky-50 text-sky-700' : 'bg-amber-50 text-amber-700'}`}>
          {offlineState === 'failed' ? 'فشل الرفع' : offlineState === 'local' ? 'صنف محفوظ محليًا' : offlineState === 'edited' ? 'تم تعديله محليًا' : 'في انتظار المزامنة'}
        </span>
      ) : null}
    </span>
  )
}

export function useCategoryTableColumns(props: CategoryTableColumnsProps) {
  const { category, onEdit, onDelete, onArchive, onOperation } = props

  return useMemo(
    () => category ? buildCategoryTableColumns({
      category,
      onEdit,
      onDelete,
      onArchive,
      onOperation,
    }) : [],
    [category, onArchive, onDelete, onEdit, onOperation],
  )
}

function buildCategoryTableColumns({
  category,
  onEdit,
  onDelete,
  onArchive,
  onOperation,
}: CategoryTableColumnsProps & { category: CategoryDefinition }): DataTableColumn<CategorySummaryItem>[] {
  if (isCustodyTable(category.table)) {
    const custodyColumns: DataTableColumn<CategorySummaryItem>[] = [
      {
        id: 'internal_code',
        header: 'كود الصنف',
        renderCell: (row) => renderInternalCode(row.internal_code, row.offline_state),
      },
      ...(category.table === 'cutting_discs' ? [{
        id: 'code',
        header: 'الكود',
        renderCell: (row: CategorySummaryItem) => getDisplayValue(row.code),
      }] : []),
      {
        id: 'type_name',
        header: 'النوع',
        renderCell: (row) => getDisplayValue(row.type_name),
      },
      {
        id: 'supplier_name',
        header: 'اسم المورد',
        headerClassName: 'hidden px-4 py-3 text-slate-700 lg:table-cell',
        cellClassName: 'hidden whitespace-nowrap px-4 py-3 text-slate-600 lg:table-cell',
        renderCell: (row) => getDisplayValue(row.supplier_name),
      },
      {
        id: 'received_by',
        header: 'المستلم',
        renderCell: (row) => getDisplayValue(row.received_by),
      },
      {
        id: 'received_date',
        header: 'تاريخ الاستلام',
        renderCell: (row) => getDisplayValue(row.received_date),
      },
      ...(category.table === 'cutting_discs' ? [{
        id: 'scrapped_date',
        header: 'تاريخ التكهين',
        renderCell: (row: CategorySummaryItem) => getDisplayValue(row.scrapped_date),
      }] : []),
      ...(category.table === 'long_welding_gloves' || category.table === 'cutting_discs' ? [{
        id: 'notes',
        header: 'ملاحظات',
        renderCell: (row: CategorySummaryItem) => getDisplayValue(row.notes),
      }] : [{
        id: 'source_sheet',
        header: 'المصدر',
        renderCell: (row: CategorySummaryItem) => getDisplayValue(row.source_sheet),
      }]),
      ...(category.table === 'long_welding_gloves' ? [{
        id: 'actions',
        header: 'إجراءات',
        renderCell: (row: CategorySummaryItem) => (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={stopPropagation(() => onEdit(row))}
              className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-100"
            >
              تعديل
            </button>
            <button
              type="button"
              onClick={stopPropagation(() => onArchive(row))}
              className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
            >
              أرشفة
            </button>
            <button
              type="button"
              onClick={stopPropagation(() => onDelete(row))}
              className="rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700"
            >
              حذف
            </button>
          </div>
        ),
      }] : category.table === 'cutting_discs' ? [{
        id: 'actions',
        header: 'إجراءات',
        renderCell: (row: CategorySummaryItem) => (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={stopPropagation(() => onEdit(row))}
              className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-100"
            >
              تعديل
            </button>
            <button
              type="button"
              onClick={stopPropagation(() => onDelete(row))}
              className="rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700"
            >
              حذف
            </button>
          </div>
        ),
      }] : []),
    ]

    return custodyColumns.map((column) => ({
      headerClassName: 'px-4 py-3 text-slate-700',
      cellClassName: 'whitespace-nowrap px-4 py-3 text-slate-600',
      ...column,
    }))
  }

  return [
    {
      id: 'internal_code',
      header: 'كود الصنف',
      cellClassName: 'whitespace-nowrap px-4 py-3',
      renderCell: (row: CategorySummaryItem) => renderInternalCode(row.internal_code, row.offline_state),
    },
    {
      id: 'item_name',
      header: category.table === 'cylinders' ? 'نوع الاسطوانة' : 'صنف',
      cellClassName: 'px-4 py-3 font-semibold text-slate-800',
      renderCell: (row: CategorySummaryItem) => getDisplayValue(
        category.table === 'cylinders' ? row.type_name ?? row.item_name : row.item_name,
      ),
    },
    {
      id: 'project_name',
      header: category.table === 'cylinders' ? 'المشروع' : 'مشروع',
      cellClassName: 'whitespace-nowrap px-4 py-3 text-slate-600',
      renderCell: (row: CategorySummaryItem) => getDisplayValue(row.project_name ?? row.project),
    },
    {
      id: 'supplier_name',
      header: 'اسم المورد',
      headerClassName: 'hidden px-4 py-3 text-slate-700 lg:table-cell',
      cellClassName: 'hidden whitespace-nowrap px-4 py-3 text-slate-600 lg:table-cell',
      renderCell: (row: CategorySummaryItem) => getDisplayValue(row.supplier_name),
    },
    ...(category.table === 'screws' || category.table === 'stock_screws' ? [
      {
        id: 'din',
        header: 'DIN',
        renderCell: (row: CategorySummaryItem) => getDisplayValue(row.din),
      },
      {
        id: 'code_number',
        header: 'رقم الكود',
        renderCell: (row: CategorySummaryItem) => getDisplayValue(row.code_number),
      },
    ] : []),
    {
      id: category.table === 'cylinders' ? 'gas_balance' : 'stock_balance',
      header: category.table === 'cylinders' ? 'رصيد الغاز' : 'رصيد مخزني',
      cellClassName: 'whitespace-nowrap px-4 py-3 text-slate-600',
      renderCell: (row: CategorySummaryItem) => getDisplayValue(
        category.table === 'cylinders' ? row.gas_balance ?? row.stock_balance : row.stock_balance,
      ),
    },
    ...(category.table === 'cylinders' ? [
      {
        id: 'empty_count',
        header: 'فارغ',
        renderCell: (row: CategorySummaryItem) => getDisplayValue(row.empty_count),
      },
      {
        id: 'full_count',
        header: 'ملي',
        renderCell: (row: CategorySummaryItem) => getDisplayValue(row.full_count),
      },
    ] : []),
    {
      id: 'min_quantity',
      header: 'الحد الأدنى',
      cellClassName: 'whitespace-nowrap px-4 py-3 text-slate-600',
      renderCell: (row: CategorySummaryItem) => getDisplayValue(row.min_quantity),
    },
    {
      id: 'status',
      header: 'الحالة',
      cellClassName: 'align-top px-4 py-3',
      renderCell: (row: CategorySummaryItem) => (
        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getStatusBadgeClass(row.status)}`}>
          {row.status || 'غير محدد'}
        </span>
      ),
    },
    ...(category.table === 'raw_materials' ? [
      { id: 'code_number', header: 'رقم الكود', renderCell: (row: CategorySummaryItem) => getDisplayValue(row.code_number) },
      { id: 'weight', header: 'وزن', renderCell: (row: CategorySummaryItem) => getDisplayValue(row.weight) },
      { id: 'length', header: 'LENGTH', renderCell: (row: CategorySummaryItem) => getDisplayValue(row.length) },
      { id: 'width', header: 'WIDTH', renderCell: (row: CategorySummaryItem) => getDisplayValue(row.width) },
      { id: 'th', header: 'TH', renderCell: (row: CategorySummaryItem) => getDisplayValue(row.th) },
    ] : []),
    ...(category.table === 'paints' ? [{
      id: 'expire_date',
      header: 'تاريخ الانتهاء',
      renderCell: (row: CategorySummaryItem) => getDisplayValue(row.expire_date),
    }] : []),
    {
      id: 'actions',
      header: 'الإجراءات',
      headerClassName: 'px-4 py-3 text-center text-slate-700',
      cellClassName: 'px-4 py-3',
      renderCell: (row: CategorySummaryItem) => (
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={stopPropagation(() => onEdit(row))}
            className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 transition hover:bg-violet-100"
          >
            تعديل الصنف
          </button>
          {category.operationsEnabled ? (
            <>
              <CategoryOperationButton label="صرف" color="orange" onClick={() => onOperation(row, 'issue')} />
              <CategoryOperationButton label="إضافة" color="emerald" onClick={() => onOperation(row, 'add')} />
              <CategoryOperationButton label="جرد" color="blue" onClick={() => onOperation(row, 'adjust')} />
            </>
          ) : null}
          <button
            type="button"
            onClick={stopPropagation(() => onDelete(row))}
            className="rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-red-700"
          >
            حذف
          </button>
        </div>
      ),
    },
  ].map((column) => ({
    headerClassName: 'px-4 py-3 text-slate-700',
    cellClassName: 'whitespace-nowrap px-4 py-3 text-slate-600',
    ...column,
  })) as DataTableColumn<CategorySummaryItem>[]
}
