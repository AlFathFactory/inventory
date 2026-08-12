import { describe, expect, it } from 'vitest'
import {
  createDynamicInventoryItem,
  DynamicItemCodeGenerationError,
  DYNAMIC_CATEGORY_NAME_REQUIRED,
  getDynamicCategoryErrorMessage,
  normalizeDynamicCategoryName,
  validateDynamicCategoryName,
} from './dynamicCategoryService'
import type { DynamicCategoryItem, DynamicItemCreateInput } from './types'

const createInput: DynamicItemCreateInput = {
  categoryId: 'category-1',
  itemName: 'صنف تجريبي',
  openingBalance: 10,
  minQuantity: 2,
  supplierName: 'المورد',
  notes: '',
}

const createdItem: DynamicCategoryItem = {
  id: 'item-1',
  category_id: 'category-1',
  item_name: 'صنف تجريبي',
  internal_code: null,
  project: null,
  supplier_name: 'المورد',
  opening_balance: 10,
  stock_balance: 10,
  min_quantity: 2,
  added: 10,
  issued: 0,
  total_added: 10,
  total_issued: 0,
  notes: null,
  source_sheet: null,
  is_archived: false,
  transaction_date: null,
  created_at: '2026-08-12T00:00:00Z',
  updated_at: '2026-08-12T00:00:00Z',
}

describe('dynamic category validation', () => {
  it('trims Arabic names and collapses internal whitespace', () => {
    expect(normalizeDynamicCategoryName('  مواد   التعبئة  ')).toBe('مواد التعبئة')
  })

  it('rejects an empty trimmed name', () => {
    expect(validateDynamicCategoryName('   ')).toBe(DYNAMIC_CATEGORY_NAME_REQUIRED)
  })

  it('shows a human-readable duplicate active name error', () => {
    expect(
      getDynamicCategoryErrorMessage({
        code: '23505',
        message: 'duplicate key value violates unique constraint categories_name_active_uidx',
      }),
    ).toBe('يوجد تصنيف نشط بهذا الاسم بالفعل.')
  })

  it('explains backend rename restrictions', () => {
    expect(getDynamicCategoryErrorMessage({ code: 'P0001', message: 'rename blocked' })).toContain(
      'مرتبط بأصناف أو حركات مخزون',
    )
  })
})

describe('dynamic item creation workflow', () => {
  it('creates, generates the backend code, then refetches without a frontend opening movement', async () => {
    const calls: string[] = []
    const result = await createDynamicInventoryItem(createInput, {
      create: async (input) => {
        calls.push(`create:${input.openingBalance}`)
        return createdItem
      },
      generateCode: async (itemId) => {
        calls.push(`generate:${itemId}`)
      },
      refetch: async (itemId, categoryId) => {
        calls.push(`refetch:${categoryId}:${itemId}`)
        return { ...createdItem, internal_code: 'DC001-001' }
      },
    })

    expect(result.internal_code).toBe('DC001-001')
    expect(calls).toEqual([
      'create:10',
      'generate:item-1',
      'refetch:category-1:item-1',
    ])
    expect(calls.some((call) => call.includes('operation'))).toBe(false)
  })

  it('reports code-generation failure after one create and still refetches the created item', async () => {
    let createCount = 0
    let refetchCount = 0

    await expect(
      createDynamicInventoryItem(createInput, {
        create: async () => {
          createCount += 1
          return createdItem
        },
        generateCode: async () => {
          throw new Error('code service unavailable')
        },
        refetch: async () => {
          refetchCount += 1
          return createdItem
        },
      }),
    ).rejects.toBeInstanceOf(DynamicItemCodeGenerationError)

    expect(createCount).toBe(1)
    expect(refetchCount).toBe(1)
  })

  it('reports a missing code after the required refetch without creating a second item', async () => {
    let createCount = 0
    await expect(
      createDynamicInventoryItem(createInput, {
        create: async () => {
          createCount += 1
          return createdItem
        },
        generateCode: async () => undefined,
        refetch: async () => createdItem,
      }),
    ).rejects.toBeInstanceOf(DynamicItemCodeGenerationError)
    expect(createCount).toBe(1)
  })
})
