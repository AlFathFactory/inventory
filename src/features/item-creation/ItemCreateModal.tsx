import type { CategoryDefinition } from '../../config/categoryConfig'
import type { ItemCreateFormState } from './itemCreateForm'
import { Link } from 'react-router-dom'
import { useActiveProjects } from '../projects/projectQueries'

type ItemCreateModalProps = {
  category: CategoryDefinition
  form: ItemCreateFormState
  formErrors: Record<string, string>
  isSubmitting: boolean
  onClose: () => void
  onFieldChange: (field: string, value: string) => void
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

export function ItemCreateModal({
  category,
  form,
  formErrors,
  isSubmitting,
  onClose,
  onFieldChange,
  onSubmit,
}: ItemCreateModalProps) {
  const createFields = category.createFields ?? []
  const isCuttingDiscs = category.table === 'cutting_discs'
  const hasProjectField = createFields.some((field) => String(field.key) === 'project')
  const projectsQuery = useActiveProjects(hasProjectField)
  const activeProjects = projectsQuery.data ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[32px] border border-[var(--app-border)] bg-[var(--app-panel)] p-6 shadow-2xl lg:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="text-right">
            <h3 className="text-[1.5rem] font-bold text-slate-900">
              {isCuttingDiscs ? 'إضافة صاروخ' : 'إضافة صنف جديد'}
            </h3>
            <p className="mt-1 text-sm text-[var(--app-text-muted)]">
              {isCuttingDiscs
                ? 'أدخل بيانات الصاروخ ثم احفظ السجل.'
                : `أدخل بيانات الصنف داخل قسم ${category.label}`}
            </p>
            {category.operationsEnabled ? (
              <p className="mt-2 text-sm font-medium text-[var(--app-primary)]">
                سيتم إنشاء كود الصنف تلقائيًا بعد الحفظ
              </p>
            ) : null}
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

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          {createFields.map((field) => {
            const fieldKey = field.formKey ?? String(field.key)
            const label = category.columns[field.key] ?? fieldKey
            const hasError = Boolean(formErrors[fieldKey])

            if (String(field.key) === 'project') {
              return (
                <label key={fieldKey} className="space-y-2 text-right">
                  <span className="block text-sm font-semibold text-slate-700">
                    اسم السجل{field.required ? ' *' : ''}
                  </span>
                  <select
                    name={fieldKey}
                    value={form[fieldKey] ?? ''}
                    disabled={projectsQuery.isPending || activeProjects.length === 0}
                    onChange={(event) => onFieldChange(fieldKey, event.target.value)}
                    className={fieldClassName(hasError)}
                  >
                    <option value="">
                      {activeProjects.length === 0
                        ? 'لا توجد سجلات مسجلة، أضف سجلًا أولًا'
                        : 'اختر السجل'}
                    </option>
                    {activeProjects.map((project) => (
                      <option key={project.id} value={project.name}>{project.name}</option>
                    ))}
                  </select>
                  {projectsQuery.error instanceof Error ? (
                    <p className="text-xs text-red-600">{projectsQuery.error.message}</p>
                  ) : null}
                  {hasError ? <p className="text-xs text-red-600">{formErrors[fieldKey]}</p> : null}
                  <Link to="/projects" className="inline-flex text-xs font-bold text-[var(--app-primary)] hover:underline">
                    + إضافة سجل جديد
                  </Link>
                </label>
              )
            }

            if (field.inputType === 'textarea') {
              return (
                <label key={fieldKey} className="space-y-2 text-right md:col-span-2">
                  <span className="block text-sm font-semibold text-slate-700">
                    {label}{field.required ? ' *' : ''}
                  </span>
                  <textarea
                    value={form[fieldKey] ?? ''}
                    onChange={(event) => onFieldChange(fieldKey, event.target.value)}
                    className={textAreaClassName(hasError)}
                    placeholder={`اكتب ${label}`}
                  />
                  {hasError ? <p className="text-xs text-red-600">{formErrors[fieldKey]}</p> : null}
                </label>
              )
            }

            return (
              <label key={fieldKey} className="space-y-2 text-right">
                <span className="block text-sm font-semibold text-slate-700">
                  {label}{field.required ? ' *' : ''}
                </span>
                <input
                  type={field.inputType ?? 'text'}
                  name={fieldKey}
                  min={field.inputType === 'number' ? '0' : undefined}
                  step={field.inputType === 'number' ? 'any' : undefined}
                  value={form[fieldKey] ?? ''}
                  onChange={(event) => onFieldChange(fieldKey, event.target.value)}
                  className={fieldClassName(hasError)}
                  placeholder={`اكتب ${label}`}
                />
                {hasError ? <p className="text-xs text-red-600">{formErrors[fieldKey]}</p> : null}
              </label>
            )
          })}
        </div>

        <section className="mt-6 border-t border-[var(--app-border)] pt-6">
          <h4 className="text-right text-base font-bold text-slate-900">بيانات المورد</h4>
          <label className="mt-4 block space-y-2 text-right">
            <span className="block text-sm font-semibold text-slate-700">اسم المورد</span>
            <input
              type="text"
              name="supplierName"
              value={form.supplierName ?? ''}
              onChange={(event) => onFieldChange('supplierName', event.target.value)}
              className={fieldClassName(Boolean(formErrors.supplierName))}
              placeholder="اكتب اسم المورد إن وجد"
            />
            {formErrors.supplierName ? (
              <p className="text-xs text-red-600">{formErrors.supplierName}</p>
            ) : null}
          </label>
        </section>

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
            {isSubmitting
              ? isCuttingDiscs ? 'جاري إضافة الصاروخ...' : 'جاري إضافة الصنف...'
              : isCuttingDiscs ? 'إضافة الصاروخ' : 'إضافة الصنف'}
          </button>
        </div>
      </div>
    </div>
  )
}
