import { describe, expect, it } from 'vitest'
import {
  DYNAMIC_CATEGORY_NAME_REQUIRED,
  getDynamicCategoryErrorMessage,
  normalizeDynamicCategoryName,
  validateDynamicCategoryName,
} from './dynamicCategoryService'

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
