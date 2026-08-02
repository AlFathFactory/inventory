import { describe, expect, it } from 'vitest'
import { filterPartiesForSearch, type Employee, type Supplier } from './partiesService'

describe('filterPartiesForSearch', () => {
  const employees: Employee[] = [
    { id: '1', name: 'فاطمه على', employee_code: 'EMP-01', department: 'الصيانة', phone: '0101', is_active: true },
    { id: '2', name: 'محمد علي', employee_code: 'EMP-02', department: 'الإنتاج', phone: '0102', is_active: true },
  ]

  it('uses shared Arabic normalization when searching employees', () => {
    expect(filterPartiesForSearch('employee', employees, 'فاطمة علي')).toEqual([employees[0]])
  })

  it('searches employee code, department, and phone', () => {
    expect(filterPartiesForSearch('employee', employees, 'emp-02')).toEqual([employees[1]])
    expect(filterPartiesForSearch('employee', employees, 'الصيانه')).toEqual([employees[0]])
    expect(filterPartiesForSearch('employee', employees, '0102')).toEqual([employees[1]])
  })

  it('searches supplier name, code, contact person, and phone', () => {
    const suppliers: Supplier[] = [
      { id: 's1', name: 'شركة الهدى', supplier_code: 'SUP-10', contact_person: 'مروه على', phone: '0202', is_active: true },
    ]
    expect(filterPartiesForSearch('supplier', suppliers, 'الهدي')).toEqual(suppliers)
    expect(filterPartiesForSearch('supplier', suppliers, 'مروة علي')).toEqual(suppliers)
  })
})
