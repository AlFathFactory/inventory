import { describe, expect, it } from 'vitest'
import { dynamicCategoryKeys } from '../features/dynamic-categories/dynamicCategoryQueries'
import { inventoryKeys } from '../features/inventory/inventoryQueryKeys'
import { projectKeys } from '../features/projects/projectQueries'
import { getInvalidationTargetsForEventKey } from './useInventoryRealtime'

describe('getInvalidationTargetsForEventKey', () => {
  it('invalidates only the legacy category and alerts keys for a legacy table event', () => {
    expect(getInvalidationTargetsForEventKey('inventory:consumables')).toEqual([
      inventoryKeys.category('consumables'),
      inventoryKeys.alerts(),
    ])
  })

  it('invalidates the dynamic query families for a dynamic-inventory event, and nothing legacy-specific', () => {
    const targets = getInvalidationTargetsForEventKey('dynamic-inventory')

    expect(targets).toEqual([
      inventoryKeys.alerts(),
      dynamicCategoryKeys.all,
      dynamicCategoryKeys.detailRoot,
      dynamicCategoryKeys.itemsListRoot,
      dynamicCategoryKeys.itemRoot,
      dynamicCategoryKeys.movementsRoot,
    ])
    expect(targets).not.toContainEqual(inventoryKeys.category('inventory_items'))
  })

  it('invalidates project keys for a projects event', () => {
    expect(getInvalidationTargetsForEventKey('projects')).toEqual([projectKeys.all])
  })

  it('invalidates nothing for an unrecognized key', () => {
    expect(getInvalidationTargetsForEventKey('imports')).toEqual([])
  })
})
