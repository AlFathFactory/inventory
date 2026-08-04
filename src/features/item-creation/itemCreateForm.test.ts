import { describe, expect, it } from 'vitest'
import { categoryConfig } from '../../config/categoryConfig'
import { createInitialItemCreateFormState, validateItemCreateForm } from './itemCreateForm'

describe('createInitialItemCreateFormState', () => {
  it('initializes the item supplier separately from stock operation fields', () => {
    const form = createInitialItemCreateFormState(categoryConfig.consumables)

    expect(form.supplierId).toBe('')
    expect(form.supplierName).toBe('')
  })

  it('requires a typed supplier to be selected or created', () => {
    const form = {
      ...createInitialItemCreateFormState(categoryConfig.consumables),
      project: 'المخزن',
      item_name: 'صنف',
      stock_balance: '1',
      transaction_date: '2026-08-04',
      supplierName: 'مورد غير محدد',
    }

    expect(validateItemCreateForm(categoryConfig.consumables, form).errors.supplierName)
      .toBe('اختر المورد من القائمة أو أضفه كمورد جديد')

    form.supplierId = 'supplier-1'
    expect(validateItemCreateForm(categoryConfig.consumables, form).errors.supplierName)
      .toBeUndefined()
  })
})
