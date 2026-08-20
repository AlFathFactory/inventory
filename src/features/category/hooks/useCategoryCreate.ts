import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { CategoryDefinition } from '../../../config/categoryConfig'
import {
  createInitialItemCreateFormState,
  prepareItemCreateValues,
  type ItemCreateFormState,
  validateItemCreateForm,
} from '../../item-creation/itemCreateForm'
import { createInventoryItem } from '../../../services/inventoryService'
import { createLongWeldingGlove } from '../../../services/longWeldingGlovesService'
import { createCuttingDisc } from '../../../services/cuttingDiscsService'
import { invalidateCategoryData } from '../../inventory/inventoryCache'
import type { SetCategoryMessage } from './categoryHookTypes'
import { saveOfflineItem } from '../../../services/offlineQueueService'
import { generateTempInternalCode } from '../../../utils/tempCode'
import { addOfflineItemToCache } from '../../inventory/offlineCache'

type UseCategoryCreateOptions = {
  category: CategoryDefinition | null
  setMessage: SetCategoryMessage
  closeQuickAction: () => void
}

export function useCategoryCreate({
  category,
  setMessage,
  closeQuickAction,
}: UseCategoryCreateOptions) {
  const queryClient = useQueryClient()
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
      const preparedValues = prepareItemCreateValues(category, form)

      if (!navigator.onLine) {
        const itemNameField = String(category.itemNameField ?? 'item_name')
        const itemName = String(preparedValues[itemNameField] ?? form.type_name ?? form.item_name ?? '').trim()
        const project = String(preparedValues.project ?? '').trim() || null
        const stockField = category.table === 'cylinders' ? 'gas_balance' : 'stock_balance'
        const initialBalance = Number(preparedValues[stockField] ?? 0)
        const isCustody = category.table === 'cutting_discs' || category.table === 'long_welding_gloves'
        const payload: Record<string, unknown> = {
          ...preparedValues,
          ...(!isCustody ? { item_key: [category.table, project ?? '', itemName,
              preparedValues.din ?? '', preparedValues.code_number ?? '',
              preparedValues.material_source ?? ''].join('::').toLowerCase() } : {}),
          [itemNameField]: itemName,
          ...(category.table === 'cylinders' ? {
            type_name: itemName, gas_balance: initialBalance, stock_balance: initialBalance,
            empty_count: Number(preparedValues.empty_count ?? 0),
            full_count: Number(preparedValues.full_count ?? 0),
          } : category.stockField ? {
            stock_balance: initialBalance, added: initialBalance,
            total_added: initialBalance, total_issued: 0,
          } : {}),
        }
        const offlineItem = await saveOfflineItem({
          tableName: category.table,
          internalCode: generateTempInternalCode(category.table),
          itemName,
          project,
          materialSource: String(preparedValues.material_source ?? '').trim() || null,
          payload,
        })
        addOfflineItemToCache(queryClient, offlineItem)
        close()
        setMessage({ type: 'success', text: 'تم حفظ الصنف محليًا وسيتم رفعه عند عودة الإنترنت' })
        return
      }

      const result = category.table === 'cutting_discs'
        ? await createCuttingDisc({
            code: form.code?.trim() || null,
            type_name: form.type_name.trim(),
            received_by: form.received_by.trim(),
            received_date: form.received_date || null,
            scrapped_date: form.scrapped_date || null,
            notes: form.notes?.trim() || null,
            supplier_name: form.supplierName?.trim() || null,
          })
        : category.table === 'long_welding_gloves'
        ? await createLongWeldingGlove({
            type_name: String(preparedValues.type_name ?? ''),
            received_by: String(preparedValues.received_by ?? ''),
            received_date: String(preparedValues.received_date ?? ''),
            notes: preparedValues.notes ? String(preparedValues.notes) : null,
            supplier_name: form.supplierName?.trim() || null,
          })
        : await createInventoryItem(category.table, preparedValues)

      if (result.error) {
        setMessage({ type: 'error', text: result.error })
        return
      }

      await invalidateCategoryData(queryClient, category.table)
      close()
      setMessage({
        type: 'success',
        text: category.table === 'cutting_discs'
          ? `تمت إضافة الصاروخ بنجاح بكود: ${String(result.data?.internal_code ?? '')}`
          : category.table === 'long_welding_gloves'
          ? `تمت إضافة سجل العهدة بنجاح بكود: ${String(result.data?.internal_code ?? '')}`
          : `تم إنشاء الصنف بكود: ${String(result.data?.internal_code ?? '')}`,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return { isOpen, isSubmitting, form, formErrors, open, close, updateField, submit }
}
