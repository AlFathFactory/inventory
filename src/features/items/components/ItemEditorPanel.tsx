import type { ChangeEvent } from 'react'
import {
  itemCategoryOptions,
  itemProjectOptions,
  itemUnitOptions,
} from '../data/itemsDemo'
import type {
  ItemActionType,
  ItemEditorValues,
  ItemSelectOption,
} from '../types'

type ItemEditorPanelProps = {
  editorValues: ItemEditorValues
  onCancel: () => void
  onSave: () => void
  onUpdateEditor: <TKey extends keyof ItemEditorValues>(
    field: TKey,
    value: ItemEditorValues[TKey],
  ) => void
  selectedAction: ItemActionType
}

function getEditorTitle(selectedAction: ItemActionType) {
  return selectedAction === 'add' ? 'إضافة / صرف' : 'إضافة / صرف'
}

function renderSelectOptions(options: ItemSelectOption[]) {
  return options.map((option) => (
    <option key={option.value} value={option.value}>
      {option.label}
    </option>
  ))
}

function handleSelectChange<T extends keyof ItemEditorValues>(
  event: ChangeEvent<HTMLSelectElement>,
  field: T,
  onUpdateEditor: ItemEditorPanelProps['onUpdateEditor'],
) {
  onUpdateEditor(field, event.target.value as ItemEditorValues[T])
}

function handleInputChange<T extends keyof ItemEditorValues>(
  event: ChangeEvent<HTMLInputElement>,
  field: T,
  onUpdateEditor: ItemEditorPanelProps['onUpdateEditor'],
) {
  onUpdateEditor(field, event.target.value as ItemEditorValues[T])
}

function fieldClassName() {
  return 'h-[42px] w-full rounded-2xl border border-[var(--app-border)] bg-white px-4 text-right text-sm text-slate-700 outline-none placeholder:text-slate-400'
}

export function ItemEditorPanel({
  editorValues,
  onCancel,
  onSave,
  onUpdateEditor,
  selectedAction,
}: ItemEditorPanelProps) {
  return (
    <section className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel)] px-5 py-8 shadow-[var(--app-shadow)] sm:px-8">
      <h2 className="text-right text-[1.9rem] font-bold tracking-tight text-slate-900">
        {getEditorTitle(selectedAction)}
      </h2>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <select
          value={editorValues.category}
          onChange={(event) => handleSelectChange(event, 'category', onUpdateEditor)}
          className={fieldClassName()}
        >
          {renderSelectOptions(itemCategoryOptions.slice(1))}
        </select>

        <select
          value={editorValues.project}
          onChange={(event) => handleSelectChange(event, 'project', onUpdateEditor)}
          className={fieldClassName()}
        >
          {renderSelectOptions(itemProjectOptions)}
        </select>

        <input
          type="text"
          value={editorValues.itemName}
          onChange={(event) => handleInputChange(event, 'itemName', onUpdateEditor)}
          placeholder="اسم الصنف"
          className={fieldClassName()}
        />

        <select
          value={editorValues.unit}
          onChange={(event) => handleSelectChange(event, 'unit', onUpdateEditor)}
          className={fieldClassName()}
        >
          {renderSelectOptions(itemUnitOptions)}
        </select>

        <input
          type="number"
          min="0"
          value={editorValues.stockBalance}
          onChange={(event) =>
            handleInputChange(event, 'stockBalance', onUpdateEditor)
          }
          placeholder="الرصيد الحالي"
          className={fieldClassName()}
        />

        <input
          type="number"
          min="0"
          value={editorValues.minQuantity}
          onChange={(event) =>
            handleInputChange(event, 'minQuantity', onUpdateEditor)
          }
          placeholder="الحد الأدنى"
          className={fieldClassName()}
        />
      </div>

      <div className="mt-8 flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-start">
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
          حفظ الصنف
        </button>
      </div>
    </section>
  )
}
