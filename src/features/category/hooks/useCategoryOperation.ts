import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { CategoryDefinition } from '../../../config/categoryConfig'
import {
  createInitialOperationFormState,
  type OperationFormState,
  validateOperationForm,
} from '../../inventory-operations/operationForm'
import { type CategorySummaryItem, type ItemDetails } from '../../../services/itemsService'
import {
  applyInventoryOperation,
  type InventoryOperationType,
} from '../../../services/operationsService'
import type { CategoryQuickAction, SelectedInventoryItem } from '../types'
import { invalidateItemData } from '../../inventory/inventoryCache'
import { getProjectedCachedInventoryItem } from '../../inventory/inventoryQueries'
import { inventoryKeys } from '../../inventory/inventoryQueryKeys'
import type { SetCategoryMessage } from './categoryHookTypes'
import { applyRawMaterialOperationWithProject } from '../../../services/rawMaterialsService'

const incompleteItemDataMessage =
  'بيانات الصنف غير مكتملة، برجاء تحديث الصفحة والمحاولة مرة أخرى'

export function useCategoryOperation({
  category,
  setMessage,
}: {
  category: CategoryDefinition | null
  setMessage: SetCategoryMessage
}) {
  const queryClient = useQueryClient()
  const [quickAction, setQuickAction] = useState<CategoryQuickAction>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [itemDetails, setItemDetails] = useState<ItemDetails | null>(null)
  const [selectedItem, setSelectedItem] = useState<SelectedInventoryItem | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [operationType, setOperationType] = useState<InventoryOperationType | null>(null)
  const [form, setForm] = useState<OperationFormState>(createInitialOperationFormState(null))
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const operationRequestInFlight = useRef(false)

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

  async function open(
    row: CategorySummaryItem,
    nextType: InventoryOperationType,
    initialOperationDate?: string,
  ) {
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
      categoryName: row.category_name,
    }

    setQuickAction(null)
    setMessage(null)
    const itemKey = inventoryKeys.item(item.tableName, String(item.itemId))
    let operationItem = queryClient.getQueryData<ItemDetails>(itemKey)
    if (!operationItem) {
      try {
        operationItem = await getProjectedCachedInventoryItem(
          item.tableName,
          String(item.itemId),
        ) ?? row as ItemDetails
      } catch {
        operationItem = row as ItemDetails
      }
    }

    queryClient.setQueryData(itemKey, operationItem)
    setItemDetails(operationItem)
    setSelectedItem(item)
    setSelectedItemId(String(item.itemId))
    setOperationType(nextType)
    setForm({
      ...createInitialOperationFormState(operationItem),
      ...(initialOperationDate
        ? { operationDate: initialOperationDate }
        : {}),
    })
    setFormErrors({})
  }

  async function submit() {
    if (
      !category ||
      !itemDetails ||
      !operationType ||
      operationRequestInFlight.current
    ) return

    setMessage(null)
    if (!selectedItem?.tableName || !selectedItem.itemId) {
      setMessage({ type: 'error', text: incompleteItemDataMessage })
      return
    }

    const validationResult = validateOperationForm({
      details: itemDetails,
      form,
      operationType,
      tableName: category.table,
    })
    if (!validationResult.isValid) {
      setFormErrors(validationResult.errors)
      return
    }

    operationRequestInFlight.current = true
    setIsSubmitting(true)
    try {
      const isOffline = !navigator.onLine
      const commonOperation = {
        tableName: selectedItem.tableName,
        categoryName: selectedItem.categoryName,
        itemId: selectedItem.itemId,
        itemName: selectedItem.itemName || '',
        operationType,
        quantity: Number(form.quantity),
        operationDate: form.operationDate,
        projectName:
          itemDetails.project_name ||
          itemDetails.project ||
          undefined,
        itemCode: category.table === 'raw_materials' ||
          category.table === 'screws' ||
          category.table === 'stock_screws'
          ? itemDetails.code_number?.trim() || null
          : null,
        supplierName: operationType === 'add' ? form.supplierName.trim() || undefined : undefined,
        supplierId: operationType === 'add' ? form.supplierId : null,
        purchaseOrderNumber: operationType === 'add'
          ? form.purchaseOrderNumber.trim() || undefined
          : undefined,
        issuedTo: operationType === 'issue' ? form.issuedTo.trim() || undefined : undefined,
        employeeId: operationType === 'issue' ? form.employeeId : null,
        employeeIds: operationType === 'issue' && form.recipientMode === 'multiple'
          ? form.employeeIds?.map((employee) => employee.id)
          : undefined,
        employeeSelections: operationType === 'issue' && form.recipientMode === 'multiple'
          ? form.employeeIds?.map((employee) => ({ id: employee.id, name: employee.name }))
          : undefined,
        requestId: form.requestId,
        notes: form.notes.trim() || undefined,
        localItemId: selectedItem.offline_state === 'local'
          ? String(selectedItem.itemId)
          : null,
      }

      if (category.table === 'raw_materials' && operationType !== 'adjust') {
        await applyRawMaterialOperationWithProject({
          itemId: String(selectedItem.itemId),
          operationType,
          quantity: Number(form.quantity),
          projectId: form.projectId ?? '',
          operationDate: form.operationDate,
          supplierId: operationType === 'add' ? form.supplierId : null,
          receivedBy: operationType === 'add' ? form.receivedBy : null,
          purchaseOrderNumber: operationType === 'add'
            ? form.purchaseOrderNumber
            : null,
          employeeId: operationType === 'issue' ? form.employeeId : null,
          employeeIds: operationType === 'issue' && form.recipientMode === 'multiple'
            ? form.employeeIds?.map((employee) => employee.id)
            : undefined,
          itemCode: itemDetails.code_number?.trim() || null,
          notes: form.notes,
          requestId: form.requestId ?? '',
        })
      } else {
        await applyInventoryOperation(commonOperation)
      }

      if (!isOffline) {
        await invalidateItemData(queryClient, selectedItem.tableName, String(selectedItem.itemId))
      }
      close()
      setMessage({
        type: 'success',
        text: isOffline
          ? operationType === 'add'
            ? 'تم تسجيل الإضافة محليًا وستتم مزامنتها عند عودة الإنترنت'
            : operationType === 'issue'
              ? 'تم تسجيل الصرف محليًا وستتم مزامنته عند عودة الإنترنت'
              : 'تم تسجيل الجرد محليًا وستتم مزامنته عند عودة الإنترنت'
          : operationType === 'add'
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
      operationRequestInFlight.current = false
      setIsSubmitting(false)
    }
  }

  return {
    quickAction,
    openQuickAction,
    closeQuickAction: () => setQuickAction(null),
    isPreparing: false,
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
