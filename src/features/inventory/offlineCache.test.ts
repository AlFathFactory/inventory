import { describe, expect, it } from 'vitest'
import type { OfflineItem, OfflineOperation } from '../../lib/offlineDb'
import type { CategorySummaryItem } from '../../services/itemsService'
import { projectOfflineChanges } from './offlineCache'

const baseRow: CategorySummaryItem = {
  table_name: 'consumables', category_name: 'مستهلكات', item_id: 1,
  item_key: 'consumables::project::item', project_name: 'project',
  item_name: 'item', stock_balance: 10, min_quantity: 2, status: 'آمن',
  total_added: 10, total_issued: 0, source_rows_count: 1,
  updated_at: null, created_at: null,
}

function operation(overrides: Partial<OfflineOperation>): OfflineOperation {
  return {
    id: crypto.randomUUID(), requestId: crypto.randomUUID(), tableName: 'consumables', itemId: '1',
    localItemId: null, operationType: 'add', quantity: 0, payload: {},
    status: 'pending', errorMessage: null, createdAt: new Date().toISOString(),
    syncedAt: null, ...overrides,
  }
}

describe('projectOfflineChanges', () => {
  it('applies queued stock operations in order', () => {
    const rows = projectOfflineChanges([baseRow], [], [
      operation({ operationType: 'add', quantity: 5 }),
      operation({ operationType: 'issue', quantity: 3 }),
      operation({ operationType: 'adjust', quantity: 20 }),
    ])
    expect(rows[0].stock_balance).toBe(20)
    expect(rows[0].offline_state).toBe('pending')
  })

  it('projects local items and edits after a refresh', () => {
    const item: OfflineItem = {
      localId: 'local-1', requestId: 'item-request-1', serverId: null, tableName: 'consumables',
      internalCode: 'TEMP-CO-1', itemName: 'local item', project: 'project',
      materialSource: null, payload: { item_name: 'local item', stock_balance: 4 },
      status: 'pending', errorMessage: null, createdAt: new Date().toISOString(),
      syncedAt: null,
    }
    const rows = projectOfflineChanges([], [item], [operation({
      itemId: null, localItemId: 'local-1', operationType: 'edit_item',
      quantity: null, payload: { item_name: 'edited item' },
    })])
    expect(rows[0]).toMatchObject({ item_id: 'local-1', item_name: 'edited item', stock_balance: 4 })
  })
})
