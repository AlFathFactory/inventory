import { describe, expect, it } from 'vitest'
import type { ItemDetails } from '../../services/itemsService'
import {
  buildEditItemPatch,
  createInitialEditItemFormState,
  getEditItemFields,
} from './itemEditForm'

const paintItem: ItemDetails = {
  table_name: 'paints',
  category_name: 'الدهانات',
  item_id: 'paint-1',
  item_key: 'paints::store::white',
  project_name: 'المخزن',
  item_name: 'دهان أبيض',
  stock_balance: 5,
  min_quantity: 1,
  production_date: '2026-07-15',
  expire_date: '2027-07-15',
  status: 'آمن',
  total_added: 5,
  total_issued: 0,
  source_rows_count: 1,
  updated_at: null,
  created_at: null,
}

describe('Paint edit form', () => {
  it('shows production before expiry and populates both stored values', () => {
    const fields = getEditItemFields('paints')
    const dateFields = fields.filter((field) => field.type === 'date')
    const form = createInitialEditItemFormState(fields, paintItem)

    expect(dateFields.map(({ key, label }) => ({ key, label }))).toEqual([
      { key: 'transaction_date', label: 'تاريخ العملية' },
      { key: 'production_date', label: 'تاريخ الإنتاج' },
      { key: 'expire_date', label: 'تاريخ الصلاحية' },
    ])
    expect(form.production_date).toBe('2026-07-15')
    expect(form.expire_date).toBe('2027-07-15')
  })

  it('sends a changed production date in the update patch', () => {
    const fields = getEditItemFields('paints')
    const form = {
      ...createInitialEditItemFormState(fields, paintItem),
      production_date: '2026-08-01',
    }

    const patch = buildEditItemPatch(fields, form)

    expect(patch.production_date).toBe('2026-08-01')
    expect(patch.expire_date).toBe('2027-07-15')
    expect(patch).not.toHaveProperty('stock_balance')
  })

  it('sends null when production date is cleared', () => {
    const fields = getEditItemFields('paints')
    const form = {
      ...createInitialEditItemFormState(fields, paintItem),
      production_date: '',
    }

    expect(buildEditItemPatch(fields, form).production_date).toBeNull()
  })

  it('does not expose production date for non-Paint edits', () => {
    const fields = getEditItemFields('consumables')

    expect(fields.map((field) => field.key)).not.toContain('production_date')
  })
})
