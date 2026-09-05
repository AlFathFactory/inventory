import { describe, expect, it, vi } from 'vitest'
import {
  addEmployeeCustodyItems,
  getCustodyErrorMessage,
} from './employeeCustodyService'
import type { AddEmployeeCustodyInput } from './types'

describe('getCustodyErrorMessage', () => {
  it('hides raw database errors behind an Arabic custody message', () => {
    expect(getCustodyErrorMessage({ message: 'duplicate key violates constraint' }))
      .toBe('العهدة مسجلة بالفعل')
    expect(getCustodyErrorMessage({ message: 'employee does not exist' }))
      .toBe('الموظف غير موجود')
    expect(getCustodyErrorMessage({ message: 'item not found' }))
      .toBe('الصنف غير موجود')
  })

  it('maps linked issue and scrapping validation errors', () => {
    expect(getCustodyErrorMessage({ message: 'issue employee mismatch' }))
      .toBe('حركة الصرف غير صالحة لهذا الموظف')
    expect(getCustodyErrorMessage({ message: 'scrapped date cannot be before received date' }))
      .toBe('تاريخ التكهين غير صالح')
    expect(getCustodyErrorMessage({ message: 'custody already scrapped' }))
      .toBe('تم تكهين العهدة بالفعل')
  })

  it('uses the safe fallback for unrecognized errors', () => {
    expect(getCustodyErrorMessage({ message: 'sensitive database detail' }, 'تعذر تسجيل العهدة'))
      .toBe('تعذر تسجيل العهدة')
  })
})

describe('addEmployeeCustodyItems', () => {
  const items: AddEmployeeCustodyInput[] = [
    {
      employeeId: 'employee-1',
      tableName: 'consumables',
      itemId: 'item-1',
      receivedDate: '2026-08-20',
      sourceIssueOperationId: 'issue-1',
      quantity: 1,
    },
    {
      employeeId: 'employee-1',
      tableName: 'inventory_items',
      itemId: 'item-2',
      receivedDate: '2026-08-21',
      sourceIssueOperationId: null,
      quantity: 1,
    },
  ]

  it('makes one independent add call for every selected item', async () => {
    const addOne = vi.fn().mockResolvedValue({ ok: true })

    await expect(addEmployeeCustodyItems(items, addOne)).resolves.toEqual({
      savedCount: 2,
      failures: [],
    })
    expect(addOne).toHaveBeenCalledTimes(2)
    expect(addOne).toHaveBeenNthCalledWith(1, items[0])
    expect(addOne).toHaveBeenNthCalledWith(2, items[1])
  })

  it('waits for every item and reports partial failures safely', async () => {
    const addOne = vi.fn()
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error('العهدة مسجلة بالفعل'))

    await expect(addEmployeeCustodyItems(items, addOne)).resolves.toEqual({
      savedCount: 1,
      failures: [{ index: 1, message: 'العهدة مسجلة بالفعل' }],
    })
    expect(addOne).toHaveBeenCalledTimes(2)
  })
})
