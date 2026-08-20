import { describe, expect, it } from 'vitest'
import { categoryConfig, categoryOptions } from './categoryConfig'

describe('categoryConfig', () => {
  it('excludes removed inventory categories', () => {
    const removedCategoryKeys = [
      'cutting_discs',
      'cylinders',
      'long_welding_gloves',
    ]

    expect(Object.keys(categoryConfig)).not.toEqual(
      expect.arrayContaining(removedCategoryKeys),
    )
    expect(categoryOptions.map(({ key }) => key)).not.toEqual(
      expect.arrayContaining(removedCategoryKeys),
    )
  })

  it('configures production and expiry dates only for Paint creation', () => {
    const paintDateFields = categoryConfig.paints.createFields
      .filter((field) => field.inputType === 'date')
      .map((field) => String(field.key))

    expect(paintDateFields).toEqual([
      'transaction_date',
      'production_date',
      'expire_date',
    ])
    expect(categoryConfig.paints.columns.production_date).toBe('تاريخ الإنتاج')
    expect(categoryConfig.paints.columns.expire_date).toBe('تاريخ الصلاحية')
    expect(categoryConfig.consumables.createFields.map((field) => String(field.key)))
      .not.toContain('production_date')
  })
})
