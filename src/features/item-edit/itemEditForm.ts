import type { ItemDetails } from '../../services/itemsService'

export type EditField = {
  key: string
  formKey?: string
  label: string
  type?: 'text' | 'number' | 'date' | 'textarea'
  required?: boolean
}

export type EditItemFormState = Record<string, string> & {
  supplierId?: string
  supplierName?: string
}

const supplierField: EditField = {
  key: 'supplier_name',
  formKey: 'supplierName',
  label: 'اسم المورد',
}

const fieldsByTable: Record<string, EditField[]> = {
  consumables: [
    { key: 'project', label: 'اسم القسم', required: true },
    { key: 'item_name', label: 'اسم الصنف', required: true },
    { key: 'transaction_date', label: 'تاريخ العملية', type: 'date' },
    { key: 'min_quantity', label: 'الحد الأدنى', type: 'number' },
    { key: 'notes', label: 'ملاحظات', type: 'textarea' },
  ],
  paints: [
    { key: 'project', label: 'اسم القسم', required: true },
    { key: 'item_name', label: 'اسم الصنف', required: true },
    { key: 'transaction_date', label: 'تاريخ العملية', type: 'date' },
    { key: 'min_quantity', label: 'الحد الأدنى', type: 'number' },
    { key: 'production_date', label: 'تاريخ الإنتاج', type: 'date' },
    { key: 'expire_date', label: 'تاريخ الصلاحية', type: 'date' },
  ],
  screws: [],
  stock_screws: [],
  raw_materials: [],
  cylinders: [
    { key: 'project', label: 'القسم' },
    { key: 'type_name', label: 'نوع الاسطوانة', required: true },
    { key: 'empty_count', label: 'فارغ', type: 'number' },
    { key: 'full_count', label: 'ملي', type: 'number' },
    { key: 'min_quantity', label: 'الحد الأدنى', type: 'number' },
    { key: 'transaction_date', label: 'تاريخ العملية', type: 'date' },
    { key: 'notes', label: 'ملاحظات', type: 'textarea' },
  ],
  cutting_discs: [
    { key: 'code', label: 'الكود' },
    { key: 'type_name', label: 'النوع', required: true },
    { key: 'received_by', label: 'المستلم', required: true },
    { key: 'received_date', label: 'تاريخ الاستلام', type: 'date' },
    { key: 'scrapped_date', label: 'تاريخ التكهين', type: 'date' },
    { key: 'notes', label: 'ملاحظات', type: 'textarea' },
  ],
  long_welding_gloves: [
    { key: 'type_name', label: 'النوع', required: true },
    { key: 'received_by', label: 'المستلم', required: true },
    { key: 'received_date', label: 'تاريخ الاستلام', type: 'date', required: true },
    { key: 'notes', label: 'ملاحظات', type: 'textarea' },
  ],
}

const screwFields: EditField[] = [
  { key: 'project', label: 'اسم القسم', required: true },
  { key: 'item_name', label: 'اسم الصنف', required: true },
  { key: 'din', label: 'DIN' },
  { key: 'code_number', formKey: 'codeNumber', label: 'رقم الكود / Code Number' },
  { key: 'transaction_date', label: 'تاريخ العملية', type: 'date' },
  { key: 'min_quantity', label: 'الحد الأدنى', type: 'number' },
]

fieldsByTable.screws = screwFields
fieldsByTable.stock_screws = screwFields
fieldsByTable.raw_materials = [
  { key: 'project', label: 'اسم القسم', required: true },
  { key: 'item_name', label: 'اسم الصنف', required: true },
  { key: 'code_number', label: 'رقم الكود' },
  { key: 'transaction_date', label: 'تاريخ العملية', type: 'date' },
  { key: 'min_quantity', label: 'الحد الأدنى', type: 'number' },
  { key: 'weight', label: 'وزن', type: 'number' },
  { key: 'length', label: 'LENGTH', type: 'number' },
  { key: 'width', label: 'WIDTH', type: 'number' },
  { key: 'th', label: 'TH', type: 'number' },
  { key: 'material_source', label: 'مصدر الخامة' },
]

export function getEditItemFields(tableName: string) {
  return [...(fieldsByTable[tableName] ?? []), supplierField]
}

export function getInitialEditItemValue(item: ItemDetails, key: string) {
  const value =
    key === 'project'
      ? item.project ?? item.project_name
      : key === 'type_name'
        ? item.type_name ?? item.item_name
        : key === 'gas_balance'
          ? item.gas_balance ?? item.stock_balance
          : item[key]
  return value === null || value === undefined ? '' : String(value)
}

export function createInitialEditItemFormState(
  fields: EditField[],
  item: ItemDetails,
): EditItemFormState {
  return {
    ...Object.fromEntries(fields.map((field) => [
      field.formKey ?? field.key,
      getInitialEditItemValue(item, field.key),
    ])),
    supplierId: '',
  }
}

export function buildEditItemPatch(
  fields: EditField[],
  form: EditItemFormState,
) {
  return Object.fromEntries(fields.map((field) => {
    const value = form[field.formKey ?? field.key]?.trim() ?? ''
    return [
      field.key,
      field.type === 'number' ? (value === '' ? null : Number(value)) : value || null,
    ]
  })) as Record<string, string | number | null>
}
