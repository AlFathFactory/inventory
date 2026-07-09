type ColumnMap = Record<string, string>

type CategoryConfigItem<TColumns extends ColumnMap> = {
  label: string
  table: string
  route: string
  columns: TColumns
  searchableFields: readonly (keyof TColumns)[]
  dateField: keyof TColumns
  stockField?: keyof TColumns
  minQuantityField?: keyof TColumns
}

const sharedInventoryColumns = {
  project: 'مشروع',
  item_name: 'صنف',
  transaction_date: 'تاريخ',
  issued: 'صرف',
  added: 'إضافة',
  total_added: 'اجمالي المضاف',
  total_issued: 'إجمالي الصرف',
  stock_balance: 'الكمية رصيد مخزني',
  min_quantity: 'الحد الأدنى',
} as const

const screwColumns = {
  project: 'مشروع',
  item_name: 'صنف',
  din: 'DiN',
  code_number: 'CodeNumber',
  transaction_date: 'تاريخ',
  issued: 'صرف',
  added: 'إضافة',
  total_added: 'اجمالي المضاف',
  total_issued: 'إجمالي الصرف',
  stock_balance: 'الكمية رصيد مخزني',
  min_quantity: 'الحد الأدنى',
} as const

export const categoryConfig = {
  consumables: {
    label: 'مستهلكات',
    table: 'consumables',
    route: '/category/consumables',
    columns: sharedInventoryColumns,
    searchableFields: ['project', 'item_name'],
    dateField: 'transaction_date',
    stockField: 'stock_balance',
    minQuantityField: 'min_quantity',
  },
  paints: {
    label: 'الدهانات',
    table: 'paints',
    route: '/category/paints',
    columns: sharedInventoryColumns,
    searchableFields: ['project', 'item_name'],
    dateField: 'transaction_date',
    stockField: 'stock_balance',
    minQuantityField: 'min_quantity',
  },
  cones4_materials: {
    label: 'خامات كونز4',
    table: 'cones4_materials',
    route: '/category/cones4_materials',
    columns: {
      project: 'مشروع',
      type_name: 'نوع',
      weight: 'وزن',
      transaction_date: 'تاريخ',
      issued: 'صرف',
      added: 'إضافة',
      total_added: 'اجمالي المضاف',
      total_issued: 'إجمالي الصرف',
      stock_balance: 'الكمية رصيد مخزني',
      total_weight: 'إجمالي وزن',
      min_quantity: 'الحد الأدنى',
    },
    searchableFields: ['project', 'type_name'],
    dateField: 'transaction_date',
    stockField: 'stock_balance',
    minQuantityField: 'min_quantity',
  },
  screws: {
    label: 'مسامير',
    table: 'screws',
    route: '/category/screws',
    columns: screwColumns,
    searchableFields: ['project', 'item_name', 'din', 'code_number'],
    dateField: 'transaction_date',
    stockField: 'stock_balance',
    minQuantityField: 'min_quantity',
  },
  stock_screws: {
    label: 'مسامير استوك',
    table: 'stock_screws',
    route: '/category/stock_screws',
    columns: screwColumns,
    searchableFields: ['project', 'item_name', 'din', 'code_number'],
    dateField: 'transaction_date',
    stockField: 'stock_balance',
    minQuantityField: 'min_quantity',
  },
  raw_materials: {
    label: 'خامات',
    table: 'raw_materials',
    route: '/category/raw_materials',
    columns: sharedInventoryColumns,
    searchableFields: ['project', 'item_name'],
    dateField: 'transaction_date',
    stockField: 'stock_balance',
    minQuantityField: 'min_quantity',
  },
  cutting_discs: {
    label: 'صواريخ',
    table: 'cutting_discs',
    route: '/category/cutting_discs',
    columns: {
      code: 'code',
      type_name: 'type',
      received_by: 'اسم اللي اخذ الصاروخ',
      received_date: 'تاريخ الاستلام',
      scrapped_date: 'تاريخ التكهين',
    },
    searchableFields: ['code', 'type_name', 'received_by'],
    dateField: 'received_date',
  },
  cylinders: {
    label: 'اسطوانات',
    table: 'cylinders',
    route: '/category/cylinders',
    columns: {
      type_name: 'نوع',
      gas_balance: 'رصيد',
      empty_count: 'فارغ',
      full_count: 'ملي',
      transaction_date: 'تاريخ',
      notes: 'ملاحظات',
    },
    searchableFields: ['type_name', 'notes'],
    dateField: 'transaction_date',
    stockField: 'gas_balance',
  },
  long_welding_gloves: {
    label: 'جاونتي لحام طويل',
    table: 'long_welding_gloves',
    route: '/category/long_welding_gloves',
    columns: {
      type_name: 'نوع',
      received_by: 'اسم الشخص اللي استلم',
      received_date: 'تاريخ الاستلام',
    },
    searchableFields: ['type_name', 'received_by'],
    dateField: 'received_date',
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

export const categoryOptions = Object.entries(categoryConfig).map(
  ([key, config]) => ({
    key: key as CategoryKey,
    label: config.label,
    route: config.route,
    table: config.table,
  }),
)
