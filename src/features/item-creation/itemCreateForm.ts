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
    }
  })

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  }
}
