type ColumnMap = Record<string, string>

export type CategoryCreateField<TColumns extends ColumnMap = ColumnMap> = {
  key: keyof TColumns
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
  project: 'مشروع',
  item_name: 'صنف',
  transaction_date: 'تاريخ',
  issued: 'صرف',
  added: 'إضافة',
  total_added: 'إجمالي المضاف',
  total_issued: 'إجمالي الصرف',
  stock_balance: 'رصيد مخزني',
  min_quantity: 'الحد الأدنى',
} as const

const paintColumns = {
  ...sharedInventoryColumns,
  expire_date: 'تاريخ الانتهاء',
} as const

const screwColumns = {
  project: 'مشروع',
  item_name: 'صنف',
  din: 'DiN',
  code_number: 'CodeNumber',
  transaction_date: 'تاريخ',
  issued: 'صرف',
  added: 'إضافة',
  total_added: 'إجمالي المضاف',
  total_issued: 'إجمالي الصرف',
  stock_balance: 'رصيد مخزني',
  min_quantity: 'الحد الأدنى',
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
      { key: 'min_quantity', inputType: 'number' },
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
    optionalFields: ['expire_date'],
    attributeFields: [],
    createFields: [
      { key: 'project', required: true },
      { key: 'item_name', required: true },
      { key: 'stock_balance', inputType: 'number', required: true },
      { key: 'min_quantity', inputType: 'number' },
      { key: 'expire_date', inputType: 'date' },
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
      { key: 'din', required: true },
      { key: 'code_number', required: true },
      { key: 'stock_balance', inputType: 'number', required: true },
      { key: 'min_quantity', inputType: 'number' },
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
      { key: 'din', required: true },
      { key: 'code_number', required: true },
      { key: 'stock_balance', inputType: 'number', required: true },
      { key: 'min_quantity', inputType: 'number' },
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
      project: 'اسم المشروع',
      item_name: 'اسم الصنف / نوع الخامة',
      transaction_date: 'تاريخ',
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
    optionalFields: ['weight', 'length', 'width', 'th', 'material_source'],
    attributeFields: ['weight', 'length', 'width', 'th', 'material_source'],
    createFields: [
      { key: 'project', required: true },
      { key: 'item_name', required: true },
      { key: 'stock_balance', inputType: 'number', required: true },
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
  cutting_discs: {
    label: 'صواريخ',
    table: 'cutting_discs',
    route: '/category/cutting_discs',
    aliases: ['صواريخ', 'صواربخ'],
    columns: {
      code: 'code',
      type_name: 'type',
      received_by: 'اسم اللي اخد الصاروخ',
      received_date: 'تاريخ الاستلام',
      scrapped_date: 'تاريخ التكهيت',
    },
    attributeFields: ['code', 'received_by', 'scrapped_date'],
    searchableFields: ['code', 'type_name', 'received_by'],
    dateField: 'received_date',
    itemNameField: 'type_name',
    operationsEnabled: false,
  },
  cylinders: {
    label: 'اسطوانات',
    table: 'cylinders',
    route: '/category/cylinders',
    aliases: ['اسطوانات', 'اسطوانات غازات', 'غازات'],
    columns: {
      type_name: 'نوع',
      gas_balance: 'رصيد',
      empty_count: 'فارغ',
      full_count: 'ملي',
      transaction_date: 'تاريخ',
      notes: 'ملاحظات',
    },
    attributeFields: ['empty_count', 'full_count', 'notes'],
    createFields: [
      { key: 'type_name', required: true },
      { key: 'gas_balance', inputType: 'number', required: true },
      { key: 'empty_count', inputType: 'number' },
      { key: 'full_count', inputType: 'number' },
      { key: 'notes', inputType: 'textarea' },
    ],
    searchableFields: ['type_name', 'notes'],
    dateField: 'transaction_date',
    stockField: 'gas_balance',
    itemNameField: 'type_name',
    operationsEnabled: true,
  },
  long_welding_gloves: {
    label: 'جوانتي لحام طويل',
    table: 'long_welding_gloves',
    route: '/category/long_welding_gloves',
    aliases: ['جوانتى لحام طويل', 'جوانتي لحام طويل'],
    columns: {
      type_name: 'نوع',
      received_by: 'اسم الشخص اللي استلم',
      received_date: 'تاريخ الاستلام',
    },
    attributeFields: ['received_by'],
    searchableFields: ['type_name', 'received_by'],
    dateField: 'received_date',
    itemNameField: 'type_name',
    operationsEnabled: false,
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
