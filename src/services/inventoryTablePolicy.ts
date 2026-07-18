/**
 * The only inventory tables the browser is allowed to address. Keeping this
 * policy independent from UI configuration prevents values restored from
 * IndexedDB, URLs, or imports from becoming arbitrary Supabase table names.
 */
export const stockInventoryTables = [
  'consumables',
  'paints',
  'screws',
  'stock_screws',
  'raw_materials',
  'cylinders',
] as const

export const custodyInventoryTables = [
  'cutting_discs',
  'long_welding_gloves',
] as const

export const inventoryTables = [
  ...stockInventoryTables,
  ...custodyInventoryTables,
] as const

export type StockInventoryTable = typeof stockInventoryTables[number]
export type CustodyInventoryTable = typeof custodyInventoryTables[number]
export type InventoryTable = typeof inventoryTables[number]

export function isStockInventoryTable(tableName: string): tableName is StockInventoryTable {
  return (stockInventoryTables as readonly string[]).includes(tableName)
}

export function isCustodyInventoryTable(tableName: string): tableName is CustodyInventoryTable {
  return (custodyInventoryTables as readonly string[]).includes(tableName)
}

export function isInventoryTable(tableName: string): tableName is InventoryTable {
  return isStockInventoryTable(tableName) || isCustodyInventoryTable(tableName)
}
