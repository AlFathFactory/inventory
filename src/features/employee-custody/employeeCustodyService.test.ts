import { describe, expect, it } from 'vitest'
import { getCustodyErrorMessage } from './employeeCustodyService'

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
