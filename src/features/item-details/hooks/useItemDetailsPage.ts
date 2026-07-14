import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CategoryDefinition } from '../../../config/categoryConfig'
import {
  createInitialOperationFormState,
  getNumericValue,
  type OperationFormState,
  validateOperationForm,
} from '../../inventory-operations/operationForm'
import {
  getItemDetails,
  getItemMovements,
  type ItemDetails,
  type ItemMovement,
} from '../../../services/itemsService'
import {
  applyInventoryOperation,
  type InventoryOperationType,
} from '../../../services/operationsService'
import {
  buildMonthlyMovementSummaries,
  getDateTimestamp,
  getInclusiveDateEndTimestamp,
} from '../itemDetailsUtils'
import type { ItemDetailsMessage, ItemMovementsDateFilterValue } from '../types'

export function useItemDetailsPage(
  category: CategoryDefinition | null,
  itemId: string | undefined,
) {
  const [details, setDetails] = useState<ItemDetails | null>(null)
  const [movements, setMovements] = useState<ItemMovement[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<ItemDetailsMessage>(null)
  const [operationType, setOperationType] = useState<InventoryOperationType | null>(null)
  const [form, setForm] = useState<OperationFormState>(createInitialOperationFormState(null))
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [movementDateFilter, setMovementDateFilter] =
    useState<ItemMovementsDateFilterValue>({ fromDate: '', toDate: '' })
  const [isEditOpen, setIsEditOpen] = useState(false)

  const loadItemData = useCallback(async () => {
    if (!category || !itemId) return
    setIsLoading(true)

    const [detailsResult, movementsResult] = await Promise.all([
      getItemDetails(category.table, itemId),
      getItemMovements(category.table, itemId),
    ])

    if (detailsResult.error || !detailsResult.data) {
      setDetails(null)
      setMovements([])
      setMessage({
        type: 'error',
        text: detailsResult.error || 'تعذر تحميل تفاصيل الصنف',
      })
      setIsLoading(false)
      return
    }

    setDetails(detailsResult.data)
    setMovements(movementsResult.error ? [] : movementsResult.data ?? [])
    setMessage(
      movementsResult.error ? { type: 'error', text: movementsResult.error } : null,
    )
    setForm((current) => ({
      ...current,
      projectName:
        detailsResult.data?.project_name ??
        detailsResult.data?.project ??
        current.projectName,
    }))
    setIsLoading(false)
  }, [category, itemId])

  useEffect(() => {
    if (!category || !itemId) {
      setDetails(null)
      setMovements([])
      setIsLoading(false)
      return
    }
    void loadItemData()
  }, [category, itemId, loadItemData])

  const monthlyMovementSummaries = useMemo(
    () => buildMonthlyMovementSummaries(movements),
    [movements],
  )

  const filteredMovements = useMemo(() => {
    const from = movementDateFilter.fromDate
      ? getDateTimestamp(movementDateFilter.fromDate)
      : null
    const to = movementDateFilter.toDate
      ? getInclusiveDateEndTimestamp(movementDateFilter.toDate)
      : null

    return movements.filter((movement) => {
      if (from === null && to === null) return true
      const timestamp = movement.operation_date
        ? getDateTimestamp(movement.operation_date)
        : null
      if (timestamp === null) return false
      return !(from !== null && timestamp < from) && !(to !== null && timestamp > to)
    })
  }, [movementDateFilter, movements])

  const filteredMovementTotals = useMemo(
    () =>
      filteredMovements.reduce(
        (totals, movement) => ({
          totalAdded: totals.totalAdded + getNumericValue(movement.added_quantity),
          totalIssued: totals.totalIssued + getNumericValue(movement.issued_quantity),
        }),
        { totalAdded: 0, totalIssued: 0 },
      ),
    [filteredMovements],
  )

  function openOperationModal(type: InventoryOperationType) {
    setOperationType(type)
    setForm(createInitialOperationFormState(details))
    setFormErrors({})
    setMessage(null)
  }

  function closeOperationModal() {
    setOperationType(null)
    setFormErrors({})
  }

  function updateFormField<TKey extends keyof OperationFormState>(
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

  async function submitOperation() {
    if (!category || !itemId || !details || !operationType) return

    setMessage(null)
    const tableName = String(details.table_name ?? '').trim()
    const operationItemId = details.item_id
    if (!tableName || operationItemId === null || operationItemId === undefined || String(operationItemId).trim() === '') {
      setMessage({
        type: 'error',
        text: 'بيانات الصنف غير مكتملة، برجاء تحديث الصفحة والمحاولة مرة أخرى',
      })
      return
    }
    const validation = validateOperationForm({ details, form, operationType })
    setFormErrors(validation.errors)
    if (!validation.isValid) return

    setIsSubmitting(true)
    try {
      const payload = {
        tableName,
        categoryName: details.category_name || category.label,
        itemId: operationItemId,
        itemName: details.item_name || `صنف ${itemId}`,
        operationType,
        quantity: Number(form.quantity),
        operationDate: form.operationDate,
        projectName:
          details.project_name ||
          details.project ||
          form.projectName.trim() ||
          undefined,
        supplierName: operationType === 'add' ? form.supplierName.trim() || undefined : undefined,
        purchaseOrderNumber:
          operationType === 'add' ? form.purchaseOrderNumber.trim() || undefined : undefined,
        issuedTo: operationType === 'issue' ? form.issuedTo.trim() || undefined : undefined,
        notes: form.notes.trim() || undefined,
      }
      await applyInventoryOperation(payload)
      await loadItemData()
      closeOperationModal()
      setMessage({
        type: 'success',
        text:
          operationType === 'add'
            ? 'تمت إضافة الكمية بنجاح'
            : operationType === 'issue'
              ? 'تم صرف الكمية بنجاح'
              : 'تم تحديث الرصيد بنجاح',
      })
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'تعذر تنفيذ العملية',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleEditSuccess(balanceChanged: boolean) {
    setIsEditOpen(false)
    await loadItemData()
    setMessage({
      type: 'success',
      text: balanceChanged
        ? 'تم تعديل بيانات الصنف بنجاح — تم تعديل الرصيد وتسجيل حركة جرد / تعديل رصيد'
        : 'تم تعديل بيانات الصنف بنجاح',
    })
  }

  return {
    details,
    filteredMovements,
    filteredMovementTotals,
    form,
    formErrors,
    isEditOpen,
    isLoading,
    isSubmitting,
    loadItemData,
    message,
    monthlyMovementSummaries,
    movementDateFilter,
    operationType,
    closeOperationModal,
    handleEditSuccess,
    openEditModal: () => {
      setIsEditOpen(true)
      setMessage(null)
    },
    openOperationModal,
    setIsEditOpen,
    setMovementDateFilter,
    submitOperation,
    updateFormField,
  }
}
