import { useEffect, useState } from 'react'
import type { CategoryDefinition } from '../../../config/categoryConfig'
import {
  createInitialItemCreateFormState,
  type ItemCreateFormState,
  validateItemCreateForm,
} from '../../item-creation/itemCreateForm'
import { createInventoryItem } from '../../../services/inventoryService'
import { createLongWeldingGlove } from '../../../services/longWeldingGlovesService'
import type { RefreshCategoryRows, SetCategoryMessage } from './categoryHookTypes'

type UseCategoryCreateOptions = {
  category: CategoryDefinition | null
  refreshRows: RefreshCategoryRows
  setMessage: SetCategoryMessage
  closeQuickAction: () => void
}

export function useCategoryCreate({
  category,
  refreshRows,
  setMessage,
  closeQuickAction,
}: UseCategoryCreateOptions) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [form, setForm] = useState<ItemCreateFormState>({})
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    setForm(category ? createInitialItemCreateFormState(category) : {})
    setFormErrors({})
  }, [category])

  function open() {
    if (!category) return
    setForm(createInitialItemCreateFormState(category))
    setFormErrors({})
    setIsOpen(true)
    closeQuickAction()
    setMessage(null)
  }

  function close() {
    setIsOpen(false)
    setFormErrors({})
  }

  function updateField(field: string, value: string) {
    setForm((currentForm) => {
      if (
        category?.table === 'cylinders' &&
        (field === 'gas_balance' || field === 'stock_balance')
      ) {
        return {
          ...currentForm,
          gas_balance: value,
          stock_balance: value,
        }
      }

      return { ...currentForm, [field]: value }
    })
    setFormErrors((currentErrors) => {
      if (!(field in currentErrors)) return currentErrors
      const nextErrors = { ...currentErrors }
      delete nextErrors[field]
      return nextErrors
    })
  }

  async function submit() {
    if (!category) return

    const validationResult = validateItemCreateForm(category, form)
    if (!validationResult.isValid) {
      setFormErrors(validationResult.errors)
      return
    }

    setIsSubmitting(true)
    setMessage(null)
    try {
      const preparedValues = Object.entries(form).reduce<Record<string, string | number | null>>(
        (result, [fieldKey, value]) => {
          const matchingField = category.createFields?.find(
            (field) => String(field.key) === fieldKey,
          )
          const trimmedValue = value.trim()
          if (trimmedValue) {
            result[fieldKey] = matchingField?.inputType === 'number'
              ? Number(trimmedValue)
              : trimmedValue
          }
          return result
        },
        {},
      )

      if (category.table === 'paints') {
        preparedValues.expire_date = form.expire_date?.trim() || null
      }

      const result = category.table === 'long_welding_gloves'
        ? await createLongWeldingGlove({
            type_name: String(preparedValues.type_name ?? ''),
            received_by: String(preparedValues.received_by ?? ''),
            received_date: String(preparedValues.received_date ?? ''),
            notes: preparedValues.notes ? String(preparedValues.notes) : null,
          })
        : await createInventoryItem(category.table, preparedValues)

      if (result.error) {
        setMessage({ type: 'error', text: result.error })
        return
      }

      await refreshRows()
      close()
      setMessage({
        type: 'success',
        text: category.table === 'long_welding_gloves'
          ? 'تمت إضافة سجل العهدة بنجاح'
          : 'تم إضافة الصنف وتسجيله كحركة إضافة بنجاح',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return { isOpen, isSubmitting, form, formErrors, open, close, updateField, submit }
}
