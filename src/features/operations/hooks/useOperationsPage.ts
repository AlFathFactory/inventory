import { useMemo, useState } from 'react'
import {
  itemBalances,
  operationsCatalog,
  operationsRecentDemo,
} from '../data/operationsDemo'
import type { OperationFormValues, OperationRecord, OperationType } from '../types'

const initialFormValues: OperationFormValues = {
  project: operationsCatalog.projects[0]?.value ?? '',
  category: operationsCatalog.categories[0]?.value ?? '',
  item: operationsCatalog.itemsByCategory[
    operationsCatalog.categories[0]?.value ?? ''
  ]?.[0]?.value ?? '',
  quantity: '50',
  date: '2026-07-09',
  notes: '',
}

function getOperationLabel(operationType: OperationType) {
  switch (operationType) {
    case 'add':
      return 'إضافة'
    case 'issue':
      return 'صرف'
    case 'audit':
      return 'جرد'
  }
}

function formatDisplayDate(value: string) {
  const [year, month, day] = value.split('-')

  if (!year || !month || !day) {
    return value
  }

  return `${day}/${month}`
}

export function useOperationsPage() {
  const [selectedOperation, setSelectedOperation] = useState<OperationType>('add')
  const [formValues, setFormValues] = useState<OperationFormValues>(initialFormValues)
  const [recentOperations, setRecentOperations] =
    useState<OperationRecord[]>(operationsRecentDemo)

  const itemOptions = useMemo(
    () => operationsCatalog.itemsByCategory[formValues.category] ?? [],
    [formValues.category],
  )

  const currentBalance = itemBalances[formValues.item] ?? 0
  const quantity = Number(formValues.quantity || 0)

  const nextBalance = useMemo(() => {
    if (selectedOperation === 'add') {
      return currentBalance + quantity
    }

    if (selectedOperation === 'issue') {
      return Math.max(0, currentBalance - quantity)
    }

    return quantity
  }, [currentBalance, quantity, selectedOperation])

  function updateField<TKey extends keyof OperationFormValues>(
    field: TKey,
    value: OperationFormValues[TKey],
  ) {
    setFormValues((currentValues) => {
      if (field !== 'category') {
        return {
          ...currentValues,
          [field]: value,
        }
      }

      const nextItems = operationsCatalog.itemsByCategory[value] ?? []

      return {
        ...currentValues,
        category: value,
        item: nextItems[0]?.value ?? '',
      }
    })
  }

  function resetForm() {
    setSelectedOperation('add')
    setFormValues(initialFormValues)
  }

  function saveOperation() {
    const selectedCategory =
      operationsCatalog.categories.find(
        (category) => category.value === formValues.category,
      )?.label ?? formValues.category

    const selectedItem =
      itemOptions.find((item) => item.value === formValues.item)?.label ??
      formValues.item

    const nextRow: OperationRecord = {
      id: `operation-row-${Date.now()}`,
      date: formatDisplayDate(formValues.date),
      operationLabel: getOperationLabel(selectedOperation),
      category: selectedCategory,
      itemName: selectedItem,
      quantity,
      userName: 'أنت',
    }

    setRecentOperations((currentRows) => [nextRow, ...currentRows].slice(0, 6))
    resetForm()
  }

  return {
    selectedOperation,
    setSelectedOperation,
    formValues,
    itemOptions,
    currentBalance,
    nextBalance,
    recentOperations,
    updateField,
    resetForm,
    saveOperation,
  }
}
