import type { ItemMovement } from '../../../services/itemsService'
import { getDisplayText, getOperationTypeLabel } from '../../inventory-operations/operationForm'
import { formatMovementDate } from '../itemDetailsUtils'

type DeleteMovementDialogProps = {
  movement: ItemMovement
  isDeleting: boolean
  onCancel: () => void
  onConfirm: () => void
}

function movementQuantity(movement: ItemMovement) {
  return getDisplayText(movement.quantity)
}

export function DeleteMovementDialog({
  movement,
  isDeleting,
  onCancel,
  onConfirm,
}: DeleteMovementDialogProps) {
  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isDeleting) onCancel()
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-movement-title"
        aria-describedby="delete-movement-description"
        className="w-full max-w-md rounded-[28px] border border-red-100 bg-white p-6 text-right shadow-2xl"
      >
        <div className="flex items-start gap-4">
          <span
            aria-hidden="true"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-red-500 text-lg font-bold text-red-600"
          >
            !
          </span>
          <div>
            <h2 id="delete-movement-title" className="text-xl font-bold text-slate-900">
              Delete this movement?
            </h2>
            <p id="delete-movement-description" className="mt-2 text-sm leading-6 text-slate-600">
              The movement will be deleted and the item balance will be restored to its previous value.
            </p>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-3 gap-2 rounded-2xl bg-slate-50 p-4 text-sm">
          <div>
            <dt className="text-xs text-slate-500">نوع الحركة</dt>
            <dd className="mt-1 font-semibold text-slate-900">
              {getOperationTypeLabel(movement.operation_type)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">الكمية</dt>
            <dd className="mt-1 font-semibold text-slate-900">{movementQuantity(movement)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">التاريخ</dt>
            <dd className="mt-1 font-semibold text-slate-900">
              {formatMovementDate(movement.operation_date)}
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="inline-flex min-w-28 items-center justify-center rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isDeleting ? 'جارٍ الحذف...' : 'حذف الحركة'}
          </button>
        </div>
      </div>
    </div>
  )
}
