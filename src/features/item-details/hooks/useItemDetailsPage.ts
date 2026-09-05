import { useCallback, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { CategoryDefinition } from '../../../config/categoryConfig'
import {
  createInitialOperationFormState,
  getNumericValue,
  type OperationFormState,
  validateOperationForm,
} from '../../inventory-operations/operationForm'
import type { ItemMovement } from '../../../services/itemsService'
import type { ItemDetails } from '../../../services/itemsService'
import {
  applyInventoryOperation,
  type InventoryOperationType,
} from '../../../services/operationsService'
import { invalidateItemData } from '../../inventory/inventoryCache'
import {
  itemQueryOptions,
  movementsQueryOptions,
} from '../../inventory/inventoryQueries'
import {
  buildMonthlyMovementSummaries,
  getDateTimestamp,
  getInclusiveDateEndTimestamp,
  getLatestMovementId,
} from '../itemDetailsUtils'
import type { ItemDetailsMessage, ItemMovementsDateFilterValue } from '../types'
import { inventoryKeys } from '../../inventory/inventoryQueryKeys'
import { deleteInventoryOperation } from '../../../services/operationsService'
import { returnInventoryItem } from '../../../services/operationsService'
import { useAccess } from '../../access/AccessContext'
import type { ReturnMovementForm } from '../components/ReturnMovementDialog'
import {
  getIssueEmployeeAllocations,
  type IssueEmployeeAllocation,
} from '../../../services/partiesService'
import {
  applyRawMaterialOperationWithProject,
} from '../../../services/rawMaterialsService'

const emptyMovements: ItemMovement[] = []

export function useItemDetailsPage(
  category: CategoryDefinition | null,
  itemId: string | undefined,
) {
  const queryClient = useQueryClient()
  const { user } = useAccess()
  const tableName = category?.table ?? ''
  const normalizedItemId = itemId ?? ''
  const itemQuery = useQuery({
    ...itemQueryOptions(tableName, normalizedItemId),
    enabled: Boolean(tableName && normalizedItemId),
  })
  const movementsQuery = useQuery({
    ...movementsQueryOptions(tableName, normalizedItemId),
    enabled: Boolean(tableName && normalizedItemId),
  })
  const details = itemQuery.data ?? null
  const movements = movementsQuery.data ?? emptyMovements
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<ItemDetailsMessage>(null)
  const [operationType, setOperationType] = useState<InventoryOperationType | null>(null)
  const [form, setForm] = useState<OperationFormState>(createInitialOperationFormState(null))
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const operationRequestInFlight = useRef(false)
  const [movementDateFilter, setMovementDateFilter] =
    useState<ItemMovementsDateFilterValue>({ fromDate: '', toDate: '' })
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [movementToDelete, setMovementToDelete] = useState<ItemMovement | null>(null)
  const [deletingMovementId, setDeletingMovementId] = useState<string | null>(null)
  const deleteRequestInFlight = useRef(false)
  const [movementToReturn, setMovementToReturn] = useState<ItemMovement | null>(null)
  const [returnAllocations, setReturnAllocations] = useState<IssueEmployeeAllocation[]>([])
  const [returningMovementId, setReturningMovementId] = useState<string | null>(null)
  const returnRequestInFlight = useRef(false)

  const loadItemData = useCallback(async () => {
    if (!category || !itemId) return
    await Promise.all([itemQuery.refetch(), movementsQuery.refetch()])
  }, [category, itemId, itemQuery, movementsQuery])

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
      if (from !== null || to !== null) {
        const timestamp = movement.operation_date
          ? getDateTimestamp(movement.operation_date)
          : null
        if (timestamp === null) return false
        if (from !== null && timestamp < from) return false
        if (to !== null && timestamp > to) return false
      }

      return true
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
    if (
      !category ||
      !itemId ||
      !details ||
      !operationType ||
      operationRequestInFlight.current
    ) return

    setMessage(null)
    const operationTableName = String(details.table_name ?? '').trim()
    const operationItemId = details.item_id
    if (
      !operationTableName ||
      operationItemId === null ||
      operationItemId === undefined ||
      String(operationItemId).trim() === ''
    ) {
      setMessage({ type: 'error', text: 'بيانات الصنف غير مكتملة، برجاء تحديث الصفحة والمحاولة مرة أخرى' })
      return
    }

    const validation = validateOperationForm({
      details,
      form,
      operationType,
      tableName: category.table,
    })
    setFormErrors(validation.errors)
    if (!validation.isValid) return

    operationRequestInFlight.current = true
    setIsSubmitting(true)
    try {
      const isOffline = !navigator.onLine
      const commonOperation = {
        tableName: operationTableName,
        categoryName: details.category_name || category.label,
        itemId: operationItemId,
        itemName: details.item_name || `صنف ${itemId}`,
        operationType,
        quantity: Number(form.quantity),
        operationDate: form.operationDate,
        projectName:
          details.project_name ||
          details.project ||
          undefined,
        itemCode:
          category.table === 'raw_materials' ||
          category.table === 'screws' ||
          category.table === 'stock_screws'
            ? details.code_number?.trim() || null
            : null,
        supplierName:
          operationType === 'add' ? form.supplierName.trim() || undefined : undefined,
        supplierId: operationType === 'add' ? form.supplierId : null,
        purchaseOrderNumber:
          operationType === 'add'
            ? form.purchaseOrderNumber.trim() || undefined
            : undefined,
        issuedTo:
          operationType === 'issue' ? form.issuedTo.trim() || undefined : undefined,
        employeeId: operationType === 'issue' ? form.employeeId : null,
        employeeIds: operationType === 'issue' && form.recipientMode === 'multiple'
          ? form.employeeIds?.map((employee) => employee.id)
          : undefined,
        employeeSelections: operationType === 'issue' && form.recipientMode === 'multiple'
          ? form.employeeIds?.map((employee) => ({ id: employee.id, name: employee.name }))
          : undefined,
        requestId: form.requestId,
        notes: form.notes.trim() || undefined,
        localItemId: details.offline_state === 'local' ? String(operationItemId) : null,
      }

      if (category.table === 'raw_materials' && operationType !== 'adjust') {
        await applyRawMaterialOperationWithProject({
          itemId: String(operationItemId),
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
          itemCode: details.code_number?.trim() || null,
          notes: form.notes,
          createdBy: user?.name || 'user',
          requestId: form.requestId ?? '',
        })
      } else {
        await applyInventoryOperation(commonOperation)
      }
      if (isOffline) {
        const currentBalance = Number(details.stock_balance ?? details.gas_balance ?? 0)
        const quantity = Number(form.quantity)
        const balance = operationType === 'add'
          ? currentBalance + quantity
          : operationType === 'issue' ? currentBalance - quantity : quantity
        queryClient.setQueryData<ItemDetails>(inventoryKeys.item(category.table, itemId), {
          ...details, stock_balance: balance,
          ...(category.table === 'cylinders' ? { gas_balance: balance } : {}),
          offline_state: details.offline_state === 'local' ? 'local' : 'pending',
        })
      } else {
        await invalidateItemData(queryClient, category.table, itemId)
      }
      closeOperationModal()
      setMessage({
        type: 'success',
        text:
          isOffline
            ? 'تم حفظ العملية محليًا وستتم مزامنتها عند عودة الإنترنت'
            : operationType === 'add'
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
      operationRequestInFlight.current = false
      setIsSubmitting(false)
    }
  }

  async function handleEditSuccess(balanceChanged: boolean, wasOffline = false) {
    if (!category || !itemId) return
    setIsEditOpen(false)
    await invalidateItemData(queryClient, category.table, itemId)
    setMessage({
      type: 'success',
      text: wasOffline
        ? 'تم حفظ التعديل محليًا وستتم مزامنته عند عودة الإنترنت'
        : balanceChanged
        ? 'تم تعديل بيانات الصنف والرصيد وتسجيل حركة الجرد بنجاح'
        : 'تم تعديل بيانات الصنف بنجاح',
    })
  }

  async function confirmDeleteMovement() {
    if (
      !category ||
      !itemId ||
      !movementToDelete ||
      deletingMovementId !== null ||
      deleteRequestInFlight.current
    ) return

    const operationId = String(movementToDelete.id)
    deleteRequestInFlight.current = true
    setDeletingMovementId(operationId)
    setMessage(null)
    try {
      await deleteInventoryOperation(operationId, user?.name || 'user')
      setMovementToDelete(null)
      await invalidateItemData(queryClient, category.table, itemId)
      setMessage({ type: 'success', text: 'تم حذف حركة المخزون واسترجاع الرصيد السابق بنجاح.' })
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'تعذر حذف حركة المخزون',
      })
    } finally {
      deleteRequestInFlight.current = false
      setDeletingMovementId(null)
    }
  }

  async function submitReturnMovement(returnForm: ReturnMovementForm) {
    if (
      !category ||
      !itemId ||
      !movementToReturn ||
      movementToReturn.operation_type !== 'issue' ||
      returningMovementId !== null ||
      returnRequestInFlight.current
    ) return

    const operationId = String(movementToReturn.id)
    returnRequestInFlight.current = true
    setReturningMovementId(operationId)
    setMessage(null)
    try {
      await returnInventoryItem({
        issueOperationId: operationId,
        quantity: Number(returnForm.quantity),
        operationDate: returnForm.operationDate,
        receivedBy: returnForm.receivedBy,
        notes: returnForm.notes,
        createdBy: user?.name || 'user',
        requestId: crypto.randomUUID(),
        employeeId: returnForm.employeeId || null,
      })
      setMovementToReturn(null)
      await invalidateItemData(queryClient, category.table, itemId)
      setMessage({
        type: 'success',
        text: 'تم إرجاع الكمية إلى المخزون بنجاح',
      })
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'تعذر تسجيل المرتجع',
      })
    } finally {
      returnRequestInFlight.current = false
      setReturningMovementId(null)
    }
  }

  const queryMessage: ItemDetailsMessage =
    itemQuery.error instanceof Error
      ? { type: 'error', text: itemQuery.error.message }
      : movementsQuery.error instanceof Error
        ? { type: 'error', text: movementsQuery.error.message }
        : null

  return {
    details,
    filteredMovements,
    filteredMovementTotals,
    form,
    formErrors,
    isEditOpen,
    isLoading: itemQuery.isPending || movementsQuery.isPending,
    isSubmitting,
    deletingMovementId,
    latestMovementId: getLatestMovementId(movements),
    movementToDelete,
    movementToReturn,
    returnAllocations,
    returningMovementId,
    loadItemData,
    message: message ?? queryMessage,
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
    openDeleteMovementDialog: (movement: ItemMovement) => {
      if (deletingMovementId !== null) return
      setMovementToDelete(movement)
      setMessage(null)
    },
    closeDeleteMovementDialog: () => {
      if (deletingMovementId === null) setMovementToDelete(null)
    },
    confirmDeleteMovement,
    openReturnMovementDialog: async (movement: ItemMovement) => {
      if (
        movement.operation_type !== 'issue' ||
        movement.remainingReturnableQuantity <= 0 ||
        returningMovementId !== null
      ) return
      setMessage(null)
      try {
        const allocations = await getIssueEmployeeAllocations(String(movement.id))
        setReturnAllocations(allocations)
        setMovementToReturn(movement)
      } catch (error) {
        setMessage({
          type: 'error',
          text: error instanceof Error ? error.message : 'تعذر تحميل مستلمي حركة الصرف',
        })
      }
    },
    closeReturnMovementDialog: () => {
      if (returningMovementId === null) {
        setMovementToReturn(null)
        setReturnAllocations([])
      }
    },
    submitReturnMovement,
    updateFormField,
  }
}
