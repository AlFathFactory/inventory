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

export type RawMaterialProjectHistoryTotal = {
  projectId: string
  projectName: string
  quantity: number
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

export async function getRawMaterialProjectHistory(
  rawMaterialId: string,
): Promise<RawMaterialProjectHistoryTotal[]> {
  const client = getClientOrThrow()
  const { data, error } = await client
    .from('raw_material_project_issue_history')
    .select('*')
    .eq('raw_material_id', rawMaterialId)

  if (error) {
    throw new Error('تعذر تحميل الصرف التاريخي للمشروعات')
  }

  const historyRows = (data ?? []) as Array<Record<string, unknown>>
  const projectIds = [...new Set(historyRows
    .map((row) => String(row.project_id ?? ''))
    .filter(Boolean))]

  const projectNames = new Map<string, string>()
  if (projectIds.length > 0) {
    const { data: projects, error: projectsError } = await client
      .from('projects')
      .select('id,name')
      .in('id', projectIds)

    if (projectsError) {
      throw new Error('تعذر تحميل أسماء مشروعات الصرف التاريخي')
    }

    for (const project of projects ?? []) {
      projectNames.set(String(project.id), String(project.name ?? ''))
    }
  }

  const totals = new Map<string, RawMaterialProjectHistoryTotal>()
  for (const row of historyRows) {
    const projectId = String(row.project_id ?? '')
    const quantity = Number(row.quantity ?? row.issued_quantity ?? 0)
    if (!projectId || !Number.isFinite(quantity)) continue

    const current = totals.get(projectId)
    totals.set(projectId, {
      projectId,
      projectName:
        projectNames.get(projectId) ||
        String(row.project_name_snapshot ?? '') ||
        String(row.project_name ?? row.project ?? 'مشروع غير معروف'),
      quantity: (current?.quantity ?? 0) + quantity,
    })
  }

  return [...totals.values()].sort((left, right) =>
    left.projectName.localeCompare(right.projectName, 'ar'),
  )
}
