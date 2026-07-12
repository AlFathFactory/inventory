import type { InventoryOperationType } from '../../services/operationsService'

export type OperationFormState = {
  quantity: string
  operationDate: string
  projectName: string
  supplierName: string
  purchaseOrderNumber: string
  issuedTo: string
  notes: string
}

type ItemSnapshot = {
  project_name?: string | null
  stock_balance?: string | number | null
}

export function getTodayValue() {
  return new Date().toISOString().slice(0, 10)
}

export function getNumericValue(value: string | number | null | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsedValue = Number(value)
    return Number.isFinite(parsedValue) ? parsedValue : 0
  }

  return 0
}

export function getDisplayText(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return '—'
  }

  return String(value)
}

export function getOperationTypeLabel(operationType: string | null) {
  switch (operationType) {
    case 'add':
      return 'إضافة'
    case 'issue':
      return 'صرف'
    case 'adjust':
      return 'جرد / تعديل رصيد'
    default:
      return '—'
  }
}

export function createInitialOperationFormState(
  details: ItemSnapshot | null,
): OperationFormState {
  return {
    quantity: '',
    operationDate: getTodayValue(),
    projectName: details?.project_name ?? '',
    supplierName: '',
    purchaseOrderNumber: '',
    issuedTo: '',
    notes: '',
  }
}

export function validateOperationForm({
  details,
  form,
  operationType,
}: {
  details: ItemSnapshot | null
  form: OperationFormState
  operationType: InventoryOperationType | null
}) {
  if (!operationType || !details) {
    return {
      isValid: false,
      errors: {} as Record<string, string>,
    }
  }

  const nextErrors: Record<string, string> = {}
  const quantity = Number(form.quantity)
  const currentBalance = getNumericValue(details.stock_balance)

  if (!form.quantity || !Number.isFinite(quantity) || quantity <= 0) {
    nextErrors.quantity = 'الكمية مطلوبة ويجب أن تكون أكبر من صفر'
  }

  if (!form.operationDate) {
    nextErrors.operationDate = 'التاريخ مطلوب'
  }

  if ((operationType === 'add' || operationType === 'issue') && !form.projectName.trim()) {
    nextErrors.projectName = 'اسم المشروع مطلوب'
  }

  if (operationType === 'add' && !form.supplierName.trim()) {
    nextErrors.supplierName = 'اسم المورد مطلوب'
  }

  if (operationType === 'issue') {
    if (!form.issuedTo.trim()) {
      nextErrors.issuedTo = 'اسم المستلم مطلوب'
    }

    if (Number.isFinite(quantity) && quantity > currentBalance) {
      nextErrors.quantity = 'الكمية المصروفة أكبر من الرصيد الحالي'
    }
  }

  if (operationType === 'adjust' && !form.notes.trim()) {
    nextErrors.notes = 'سبب الجرد أو التعديل مطلوب'
  }

  return {
    isValid: Object.keys(nextErrors).length === 0,
    errors: nextErrors,
  }
}
