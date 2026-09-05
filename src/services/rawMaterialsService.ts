import {
  getSupabaseConfigError,
  isSupabaseConfigured,
  supabaseClient,
} from '../lib/supabaseClient'

export type RawMaterialOperationInput = {
  itemId: string
  operationType: 'add' | 'issue'
  quantity: number
  projectId: string
  operationDate: string
  employeeId?: string | null
  employeeIds?: string[]
  supplierId?: string | null
  receivedBy?: string | null
  purchaseOrderNumber?: string | null
  itemCode?: string | null
  notes?: string | null
  createdBy?: string
  requestId: string
}

function getClientOrThrow() {
  if (!isSupabaseConfigured || !supabaseClient) {
    throw new Error(getSupabaseConfigError())
  }

  return supabaseClient
}

function rawMaterialOperationError(message: string) {
  const normalized = message.toLowerCase()

  if (normalized.includes('project') && (
    normalized.includes('required') ||
    normalized.includes('missing') ||
    normalized.includes('null')
  )) {
    return 'المشروع مطلوب'
  }

  if (normalized.includes('project') && (
    normalized.includes('inactive') ||
    normalized.includes('not found') ||
    normalized.includes('invalid')
  )) {
    return 'المشروع غير متاح أو غير نشط'
  }

  if (normalized.includes('supplier')) {
    return 'المورد مطلوب لعملية الإضافة أو غير نشط'
  }

  if (normalized.includes('employee')) {
    return 'الموظف مطلوب لعملية الصرف أو غير نشط'
  }

  if (
    normalized.includes('insufficient stock') ||
    normalized.includes('insufficient balance') ||
    normalized.includes('quantity exceeds') ||
    normalized.includes('negative stock')
  ) {
    return 'الكمية أكبر من الرصيد الحالي'
  }

  if (normalized.includes('archived')) {
    return 'الخامة مؤرشفة ولا يمكن تنفيذ حركة عليها'
  }

  if (normalized.includes('material') && normalized.includes('not found')) {
    return 'الخامة المحددة غير موجودة'
  }

  return 'تعذر تنفيذ حركة الخامة. تحقق من البيانات وحاول مرة أخرى.'
}

export async function applyRawMaterialOperationWithProject(
  input: RawMaterialOperationInput,
) {
  if (!navigator.onLine) {
    throw new Error('عمليات إضافة وصرف الخامات تتطلب اتصالًا بالإنترنت حاليًا.')
  }

  const quantity = Number(input.quantity)
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('الكمية مطلوبة ويجب أن تكون أكبر من صفر')
  }
  if (!input.itemId.trim()) {
    throw new Error('بيانات الخامة غير مكتملة، برجاء تحديث الصفحة والمحاولة مرة أخرى')
  }
  if (!input.projectId.trim()) {
    throw new Error('المشروع مطلوب')
  }
  if (!input.operationDate) {
    throw new Error('التاريخ مطلوب')
  }
  if (!input.requestId.trim()) {
    throw new Error('تعذر تجهيز معرّف العملية، أغلق النافذة وحاول مرة أخرى')
  }
  if (input.operationType === 'add' && !input.supplierId) {
    throw new Error('المورد مطلوب لعملية الإضافة')
  }
  if (
    input.operationType === 'issue' &&
    !input.employeeId &&
    (input.employeeIds?.length ?? 0) < 2
  ) {
    throw new Error('الموظف مطلوب لعملية الصرف')
  }

  const client = getClientOrThrow()
  const { data, error } = await client.rpc(
    'apply_raw_material_operation_with_project_rpc',
    {
      p_item_id: input.itemId,
      p_operation_type: input.operationType,
      p_quantity: quantity,
      p_project_id: input.projectId,
      p_operation_date: input.operationDate,
      p_employee_id: input.operationType === 'issue' ? input.employeeId || null : null,
      p_supplier_id: input.operationType === 'add' ? input.supplierId || null : null,
      p_received_by: input.operationType === 'add' ? input.receivedBy?.trim() || null : null,
      p_purchase_order_number: input.operationType === 'add'
        ? input.purchaseOrderNumber?.trim() || null
        : null,
      p_item_code: input.itemCode?.trim() || null,
      p_notes: input.notes?.trim() || null,
      p_created_by: input.createdBy?.trim() || 'user',
      p_request_id: input.requestId,
      p_employee_ids: input.operationType === 'issue' ? input.employeeIds ?? null : null,
    },
  )

  if (error) {
    throw new Error(rawMaterialOperationError(error.message))
  }

  if (
    !data ||
    typeof data !== 'object' ||
    !('status' in data) ||
    !['success', 'already_processed'].includes(String(data.status))
  ) {
    throw new Error('تعذر تنفيذ حركة الخامة. حاول مرة أخرى.')
  }

  return data
}
