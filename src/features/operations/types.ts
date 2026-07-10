export type OperationType = 'add' | 'issue' | 'audit'

export type OperationTypeOption = {
  id: OperationType
  title: string
  hint: string
}

export type OperationSelectOption = {
  value: string
  label: string
}

export type OperationRecord = {
  id: string
  date: string
  operationLabel: string
  category: string
  itemName: string
  quantity: number
  userName: string
}

export type OperationFormValues = {
  project: string
  category: string
  item: string
  quantity: string
  date: string
  notes: string
}

export type OperationCatalog = {
  projects: OperationSelectOption[]
  categories: OperationSelectOption[]
  itemsByCategory: Record<string, OperationSelectOption[]>
}
