import type {
  QueuePanelStatus,
  QueuePanelCommand,
} from '../../services/desktopQueuePanelService'
import type { OfflineCommandType } from '../../lib/localDb/models/offlineCommand'

export const QUEUE_STATUS_UI: Record<QueuePanelStatus, {
  label: string
  className: string
}> = {
  pending: { label: 'قيد الانتظار', className: 'bg-slate-100 text-slate-700' },
  syncing: { label: 'جاري الرفع', className: 'bg-blue-50 text-blue-700' },
  failed: { label: 'فشل', className: 'bg-red-50 text-red-700' },
  conflict: { label: 'تعارض', className: 'bg-amber-50 text-amber-800' },
}

const COMMAND_TYPE_LABELS: Record<OfflineCommandType, string> = {
  inventory_operation: 'حركة مخزون',
  raw_material_operation: 'حركة خامة',
  return: 'مرتجع',
  delete_operation: 'حذف حركة',
  custody_add: 'إضافة عهدة',
  custody_scrap: 'تكهين عهدة',
}

export function describeQueueCommandType(commandType: OfflineCommandType) {
  return COMMAND_TYPE_LABELS[commandType]
}

export function formatQueueCommandTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('ar-EG', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export function retryLabel(command: QueuePanelCommand) {
  if (command.canRetry) return 'إعادة المحاولة'
  if (command.status === 'conflict') return 'يتطلب مراجعة'
  return 'غير قابل للمحاولة'
}
