import type { CategoryDefinition } from '../../config/categoryConfig'

export type ItemCreateFormState = Record<string, string> & {
  supplierId?: string
  supplierName?: string
}

export function createInitialItemCreateFormState(category: CategoryDefinition) {
  const nextState: ItemCreateFormState = {}

  ;(category.createFields ?? []).forEach((field) => {
    nextState[field.formKey ?? String(field.key)] = ''
  })

  nextState.supplierId = ''
  nextState.supplierName = ''

  return nextState
}

export function prepareItemCreateValues(
  category: CategoryDefinition,
  form: ItemCreateFormState,
) {
  const preparedValues = Object.entries(form).reduce<Record<string, string | number | null>>(
    (result, [fieldKey, value]) => {
      const matchingField = category.createFields?.find(
        (field) => (field.formKey ?? String(field.key)) === fieldKey,
      )
      const trimmedValue = value.trim()
      if (trimmedValue && matchingField) {
        result[String(matchingField.key)] = matchingField.inputType === 'number'
          ? Number(trimmedValue)
          : trimmedValue
      }
      return result
    },
    {},
  )

  if (category.table === 'paints') {
    preparedValues.production_date = form.production_date?.trim() || null
    preparedValues.expire_date = form.expire_date?.trim() || null
  }

  if (category.table === 'screws' || category.table === 'stock_screws') {
    preparedValues.din = form.din?.trim() || null
    preparedValues.code_number = form.codeNumber?.trim() || null
  }

  if (category.table === 'raw_materials') {
    preparedValues.code_number = form.codeNumber?.trim() || null
  }

  preparedValues.supplier_name = form.supplierName?.trim() || null

  return preparedValues
}

export function validateItemCreateForm(
  category: CategoryDefinition,
  form: ItemCreateFormState,
) {
  const errors: Record<string, string> = {}

  ;(category.createFields ?? []).forEach((field) => {
    const fieldKey = field.formKey ?? String(field.key)
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

  if (form.supplierName?.trim() && !form.supplierId?.trim()) {
    errors.supplierName = 'اختر المورد من القائمة أو أضفه كمورد جديد'
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  }
}
