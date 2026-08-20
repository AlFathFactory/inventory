import { describe, expect, it } from 'vitest'
import { applyInventoryItemCreateMetadata, type JsonValue } from './inventoryService'

describe('applyInventoryItemCreateMetadata', () => {
  it('adds both Paint dates to the create RPC payload', () => {
    const payload: Record<string, JsonValue> = {}

    applyInventoryItemCreateMetadata(payload, 'paints', {
      production_date: '2026-08-01',
      expire_date: '2027-08-01',
    })

    expect(payload).toEqual({
      production_date: '2026-08-01',
      expire_date: '2027-08-01',
    })
  })

  it('sends null for empty optional Paint dates', () => {
    const payload: Record<string, JsonValue> = {}

    applyInventoryItemCreateMetadata(payload, 'paints', {
      production_date: '',
      expire_date: '',
    })

    expect(payload).toEqual({ production_date: null, expire_date: null })
  })

  it('does not add Paint dates to unrelated inventory payloads', () => {
    const payload: Record<string, JsonValue> = {}

    applyInventoryItemCreateMetadata(payload, 'consumables', {
      production_date: '2026-08-01',
      expire_date: '2027-08-01',
    })

    expect(payload).toEqual({})
  })
})
