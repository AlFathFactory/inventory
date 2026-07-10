import type {
  ItemActionOption,
  ItemInventoryRow,
  ItemSelectOption,
} from '../types'

export const itemActionOptions: ItemActionOption[] = [
  {
    id: 'add',
    title: 'إضافة',
    hint: 'إضافة كمية للمخزون',
  },
  {
    id: 'issue',
    title: 'صرف',
    hint: 'صرف كمية من المخزون',
  },
]

export const itemRowsDemo: ItemInventoryRow[] = [
  {
    id: 'item-row-1',
    category: 'مسامير',
    itemName: 'مسمار 8 مم',
    project: 'مشروع A',
    stockBalance: 120,
    minQuantity: 50,
    updatedAt: '09/07',
    status: 'safe',
  },
  {
    id: 'item-row-2',
    category: 'دهانات',
    itemName: 'دهان أبيض',
    project: 'مشروع B',
    stockBalance: 8,
    minQuantity: 20,
    updatedAt: '09/07',
    status: 'low',
  },
  {
    id: 'item-row-3',
    category: 'اسطوانات',
    itemName: 'غاز CO2',
    project: 'مشروع A',
    stockBalance: 0,
    minQuantity: 10,
    updatedAt: '08/07',
    status: 'out',
  },
]

export const itemCategoryOptions: ItemSelectOption[] = [
  { value: 'all', label: 'فلتر القسم' },
  { value: 'مسامير', label: 'مسامير' },
  { value: 'دهانات', label: 'دهانات' },
  { value: 'اسطوانات', label: 'اسطوانات' },
]

export const itemStatusOptions: ItemSelectOption[] = [
  { value: 'all', label: 'الحالة' },
  { value: 'safe', label: 'آمن' },
  { value: 'low', label: 'قليل' },
  { value: 'out', label: 'منتهي' },
]

export const itemProjectOptions: ItemSelectOption[] = [
  { value: 'مشروع A', label: 'مشروع A' },
  { value: 'مشروع B', label: 'مشروع B' },
  { value: 'مشروع C', label: 'مشروع C' },
]

export const itemUnitOptions: ItemSelectOption[] = [
  { value: 'قطعة', label: 'قطعة' },
  { value: 'علبة', label: 'علبة' },
  { value: 'اسطوانة', label: 'اسطوانة' },
]
