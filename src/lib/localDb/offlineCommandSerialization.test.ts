import { describe, expect, it } from 'vitest'
import type { OfflineCommandPayload } from './models/offlineCommand'
import {
  parseCanonicalPayload,
  serializeCanonicalPayload,
} from './offlineCommandSerialization'

describe('offline command payload serialization', () => {
  it('sorts object keys recursively while preserving array order', () => {
    expect(serializeCanonicalPayload({
      z: 1,
      a: [{ y: 2, x: 1 }, 'last'],
    })).toBe('{"a":[{"x":1,"y":2},"last"],"z":1}')
  })

  it('round-trips canonical object payloads', () => {
    const serialized = '{"a":true,"nested":{"a":null,"b":2}}'
    expect(parseCanonicalPayload(serialized)).toEqual({
      a: true,
      nested: { a: null, b: 2 },
    })
  })

  it('rejects non-canonical and non-JSON values', () => {
    expect(() => parseCanonicalPayload('{"z":1,"a":2}')).toThrow(/canonical/i)
    expect(() => serializeCanonicalPayload({ value: Number.NaN })).toThrow(/finite/i)
    expect(() => serializeCanonicalPayload({ value: undefined } as unknown as OfflineCommandPayload))
      .toThrow(/cannot represent/i)
  })
})
