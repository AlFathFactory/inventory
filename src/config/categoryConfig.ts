type ColumnMap = Record<string, string>

export type CategoryCreateField<TColumns extends ColumnMap = ColumnMap> = {
  key: keyof TColumns
  formKey?: string
  inputType?: 'text' | 'number' | 'date' | 'textarea'
  required?: boolean
}

type CategoryConfigItem<TColumns extends ColumnMap> = {
  label: string
  table: string
  route: string
  columns: TColumns
  aliases?: readonly string[]
  optionalFields?: readonly (keyof TColumns)[]
  attributeFields?: readonly (keyof TColumns)[]
  createFields?: readonly CategoryCreateField<TColumns>[]
  searchableFields: readonly (keyof TColumns)[]
  dateField: keyof TColumns
  stockField?: keyof TColumns
  minQuantityField?: keyof TColumns
  itemNameField?: keyof TColumns
  operationsEnabled?: boolean
}

const sharedInventoryColumns = {
  project: 'القسم',
  item_name: 'صنف',
  transaction_date: 'تاريخ الإضافة',
  issued: 'صرف',
  added: 'إضافة',
  total_added: 'إجمالي المضاف',
  total_issued: 'إجمالي الصرف',
  stock_balance: 'رصيد مخزني',
  min_quantity: 'الحد الأدنى',
  notes: 'ملاحظات',
} as const

const paintColumns = {
  ...sharedInventoryColumns,
  production_date: 'تاريخ الإنتاج',
  expire_date: 'تاريخ الصلاحية',
} as const

const screwColumns = {
  project: 'القسم',
  item_name: 'صنف',
  din: 'DIN',
  code_number: 'رقم الكود',
  transaction_date: 'تاريخ الإضافة',
  issued: 'صرف',
  added: 'إضافة',
  total_added: 'إجمالي المضاف',
  total_issued: 'إجمالي الصرف',
  stock_balance: 'رصيد مخزني',
  min_quantity: 'الحد الأدنى',
  notes: 'ملاحظات',
} as const

export const categoryConfig = {
  consumables: {
    label: 'مستهلكات',
    table: 'consumables',
    route: '/category/consumables',
    aliases: ['مستهلكات'],
    columns: sharedInventoryColumns,
    attributeFields: [],
    createFields: [
      { key: 'project', required: true },
      { key: 'item_name', required: true },
      { key: 'stock_balance', inputType: 'number', required: true },
      { key: 'transaction_date', inputType: 'date', required: true },
      { key: 'min_quantity', inputType: 'number' },
      { key: 'notes', inputType: 'textarea' },
    ],
    searchableFields: ['project', 'item_name'],
    dateField: 'transaction_date',
    stockField: 'stock_balance',
    minQuantityField: 'min_quantity',
    itemNameField: 'item_name',
    operationsEnabled: true,
  },
  paints: {
    label: 'الدهانات',
    table: 'paints',
    route: '/category/paints',
    aliases: ['الدهانات', 'دهانات'],
    columns: paintColumns,
    optionalFields: ['production_date', 'expire_date'],
    attributeFields: [],
    createFields: [
      { key: 'project', required: true },
      { key: 'item_name', required: true },
      { key: 'stock_balance', inputType: 'number', required: true },
      { key: 'transaction_date', inputType: 'date', required: true },
      { key: 'min_quantity', inputType: 'number' },
      { key: 'production_date', inputType: 'date' },
      { key: 'expire_date', inputType: 'date' },
      { key: 'notes', inputType: 'textarea' },
    ],
    searchableFields: ['project', 'item_name'],
    dateField: 'transaction_date',
    stockField: 'stock_balance',
    minQuantityField: 'min_quantity',
    itemNameField: 'item_name',
    operationsEnabled: true,
  },
  screws: {
    label: 'مسامير',
    table: 'screws',
    route: '/category/screws',
    aliases: ['مسامير', 'مساميرrotterdam', 'روتردام', 'rotterdam'],
    columns: screwColumns,
    attributeFields: ['din', 'code_number'],
    createFields: [
      { key: 'project', required: true },
      { key: 'item_name', required: true },
      { key: 'din' },
      { key: 'code_number', formKey: 'codeNumber' },
      { key: 'stock_balance', inputType: 'number', required: true },
      { key: 'transaction_date', inputType: 'date', required: true },
      { key: 'min_quantity', inputType: 'number' },
      { key: 'notes', inputType: 'textarea' },
    ],
    searchableFields: ['project', 'item_name', 'din', 'code_number'],
    dateField: 'transaction_date',
    stockField: 'stock_balance',
    minQuantityField: 'min_quantity',
    itemNameField: 'item_name',
    operationsEnabled: true,
  },
  stock_screws: {
    label: 'مسامير استوك',
    table: 'stock_screws',
    route: '/category/stock_screws',
    aliases: [
      'مسامير استوك',
      'مساميراستوك',
      'مساميراستوكrotterdam',
      'مسامير استوك rotterdam',
    ],
    columns: screwColumns,
    attributeFields: ['din', 'code_number'],
    createFields: [
      { key: 'project', required: true },
      { key: 'item_name', required: true },
      { key: 'din' },
      { key: 'code_number', formKey: 'codeNumber' },
      { key: 'stock_balance', inputType: 'number', required: true },
      { key: 'transaction_date', inputType: 'date', required: true },
      { key: 'min_quantity', inputType: 'number' },
      { key: 'notes', inputType: 'textarea' },
    ],
    searchableFields: ['project', 'item_name', 'din', 'code_number'],
    dateField: 'transaction_date',
    stockField: 'stock_balance',
    minQuantityField: 'min_quantity',
    itemNameField: 'item_name',
    operationsEnabled: true,
  },
  raw_materials: {
    label: 'خامات',
    table: 'raw_materials',
    route: '/category/raw_materials',
    aliases: [
      'خامات',
      'خامات كونز4',
      'خامات كونز 4',
      'كونز4',
      'كونز 4',
      'خامات +الفتح amset3',
      'خامات الفتح',
      'الفتح amset3',
      'amset3',
    ],
    columns: {
      project: 'اسم القسم',
      item_name: 'اسم الصنف / نوع الخامة',
      code_number: 'رقم الكود',
      transaction_date: 'تاريخ الإضافة',
      issued: 'صرف',
      added: 'إضافة',
      total_added: 'إجمالي المضاف',
      total_issued: 'إجمالي الصرف',
      stock_balance: 'الكمية',
      min_quantity: 'الحد الأدنى',
      weight: 'وزن',
      length: 'LENGTH',
      width: 'WIDTH',
      th: 'TH',
      material_source: 'material_source',
      notes: 'ملاحظات',
    },
    optionalFields: ['code_number', 'weight', 'length', 'width', 'th', 'material_source'],
    attributeFields: ['code_number', 'weight', 'length', 'width', 'th', 'material_source'],
    createFields: [
      { key: 'project', required: true },
      { key: 'item_name', required: true },
      { key: 'code_number', formKey: 'codeNumber' },
      { key: 'stock_balance', inputType: 'number', required: true },
      { key: 'transaction_date', inputType: 'date', required: true },
      { key: 'min_quantity', inputType: 'number' },
      { key: 'weight', inputType: 'number' },
      { key: 'length', inputType: 'number' },
      { key: 'width', inputType: 'number' },
      { key: 'th', inputType: 'number' },
      { key: 'material_source' },
      { key: 'notes', inputType: 'textarea' },
    ],
    searchableFields: [
      'project',
      'item_name',
      'code_number',
      'material_source',
      'weight',
      'length',
      'width',
      'th',
    ],
    dateField: 'transaction_date',
    stockField: 'stock_balance',
    minQuantityField: 'min_quantity',
    itemNameField: 'item_name',
    operationsEnabled: true,
  },
} as const satisfies Record<string, CategoryConfigItem<ColumnMap>>

export type CategoryKey = keyof typeof categoryConfig
export type CategoryDefinition = CategoryConfigItem<ColumnMap>
export type CategoryConfig = typeof categoryConfig
export type CategoryConfigEntry<TKey extends CategoryKey = CategoryKey> =
  CategoryConfig[TKey]

export const categoryEntries = Object.entries(categoryConfig) as Array<
  [CategoryKey, CategoryDefinition]
>

export const categoryOptions = categoryEntries.map(([key, config]) => ({
  key,
  label: config.label,
  route: config.route,
  table: config.table,
}))

export const operationCategoryOptions = categoryEntries
  .filter(([, config]) => config.operationsEnabled)
  .map(([key, config]) => ({
    key,
    label: config.label,
    table: config.table,
    itemNameField: (config.itemNameField ?? 'item_name') as string,
    stockField: (config.stockField ?? 'stock_balance') as string,
    attributeFields: (config.attributeFields ?? []) as readonly string[],
    columns: config.columns,
  }))

export function getCategoryByTable(tableName: string) {
  return categoryEntries.find(([, config]) => config.table === tableName)?.[1] ?? null
}

export function getCategoryByLabel(label: string) {
  return categoryEntries.find(([, config]) => config.label === label)?.[1] ?? null
}
