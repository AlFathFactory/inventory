import { describe, expect, it } from 'vitest'
import { getExpiryAlertStatus } from './expiryStatus'

const today = new Date(2026, 6, 14, 12)

describe('getExpiryAlertStatus', () => {
  it('marks dates before today as expired', () => {
    expect(getExpiryAlertStatus('2026-07-13', today)).toBe('expired')
  })

  it('marks today and the next 30 days as expiring', () => {
    expect(getExpiryAlertStatus('2026-07-14', today)).toBe('expiring')
    expect(getExpiryAlertStatus('2026-08-13', today)).toBe('expiring')
  })

  it('ignores later, empty, and invalid dates', () => {
    expect(getExpiryAlertStatus('2026-08-14', today)).toBeNull()
    expect(getExpiryAlertStatus('', today)).toBeNull()
    expect(getExpiryAlertStatus('2026-02-30', today)).toBeNull()
  })
})
