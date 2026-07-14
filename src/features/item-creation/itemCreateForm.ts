import type { CategoryDefinition } from '../../config/categoryConfig'

export type ItemCreateFormState = Record<string, string>

export function createInitialItemCreateFormState(category: CategoryDefinition) {
  const nextState: ItemCreateFormState = {}

  ;(category.createFields ?? []).forEach((field) => {
    nextState[String(field.key)] = ''
  })

  return nextState
}

export function validateItemCreateForm(
  category: CategoryDefinition,
  form: ItemCreateFormState,
) {
  const errors: Record<string, string> = {}

  ;(category.createFields ?? []).forEach((field) => {
    const fieldKey = String(field.key)
    const value = form[fieldKey]?.trim() ?? ''

    if (field.required && !value) {
      errors[fieldKey] = `${category.columns[field.key] ?? fieldKey} مطلوب`
      return
    }

    if (field.inputType === 'number' && value) {
      const parsedValue = Number(value)

      if (!Number.isFinite(parsedValue) || parsedValue < 0) {
        errors[fieldKey] = `${category.columns[field.key] ?? fieldKey} يجب أن يكون رقماً صالحاً`
      }

      if (String(field.key) === String(category.stockField) && parsedValue <= 0) {
        errors[fieldKey] = 'الكمية الأولية يجب أن تكون أكبر من صفر'
      }
    }

    if (field.inputType === 'date' && value) {
      const date = new Date(`${value}T00:00:00`)
      const [year, month, day] = value.split('-').map(Number)
      if (
        Number.isNaN(date.getTime()) ||
        date.getFullYear() !== year ||
        date.getMonth() + 1 !== month ||
        date.getDate() !== day
      ) {
        errors[fieldKey] = category.table === 'cutting_discs'
          ? 'تاريخ غير صحيح، برجاء اختيار تاريخ من التقويم'
          : `${category.columns[field.key] ?? fieldKey} يجب أن يكون تاريخاً محلياً صالحاً`
      }
    }
  })

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  }
}
