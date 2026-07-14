import { useState } from 'react'
import type { CategoryDefinition } from '../../../config/categoryConfig'
import {
  createInitialOperationFormState,
  type OperationFormState,
  validateOperationForm,
} from '../../inventory-operations/operationForm'
import { getItemDetails, type CategorySummaryItem, type ItemDetails } from '../../../services/itemsService'
import {
  applyInventoryOperation,
  type InventoryOperationType,
} from '../../../services/operationsService'
import type { CategoryQuickAction, SelectedInventoryItem } from '../types'
import type { RefreshCategoryRows, SetCategoryMessage } from './categoryHookTypes'

const incompleteItemDataMessage =
  'بيانات الصنف غير مكتملة، برجاء تحديث الصفحة والمحاولة مرة أخرى'

export function useCategoryOperation({
  category,
  refreshRows,
  setMessage,
}: {
  category: CategoryDefinition | null
  refreshRows: RefreshCategoryRows
  setMessage: SetCategoryMessage
}) {
  const [quickAction, setQuickAction] = useState<CategoryQuickAction>(null)
  const [isPreparing, setIsPreparing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [itemDetails, setItemDetails] = useState<ItemDetails | null>(null)
  const [selectedItem, setSelectedItem] = useState<SelectedInventoryItem | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [operationType, setOperationType] = useState<InventoryOperationType | null>(null)
  const [form, setForm] = useState<OperationFormState>(createInitialOperationFormState(null))
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  function updateField<TKey extends keyof OperationFormState>(
    field: TKey,
    value: OperationFormState[TKey],
  ) {
    setForm((currentForm) => ({ ...currentForm, [field]: value }))
    setFormErrors((currentErrors) => {
      if (!(field in currentErrors)) return currentErrors
      const nextErrors = { ...currentErrors }
      delete nextErrors[field]
      return nextErrors
    })
  }

  function close() {
    setOperationType(null)
    setItemDetails(null)
    setSelectedItemId(null)
    setSelectedItem(null)
    setFormErrors({})
  }

  function openQuickAction(nextAction: Exclude<CategoryQuickAction, null>) {
    setQuickAction(nextAction)
    setMessage(null)
  }

  async function open(row: CategorySummaryItem, nextType: InventoryOperationType) {
    if (!category) return

    const itemId = row.item_id
    const tableName = String(row.table_name ?? '').trim()
    if (!tableName || itemId === null || itemId === undefined || String(itemId).trim() === '') {
      setMessage({ type: 'error', text: incompleteItemDataMessage })
      return
    }

    const item: SelectedInventoryItem = {
      ...row,
      id: itemId,
      itemId,
      tableName,
      itemName: row.item_name,
      projectName: row.project_name,
      categoryName: row.category_name,
    }

    setQuickAction(null)
    setIsPreparing(true)
    setMessage(null)
    const result = await getItemDetails(item.tableName, String(item.itemId))
    setIsPreparing(false)

    if (result.error || !result.data) {
      setMessage({ type: 'error', text: result.error || 'تعذر تحميل بيانات الصنف' })
      return
    }

    setItemDetails(result.data)
    setSelectedItem(item)
    setSelectedItemId(String(item.itemId))
    setOperationType(nextType)
    setForm(createInitialOperationFormState(result.data))
    setFormErrors({})
  }

  async function submit() {
    if (!category || !itemDetails || !operationType) return

    setMessage(null)
    if (!selectedItem?.tableName || !selectedItem.itemId) {
      setMessage({ type: 'error', text: incompleteItemDataMessage })
      return
    }

    const validationResult = validateOperationForm({ details: itemDetails, form, operationType })
    if (!validationResult.isValid) {
      setFormErrors(validationResult.errors)
      return
    }

    setIsSubmitting(true)
    try {
      await applyInventoryOperation({
        tableName: selectedItem.tableName,
        categoryName: selectedItem.categoryName,
        itemId: selectedItem.itemId,
        itemName: selectedItem.itemName || '',
        operationType,
        quantity: Number(form.quantity),
        operationDate: form.operationDate,
        projectName: selectedItem.projectName || undefined,
        supplierName: operationType === 'add' ? form.supplierName.trim() || undefined : undefined,
        purchaseOrderNumber: operationType === 'add'
          ? form.purchaseOrderNumber.trim() || undefined
          : undefined,
        issuedTo: operationType === 'issue' ? form.issuedTo.trim() || undefined : undefined,
        notes: form.notes.trim() || undefined,
      })

      await refreshRows()
      close()
      setMessage({
        type: 'success',
        text: operationType === 'add'
          ? 'تمت إضافة الكمية بنجاح'
          : operationType === 'issue'
            ? 'تم صرف الكمية بنجاح'
            : 'تم تحديث الرصيد بنجاح',
      })
    } catch (submitError) {
      setMessage({
        type: 'error',
        text: submitError instanceof Error ? submitError.message : 'تعذر تنفيذ العملية',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
    quickAction,
    openQuickAction,
    closeQuickAction: () => setQuickAction(null),
    isPreparing,
    isSubmitting,
    itemDetails,
    selectedItemId,
    operationType,
    form,
    formErrors,
    open,
    close,
    updateField,
    submit,
  }
}
