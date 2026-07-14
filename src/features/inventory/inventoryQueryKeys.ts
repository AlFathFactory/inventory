import type { CustodyTableName } from '../../services/itemsService'

export const inventoryKeys = {
  all: ['inventory'] as const,
  dashboard: () => ['inventory', 'dashboard'] as const,
  category: (tableName: string) =>
    ['inventory', 'category', tableName] as const,
  item: (tableName: string, itemId: string) =>
    ['inventory', 'item', tableName, itemId] as const,
  movements: (tableName: string, itemId: string) =>
    ['inventory', 'movements', tableName, itemId] as const,
  custody: (tableName: CustodyTableName) =>
    ['inventory', 'custody', tableName] as const,
  custodyItem: (tableName: CustodyTableName, itemId: string) =>
    ['inventory', 'custody', tableName, itemId] as const,
  alerts: () => ['inventory', 'alerts'] as const,
}
