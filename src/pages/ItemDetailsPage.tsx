import { useQuery } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { categoryConfig, type CategoryDefinition } from '../config/categoryConfig'
import { ItemDetailsOverview } from '../features/item-details/components/ItemDetailsOverview'
import { ItemMovementsSection } from '../features/item-details/components/ItemMovementsSection'
import { useItemDetailsPage } from '../features/item-details/hooks/useItemDetailsPage'
import { isCategoryKey } from '../features/item-details/itemDetailsUtils'
import { EditItemModal } from '../features/item-edit/EditItemModal'
import { InventoryOperationModal } from '../features/inventory-operations/InventoryOperationModal'
import {
  isCustodyTable,
  type CustodyTableName,
  type ItemDetails,
} from '../services/itemsService'
import { custodyItemQueryOptions } from '../features/inventory/inventoryQueries'

function displayValue(value: string | number | null | undefined) {
  return value === null || value === undefined || value === '' ? '—' : String(value)
}

function CustodyDetailsView({
  tableName,
  itemId,
  backTo,
}: {
  tableName: CustodyTableName
  itemId: string
  backTo?: string
}) {
  const { data: record, error, isPending: isLoading } = useQuery(
    custodyItemQueryOptions(tableName, itemId),
  )

  if (isLoading) return <div className="rounded-[28px] border border-[var(--app-border)] bg-white p-10 text-center text-sm text-slate-500">جاري تحميل سجل العهدة...</div>
  if (error || !record) return <div className="rounded-[28px] border border-red-200 bg-red-50 p-10 text-center text-sm text-red-600">{error instanceof Error ? error.message : 'سجل العهدة غير موجود'}</div>

  const fields = tableName === 'cutting_discs'
    ? [['كود الصنف', record.internal_code], ['الكود', record.code], ['النوع', record.type_name], ['المستلم', record.received_by], ['تاريخ الاستلام', record.received_date], ['تاريخ التكهين', record.scrapped_date], ['المصدر', record.source_sheet]]
    : [['كود الصنف', record.internal_code], ['النوع', record.type_name], ['المستلم', record.received_by], ['تاريخ الاستلام', record.received_date], ['المصدر', record.source_sheet]]

  return (
    <section dir="rtl" className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-slate-900">تفاصيل سجل العهدة</h1><p className="mt-1 text-sm text-slate-500">{displayValue(record.type_name)}</p></div>
        <Link to={backTo ?? `/category/${tableName}`} className="rounded-xl border border-[var(--app-border)] bg-white px-4 py-2 text-sm font-semibold text-slate-700">{backTo ? 'العودة للوحة التحكم' : 'العودة للقسم'}</Link>
      </div>
      <div className="grid gap-4 rounded-[28px] border border-[var(--app-border)] bg-white p-6 shadow-[var(--app-shadow)] sm:grid-cols-2 lg:grid-cols-3">
        {fields.map(([label, value]) => <div key={String(label)} className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-2 font-semibold text-slate-900">{displayValue(value)}</p></div>)}
      </div>
    </section>
  )
}

export function ItemDetailsPage() {
  const { categoryKey, itemId } = useParams()
  const [searchParams] = useSearchParams()
  const isDashboardView = searchParams.get('source') === 'dashboard'
  const category: CategoryDefinition | null =
    categoryKey && isCategoryKey(categoryKey)
      ? (categoryConfig[categoryKey] as CategoryDefinition)
      : null
  const stockCategory = category && !isCustodyTable(category.table) ? category : null
  const page = useItemDetailsPage(stockCategory, itemId)

  if (category && itemId && isCustodyTable(category.table)) {
    return <CustodyDetailsView tableName={category.table} itemId={itemId} backTo={isDashboardView ? '/' : undefined} />
  }

  if (!category || !itemId) {
    return (
      <section className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel)] px-6 py-8 shadow-[var(--app-shadow)]">
        <h1 className="text-2xl font-semibold text-slate-900">الصنف غير موجود</h1>
      </section>
    )
  }

  return (
    <section dir="rtl" className="space-y-6">
      {page.message ? (
        <div className={`rounded-[24px] border px-5 py-4 text-sm ${page.message.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {page.message.text}
        </div>
      ) : null}

      {page.isLoading ? (
        <div className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel)] px-4 py-10 text-center text-sm text-slate-500 shadow-[var(--app-shadow)]">
          جاري تحميل بيانات الصنف...
        </div>
      ) : null}

      {!page.isLoading && !page.details ? (
        <div className="rounded-[28px] border border-red-200 bg-red-50 px-4 py-10 text-center text-sm text-red-600">
          تعذر العثور على بيانات هذا الصنف
        </div>
      ) : null}

      {!page.isLoading && page.details ? (
        <>
          <ItemDetailsOverview
            category={category}
            details={page.details}
            itemId={itemId}
            monthlySummaries={page.monthlyMovementSummaries}
            onEdit={page.openEditModal}
            onOperation={page.openOperationModal}
            isReadOnly={isDashboardView}
            backTo={isDashboardView ? '/' : undefined}
          />
          <ItemMovementsSection
            category={category}
            internalCode={page.details.internal_code}
            itemCode={page.details.code_number}
            filter={page.movementDateFilter}
            movements={page.filteredMovements}
            totals={page.filteredMovementTotals}
            onFilterChange={page.setMovementDateFilter}
            onRefresh={() => void page.loadItemData()}
          />
        </>
      ) : null}

      {!isDashboardView && page.operationType && page.details ? (
        <InventoryOperationModal
          category={category}
          itemId={itemId}
          itemData={page.details as Record<string, unknown> & ItemDetails}
          operationType={page.operationType}
          form={page.form}
          formErrors={page.formErrors}
          isSubmitting={page.isSubmitting}
          onClose={page.closeOperationModal}
          onFieldChange={page.updateFormField}
          onSubmit={page.submitOperation}
        />
      ) : null}

      {!isDashboardView && page.isEditOpen && page.details ? (
        <EditItemModal
          category={category}
          itemId={itemId}
          itemData={page.details}
          onClose={() => page.setIsEditOpen(false)}
          onSuccess={page.handleEditSuccess}
        />
      ) : null}
    </section>
  )
}
