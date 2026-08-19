import { describe, expect, it } from 'vitest'
import { filterPartiesForSearch, type Employee } from './partiesService'

describe('offline party search compatibility', () => {
  const employees: Employee[] = [
    {
      id: 'employee-1',
      name: 'أحمد محمد',
      employee_code: 'EMP-17',
      department: 'المخزن',
      phone: '01000000000',
      is_active: true,
    },
  ]

  it('searches Arabic names and employee metadata locally', () => {
    expect(filterPartiesForSearch('employee', employees, 'احمد')).toHaveLength(1)
    expect(filterPartiesForSearch('employee', employees, 'احمدمحمد')).toHaveLength(1)
    expect(filterPartiesForSearch('employee', employees, 'EMP-17')).toHaveLength(1)
    expect(filterPartiesForSearch('employee', employees, 'المخزن')).toHaveLength(1)
  })
})
