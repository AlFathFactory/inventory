import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { EmployeeCustodyRecord } from '../types'
import { EmployeeCustodyList } from './EmployeeCustodyList'

const baseRecord: EmployeeCustodyRecord = {
  id: 'custody-1',
  employeeId: 'employee-1',
  tableName: 'consumables',
  itemId: 'item-1',
  sourceIssueOperationId: 'issue-1',
  quantity: 1,
  receivedDate: '2026-08-27',
  scrappedDate: null,
  scrapReason: null,
  notes: null,
  itemName: 'فونية لحام',
  itemCode: 'CON-001',
  categoryName: 'مستهلكات',
  projectName: 'المخزن',
  itemDetails: {},
}

describe('EmployeeCustodyList', () => {
  it('keeps active and scrapped custody visible with their correct sources', () => {
    const html = renderToStaticMarkup(
      <EmployeeCustodyList
        rows={[
          baseRecord,
          {
            ...baseRecord,
            id: 'custody-2',
            itemName: 'خامة صاج',
            sourceIssueOperationId: null,
            scrappedDate: '2026-09-01',
            scrapReason: 'تالف',
          },
        ]}
        onScrap={vi.fn()}
      />,
    )

    expect(html).toContain('عهدة فعالة')
    expect(html).toContain('مكهن')
    expect(html).toContain('من حركة صرف')
    expect(html).toContain('تسجيل يدوي')
    expect(html).toContain('تالف')
  })
})
