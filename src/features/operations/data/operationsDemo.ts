import type {
  OperationCatalog,
  OperationRecord,
  OperationTypeOption,
} from '../types'

export const operationTypeOptions: OperationTypeOption[] = [
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
  {
    id: 'audit',
    title: 'جرد',
    hint: 'تعديل الرصيد بعد الجرد',
  },
]

export const operationsCatalog: OperationCatalog = {
  projects: [
    { value: 'factory-1', label: 'مصنع 1' },
    { value: 'factory-2', label: 'مصنع 2' },
    { value: 'warehouse-a', label: 'مخزن A' },
  ],
  categories: [
    { value: 'screws', label: 'مسامير' },
    { value: 'paints', label: 'دهانات' },
    { value: 'consumables', label: 'مستهلكات' },
  ],
  itemsByCategory: {
    screws: [
      { value: 'screw-8mm', label: 'مسمار 8 مم' },
      { value: 'screw-10mm', label: 'مسمار 10 مم' },
    ],
    paints: [
      { value: 'white-paint', label: 'دهان أبيض' },
      { value: 'blue-paint', label: 'دهان أزرق' },
    ],
    consumables: [
      { value: 'welding-gloves', label: 'جوانتي لحام' },
      { value: 'safety-mask', label: 'قناع أمان' },
    ],
  },
}

export const itemBalances: Record<string, number> = {
  'screw-8mm': 120,
  'screw-10mm': 90,
  'white-paint': 32,
  'blue-paint': 18,
  'welding-gloves': 44,
  'safety-mask': 27,
}

export const operationsRecentDemo: OperationRecord[] = [
  {
    id: 'operation-row-1',
    date: '09/07',
    operationLabel: 'إضافة',
    category: 'مسامير',
    itemName: 'مسمار 8 مم',
    quantity: 50,
    userName: 'أمين',
  },
  {
    id: 'operation-row-2',
    date: '09/07',
    operationLabel: 'صرف',
    category: 'دهانات',
    itemName: 'دهان أبيض',
    quantity: 7,
    userName: 'أمين',
  },
]
