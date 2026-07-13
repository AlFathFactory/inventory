import { describe, expect, it } from 'vitest'
import { getLocalDateString } from './dateUtils'

describe('getLocalDateString', () => {
  it('uses local calendar fields rather than the UTC ISO date', () => {
    const date = new Date(2026, 6, 13, 0, 30)
    const expected = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-')

    expect(getLocalDateString(date)).toBe(expected)
  })

  it('pads single-digit months and days', () => {
    expect(getLocalDateString(new Date(2026, 0, 2, 12))).toBe('2026-01-02')
  })
})
