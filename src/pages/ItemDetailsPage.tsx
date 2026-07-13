import { useParams } from 'react-router-dom'
import { categoryConfig, type CategoryDefinition } from '../config/categoryConfig'
import { ItemDetailsOverview } from '../features/item-details/components/ItemDetailsOverview'
import { ItemMovementsSection } from '../features/item-details/components/ItemMovementsSection'
import { useItemDetailsPage } from '../features/item-details/hooks/useItemDetailsPage'
import { isCategoryKey } from '../features/item-details/itemDetailsUtils'
import { EditItemModal } from '../features/item-edit/EditItemModal'
import { InventoryOperationModal } from '../features/inventory-operations/InventoryOperationModal'
import type { ItemDetails } from '../services/itemsService'

export function ItemDetailsPage() {
  const { categoryKey, itemId } = useParams()
  const category: CategoryDefinition | null =
    categoryKey && isCategoryKey(categoryKey)
      ? (categoryConfig[categoryKey] as CategoryDefinition)
      : null
  const page = useItemDetailsPage(category, itemId)

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
          />
          <ItemMovementsSection
            filter={page.movementDateFilter}
            movements={page.filteredMovements}
            totals={page.filteredMovementTotals}
            onFilterChange={page.setMovementDateFilter}
            onRefresh={() => void page.loadItemData()}
          />
        </>
      ) : null}

      {page.operationType && page.details ? (
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

      {page.isEditOpen && page.details ? (
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
