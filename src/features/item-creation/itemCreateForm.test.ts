import { describe, expect, it } from 'vitest'
import { categoryConfig } from '../../config/categoryConfig'
import {
  createInitialItemCreateFormState,
  prepareItemCreateValues,
  validateItemCreateForm,
} from './itemCreateForm'

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

  it('initializes both optional Paint date fields and prepares them for creation', () => {
    const form = {
      ...createInitialItemCreateFormState(categoryConfig.paints),
      project: 'المخزن',
      item_name: 'دهان أبيض',
      stock_balance: '4',
      transaction_date: '2026-08-20',
      production_date: '2026-08-01',
      expire_date: '2027-08-01',
    }

    expect(form).toMatchObject({ production_date: '2026-08-01', expire_date: '2027-08-01' })
    expect(prepareItemCreateValues(categoryConfig.paints, form)).toMatchObject({
      production_date: '2026-08-01',
      expire_date: '2027-08-01',
    })
  })

  it('normalizes an empty Paint production date to null without changing expiry behavior', () => {
    const form = {
      ...createInitialItemCreateFormState(categoryConfig.paints),
      production_date: '',
      expire_date: '',
    }

    expect(prepareItemCreateValues(categoryConfig.paints, form)).toMatchObject({
      production_date: null,
      expire_date: null,
    })
  })

  it('does not add production_date to non-Paint create values', () => {
    const form = createInitialItemCreateFormState(categoryConfig.consumables)

    expect(form).not.toHaveProperty('production_date')
    expect(prepareItemCreateValues(categoryConfig.consumables, form))
      .not.toHaveProperty('production_date')
  })
})
