import type { CategoryDefinition } from '../../config/categoryConfig'
import type { InventoryOperationType } from '../../services/operationsService'
import {
  getDisplayText,
  getOperationTypeLabel,
  type OperationFormState,
} from './operationForm'
import { MultiEmployeeCombobox, PartyCombobox } from '../parties/PartyCombobox'

type InventoryOperationItemData = Record<string, unknown> & {
  item_name?: string | null
  project_name?: string | null
  project?: string | null
  category_name?: string | null
}

type InventoryOperationModalProps = {
  category: CategoryDefinition
  itemId: string
  itemData: InventoryOperationItemData
  operationType: InventoryOperationType | null
  form: OperationFormState
  formErrors: Record<string, string>
  isSubmitting: boolean
  onClose: () => void
  onFieldChange: <TKey extends keyof OperationFormState>(
    field: TKey,
    value: OperationFormState[TKey],
  ) => void
  onSubmit: () => void | Promise<void>
}

function fieldClassName(hasError = false) {
  return [
    'h-[46px] w-full rounded-2xl border bg-white px-4 text-sm text-slate-800 outline-none transition',
    hasError
      ? 'border-red-300 focus:border-red-400'
      : 'border-[var(--app-border)] focus:border-[var(--app-primary)]',
  ].join(' ')
}

function textAreaClassName(hasError = false) {
  return [
    'min-h-[108px] w-full rounded-3xl border bg-white px-4 py-3 text-sm text-slate-800 outline-none transition',
    hasError
      ? 'border-red-300 focus:border-red-400'
      : 'border-[var(--app-border)] focus:border-[var(--app-primary)]',
  ].join(' ')
}

export function InventoryOperationModal({
  category,
  itemId,
  itemData,
  operationType,
  form,
  formErrors,
  isSubmitting,
  onClose,
  onFieldChange,
  onSubmit,
}: InventoryOperationModalProps) {
  if (!operationType) {
    return null
  }

  const itemNameField = String(category.itemNameField ?? 'item_name')
  const itemName = getDisplayText(itemData[itemNameField] as string | number | null | undefined)
  const projectName = getDisplayText(itemData.project_name ?? itemData.project)
  const attributeFields = category.attributeFields ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[32px] border border-[var(--app-border)] bg-[var(--app-panel)] p-6 shadow-2xl lg:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="text-right">
            <h3 className="text-[1.5rem] font-bold text-slate-900">
              {getOperationTypeLabel(operationType)}
            </h3>
            <p className="mt-1 text-sm text-[var(--app-text-muted)]">
              {itemName} داخل قسم {itemData.category_name || category.label}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
            aria-label="إغلاق"
          >
            ×
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[22px] bg-slate-50 px-4 py-3 text-right">
            <div className="text-xs text-slate-500">الصنف</div>
            <div className="mt-1 font-semibold text-slate-900">{itemName}</div>
          </div>
          <div className="rounded-[22px] bg-slate-50 px-4 py-3 text-right">
            <div className="text-xs text-slate-500">رقم الصنف</div>
            <div className="mt-1 font-semibold text-slate-900">{itemId}</div>
          </div>
          {attributeFields.map((field) => (
            <div
              key={String(field)}
              className="rounded-[22px] bg-slate-50 px-4 py-3 text-right"
            >
              <div className="text-xs text-slate-500">
                {category.columns[field] ?? String(field)}
              </div>
              <div className="mt-1 font-semibold text-slate-900">
                {getDisplayText(
                  itemData[String(field)] as string | number | null | undefined,
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <div className="space-y-2 text-right">
            <span className="block text-sm font-semibold text-slate-700">اسم القسم</span>
            <div className="flex h-[46px] w-full items-center rounded-2xl border border-[var(--app-border)] bg-slate-50 px-4 text-sm font-semibold text-slate-800">
              {projectName}
            </div>
          </div>

          <label className="space-y-2 text-right">
            <span className="block text-sm font-semibold text-slate-700">
              {operationType === 'adjust' ? 'الرصيد الفعلي بعد الجرد' : 'الكمية'}
            </span>
            <input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={form.quantity}
              onChange={(event) => {
                const value = event.target.value
                if (/^\d*$/.test(value)) onFieldChange('quantity', value)
              }}
              className={fieldClassName(Boolean(formErrors.quantity))}
              placeholder={
                operationType === 'adjust' ? 'أدخل الرصيد النهائي' : 'أدخل الكمية'
              }
            />
            {formErrors.quantity ? (
              <p className="text-xs text-red-600">{formErrors.quantity}</p>
            ) : null}
          </label>

          <label className="space-y-2 text-right">
            <span className="block text-sm font-semibold text-slate-700">التاريخ</span>
            <input
              type="date"
              value={form.operationDate}
              onChange={(event) => onFieldChange('operationDate', event.target.value)}
              className={fieldClassName(Boolean(formErrors.operationDate))}
            />
            {formErrors.operationDate ? (
              <p className="text-xs text-red-600">{formErrors.operationDate}</p>
            ) : null}
          </label>

          {operationType === 'add' ? (
            <label className="space-y-2 text-right">
              <span className="block text-sm font-semibold text-slate-700">
                اسم المورد
              </span>
              <PartyCombobox
                kind="supplier"
                selectedId={form.supplierId}
                selectedName={form.supplierName}
                disabled={isSubmitting}
                error={formErrors.supplierName}
                onSelect={(party) => {
                  onFieldChange('supplierId', party.id)
                  onFieldChange('supplierName', party.name)
                }}
              />
            </label>
          ) : null}

          {operationType === 'add' ? (
            <label className="space-y-2 text-right">
              <span className="block text-sm font-semibold text-slate-700">
                رقم أمر التوريد
              </span>
              <input
                type="text"
                value={form.purchaseOrderNumber}
                onChange={(event) =>
                  onFieldChange('purchaseOrderNumber', event.target.value)
                }
                className={fieldClassName()}
                placeholder="اختياري"
              />
            </label>
          ) : null}

          {operationType === 'issue' ? (
            <div className="space-y-3 text-right md:col-span-2">
              <span className="block text-sm font-semibold text-slate-700">نوع الاستلام</span>
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    onFieldChange('recipientMode', 'single')
                    onFieldChange('employeeIds', [])
                  }}
                  className={`rounded-xl px-4 py-2 text-sm font-bold ${form.recipientMode !== 'multiple' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}
                >
                  مستلم واحد
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    onFieldChange('recipientMode', 'multiple')
                    onFieldChange('employeeId', null)
                    onFieldChange('issuedTo', '')
                  }}
                  className={`rounded-xl px-4 py-2 text-sm font-bold ${form.recipientMode === 'multiple' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}
                >
                  عدة مستلمين
                </button>
              </div>
              <span className="block text-sm font-semibold text-slate-700">
                {form.recipientMode === 'multiple' ? 'المستلمون' : 'اسم المستلم'}
              </span>
              {form.recipientMode === 'multiple' ? (
                <MultiEmployeeCombobox
                  selected={form.employeeIds ?? []}
                  disabled={isSubmitting}
                  error={formErrors.issuedTo}
                  onChange={(employees) => onFieldChange('employeeIds', employees)}
                />
              ) : (
                <PartyCombobox
                  kind="employee"
                  selectedId={form.employeeId}
                  selectedName={form.issuedTo}
                  disabled={isSubmitting}
                  error={formErrors.issuedTo}
                  onSelect={(party) => {
                    onFieldChange('employeeId', party.id)
                    onFieldChange('issuedTo', party.name)
                  }}
                />
              )}
            </div>
          ) : null}
        </div>

        <label className="mt-5 block space-y-2 text-right">
          <span className="block text-sm font-semibold text-slate-700">ملاحظات</span>
          <textarea
            value={form.notes}
            onChange={(event) => onFieldChange('notes', event.target.value)}
            className={textAreaClassName(Boolean(formErrors.notes))}
            placeholder={
              operationType === 'adjust'
                ? 'اكتب سبب الجرد أو التعديل'
                : 'أي ملاحظات إضافية'
            }
          />
          {formErrors.notes ? (
            <p className="text-xs text-red-600">{formErrors.notes}</p>
          ) : null}
        </label>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-start">
          <button
            type="button"
            onClick={onClose}
            className="h-[46px] rounded-2xl px-6 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={() => void onSubmit()}
            disabled={isSubmitting}
            className="h-[46px] min-w-[200px] rounded-2xl bg-[var(--app-primary)] px-6 text-sm font-bold text-white transition hover:bg-[var(--app-primary-strong)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'جاري حفظ العملية...' : 'تأكيد العملية'}
          </button>
        </div>
      </div>
    </div>
  )
}
