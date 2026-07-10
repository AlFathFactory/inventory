import { useMemo, useState } from 'react'
import {
  itemCategoryOptions,
  itemProjectOptions,
  itemRowsDemo,
  itemUnitOptions,
} from '../data/itemsDemo'
import type {
  ItemActionType,
  ItemEditorValues,
  ItemFilterValues,
  ItemInventoryRow,
} from '../types'

const initialEditorValues: ItemEditorValues = {
  category: itemCategoryOptions[1]?.value ?? '',
  project: itemProjectOptions[0]?.value ?? '',
  itemName: 'مسمار 8 مم',
  unit: itemUnitOptions[0]?.value ?? '',
  stockBalance: '120',
  minQuantity: '50',
}

const initialFilterValues: ItemFilterValues = {
  search: '',
  category: 'all',
  status: 'all',
}

export function useItemsPage() {
  const [selectedAction, setSelectedAction] = useState<ItemActionType>('add')
  const [filters, setFilters] = useState<ItemFilterValues>(initialFilterValues)
  const [editorValues, setEditorValues] =
    useState<ItemEditorValues>(initialEditorValues)
  const [rows, setRows] = useState<ItemInventoryRow[]>(itemRowsDemo)

  const filteredRows = useMemo(() => {
    const normalizedSearch = filters.search.trim().toLowerCase()

    return rows.filter((row) => {
      const matchesSearch =
        !normalizedSearch ||
        row.itemName.toLowerCase().includes(normalizedSearch) ||
        row.category.toLowerCase().includes(normalizedSearch)

      const matchesCategory =
        filters.category === 'all' || row.category === filters.category

      const matchesStatus =
        filters.status === 'all' || row.status === filters.status

      return matchesSearch && matchesCategory && matchesStatus
    })
  }, [filters, rows])

  function updateFilter<TKey extends keyof ItemFilterValues>(
    field: TKey,
    value: ItemFilterValues[TKey],
  ) {
    setFilters((currentValues) => ({
      ...currentValues,
      [field]: value,
    }))
  }

  function updateEditor<TKey extends keyof ItemEditorValues>(
    field: TKey,
    value: ItemEditorValues[TKey],
  ) {
    setEditorValues((currentValues) => ({
      ...currentValues,
      [field]: value,
    }))
  }

  function resetEditor() {
    setSelectedAction('add')
    setEditorValues(initialEditorValues)
  }

  function saveItem() {
    const stockBalance = Number(editorValues.stockBalance || 0)
    const minQuantity = Number(editorValues.minQuantity || 0)

    const nextStatus =
      stockBalance <= 0 ? 'out' : stockBalance <= minQuantity ? 'low' : 'safe'

    const nextRow: ItemInventoryRow = {
      id: `item-row-${Date.now()}`,
      category: editorValues.category,
      itemName: editorValues.itemName,
      project: editorValues.project,
      stockBalance,
      minQuantity,
      updatedAt: '10/07',
      status: nextStatus,
    }

    setRows((currentRows) => [nextRow, ...currentRows].slice(0, 6))
    resetEditor()
  }

  return {
    selectedAction,
    setSelectedAction,
    filters,
    editorValues,
    filteredRows,
    updateFilter,
    updateEditor,
    resetEditor,
    saveItem,
  }
}
