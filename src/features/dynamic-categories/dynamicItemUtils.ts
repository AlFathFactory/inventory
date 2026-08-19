import type {
  DynamicCategoryItem,
  DynamicItemEditInput,
  DynamicItemStockStatus,
} from './types'
import { matchesAnySearchValue, normalizeSearchTerm } from '../../utils/searchUtils'

export const DYNAMIC_ITEM_NAME_REQUIRED = 'اسم الصنف مطلوب.'
export const DYNAMIC_ITEM_QUANTITY_INVALID = 'يجب أن تكون الكميات أرقامًا تساوي صفرًا أو أكثر.'

export function normalizeDynamicItemText(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

export function validateDynamicItemValues(
  itemName: string,
  openingBalance: number,
  minQuantity: number,
) {
  if (!normalizeDynamicItemText(itemName)) return DYNAMIC_ITEM_NAME_REQUIRED
  if (
    !Number.isFinite(openingBalance) ||
    !Number.isFinite(minQuantity) ||
    openingBalance < 0 ||
    minQuantity < 0
  ) {
    return DYNAMIC_ITEM_QUANTITY_INVALID
  }
  return null
}

export function getDynamicItemStockStatus(
  stockBalance: number | null | undefined,
  minQuantity: number | null | undefined,
): DynamicItemStockStatus {
  const balance = Number(stockBalance ?? 0)
  const minimum = Number(minQuantity ?? 0)
  if (balance <= 0) return 'out'
  if (balance <= minimum) return 'low'
  return 'safe'
}

export function matchesDynamicItemSearch(item: DynamicCategoryItem, search: string) {
  return matchesAnySearchValue(
    [item.item_name, item.internal_code, item.supplier_name, item.project],
    normalizeSearchTerm(search),
  )
}

export function buildDynamicItemEditPatch(input: DynamicItemEditInput) {
  return {
    item_name: normalizeDynamicItemText(input.itemName),
    project: normalizeDynamicItemText(input.project) || null,
    supplier_name: normalizeDynamicItemText(input.supplierName) || null,
    min_quantity: input.minQuantity,
    notes: input.notes.trim() || null,
  }
}

export function buildDynamicItemArchivePatch(isArchived: boolean) {
  return { is_archived: isArchived }
}
