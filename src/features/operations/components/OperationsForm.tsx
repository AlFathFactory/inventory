import type { ChangeEvent } from 'react'
import { OperationsFormField } from './OperationsFormField'
import type {
  OperationFormValues,
  OperationSelectOption,
  OperationType,
} from '../types'

type OperationsFormProps = {
  currentBalance: number
  formValues: OperationFormValues
  itemOptions: OperationSelectOption[]
  nextBalance: number
  onCancel: () => void
  onSave: () => void
  onUpdateField: <TKey extends keyof OperationFormValues>(
    field: TKey,
    value: OperationFormValues[TKey],
  ) => void
  projectOptions: OperationSelectOption[]
  categoryOptions: OperationSelectOption[]
  selectedOperation: OperationType
}

function getPreviewLabel(selectedOperation: OperationType) {
  switch (selectedOperation) {
    case 'add':
      return 'بعد الإضافة'
    case 'issue':
      return 'بعد الصرف'
    case 'audit':
      return 'بعد الجرد'
  }
}

function handleSelectChange<T extends keyof OperationFormValues>(
  event: ChangeEvent<HTMLSelectElement>,
  field: T,
  onUpdateField: OperationsFormProps['onUpdateField'],
) {
  onUpdateField(field, event.target.value as OperationFormValues[T])
}

function handleInputChange<T extends keyof OperationFormValues>(
  event: ChangeEvent<HTMLInputElement>,
  field: T,
  onUpdateField: OperationsFormProps['onUpdateField'],
) {
  onUpdateField(field, event.target.value as OperationFormValues[T])
}

export function OperationsForm({
  currentBalance,
  formValues,
  itemOptions,
  nextBalance,
  onCancel,
  onSave,
  onUpdateField,
  projectOptions,
  categoryOptions,
  selectedOperation,
}: OperationsFormProps) {
  return (
    <section className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel)] px-5 py-10 shadow-[var(--app-shadow)] sm:px-8">
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <OperationsFormField>
          <select
            value={formValues.project}
            onChange={(event) => handleSelectChange(event, 'project', onUpdateField)}
            className="w-full border-0 bg-transparent text-right text-sm text-slate-700 outline-none"
          >
            {projectOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </OperationsFormField>

        <OperationsFormField>
          <select
            value={formValues.category}
            onChange={(event) => handleSelectChange(event, 'category', onUpdateField)}
            className="w-full border-0 bg-transparent text-right text-sm text-slate-700 outline-none"
          >
            {categoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </OperationsFormField>

        <OperationsFormField>
          <select
            value={formValues.item}
            onChange={(event) => handleSelectChange(event, 'item', onUpdateField)}
            className="w-full border-0 bg-transparent text-right text-sm text-slate-700 outline-none"
          >
            {itemOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </OperationsFormField>

        <OperationsFormField>
          <input
            type="number"
            min="0"
            value={formValues.quantity}
            onChange={(event) => handleInputChange(event, 'quantity', onUpdateField)}
            placeholder="الكمية"
            className="w-full border-0 bg-transparent text-right text-sm text-slate-700 outline-none placeholder:text-slate-400"
          />
        </OperationsFormField>

        <OperationsFormField>
          <input
            type="date"
            value={formValues.date}
            onChange={(event) => handleInputChange(event, 'date', onUpdateField)}
            className="w-full border-0 bg-transparent text-right text-sm text-slate-700 outline-none"
          />
        </OperationsFormField>

        <OperationsFormField>
          <input
            type="text"
            value={formValues.notes}
            onChange={(event) => handleInputChange(event, 'notes', onUpdateField)}
            placeholder="ملاحظات"
            className="w-full border-0 bg-transparent text-right text-sm text-slate-700 outline-none placeholder:text-slate-400"
          />
        </OperationsFormField>
      </div>

      <div className="mt-14 text-right">
        <p className="text-[1.65rem] font-bold text-blue-600">
          الرصيد الحالي: {currentBalance} {'\u2190'} {getPreviewLabel(selectedOperation)}: {nextBalance}
        </p>
      </div>

      <div className="mt-12 flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-start">
        <button
          type="button"
          onClick={onCancel}
          className="h-[42px] rounded-2xl px-8 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
        >
          إلغاء
        </button>
        <button
          type="button"
          onClick={onSave}
          className="h-[42px] min-w-[180px] rounded-2xl bg-[var(--app-primary)] px-8 text-sm font-bold text-white transition hover:bg-blue-700"
        >
          حفظ العملية
        </button>
      </div>
    </section>
  )
}
