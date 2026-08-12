import { useState } from 'react'
import type { CategoryDefinition } from '../../../config/categoryConfig'
import type { InventoryOperationType } from '../../../services/operationsService'
import { InventoryOperationModal } from '../../inventory-operations/InventoryOperationModal'
import {
  createInitialOperationFormState,
  validateOperationForm,
  type OperationFormState,
} from '../../inventory-operations/operationForm'
import type { DynamicCategory, DynamicCategoryItem } from '../types'

export type DynamicOperationSubmission = {
  operationType: InventoryOperationType
  form: OperationFormState
}

export function DynamicItemOperationDialog({
  category,
  item,
  operationType,
  isSubmitting,
  error,
  onClose,
  onSubmit,
}: {
  category: DynamicCategory
  item: DynamicCategoryItem
  operationType: InventoryOperationType
  isSubmitting: boolean
  error: string | null
  onClose: () => void
  onSubmit: (submission: DynamicOperationSubmission) => Promise<void>
}) {
  const [form, setForm] = useState<OperationFormState>(() =>
    createInitialOperationFormState(item),
  )
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const categoryDefinition: CategoryDefinition = {
    label: category.name,
    table: 'inventory_items',
    route: '',
    columns: {
      project: 'المشروع',
      item_name: 'الصنف',
      stock_balance: 'الرصيد',
      min_quantity: 'الحد الأدنى',
    },
    attributeFields: [],
    searchableFields: ['item_name'],
    dateField: 'transaction_date',
    stockField: 'stock_balance',
    minQuantityField: 'min_quantity',
    itemNameField: 'item_name',
    operationsEnabled: true,
  }

  function updateField<TKey extends keyof OperationFormState>(
    field: TKey,
    value: OperationFormState[TKey],
  ) {
    setForm((current) => ({ ...current, [field]: value }))
    setFormErrors((current) => {
      if (!(field in current)) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  async function submit() {
    const validation = validateOperationForm({ details: item, form, operationType })
    setFormErrors(validation.errors)
    if (!validation.isValid) return
    await onSubmit({ operationType, form })
  }

  return (
    <>
      <InventoryOperationModal
        category={categoryDefinition}
        itemId={item.id}
        itemData={{ ...item, category_name: category.name }}
        operationType={operationType}
        form={form}
        formErrors={formErrors}
        isSubmitting={isSubmitting}
        onClose={onClose}
        onFieldChange={updateField}
        onSubmit={submit}
        operationTitle={operationType === 'adjust' ? 'تسوية الرصيد' : undefined}
        adjustQuantityLabel="الرصيد الفعلي الجديد"
      />
      {error ? (
        <div className="fixed bottom-5 left-1/2 z-[60] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-bold text-red-700 shadow-xl" role="alert">
          {error}
        </div>
      ) : null}
    </>
  )
}
