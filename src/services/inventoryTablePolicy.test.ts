import { describe, expect, it } from 'vitest'
import {
  isCustodyInventoryTable,
  isInventoryTable,
  isStockInventoryTable,
} from './inventoryTablePolicy'

describe('inventory table policy', () => {
  it('only accepts configured inventory tables', () => {
    expect(isInventoryTable('raw_materials')).toBe(true)
    expect(isInventoryTable('cutting_discs')).toBe(true)
    expect(isInventoryTable('projects')).toBe(false)
  })

  it('keeps custody tables out of stock operations', () => {
    expect(isStockInventoryTable('cylinders')).toBe(true)
    expect(isStockInventoryTable('long_welding_gloves')).toBe(false)
    expect(isCustodyInventoryTable('long_welding_gloves')).toBe(true)
  })
})
