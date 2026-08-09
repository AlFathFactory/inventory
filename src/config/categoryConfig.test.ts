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
})
