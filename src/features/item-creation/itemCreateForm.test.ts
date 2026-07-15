import { describe, expect, it } from 'vitest'
import { categoryConfig } from '../../config/categoryConfig'
import { createInitialItemCreateFormState } from './itemCreateForm'

describe('createInitialItemCreateFormState', () => {
  it('initializes the item supplier separately from stock operation fields', () => {
    const form = createInitialItemCreateFormState(categoryConfig.consumables)

    expect(form.supplierName).toBe('')
  })
})
