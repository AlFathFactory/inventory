import { describe, expect, it } from 'vitest'
import {
  includesSearchTerm,
  matchesAnySearchValue,
  normalizeSearchTerm,
} from './searchUtils'

describe('searchUtils', () => {
  it('normalizes surrounding whitespace and letter case', () => {
    expect(normalizeSearchTerm('  RM-KH  ')).toBe('rm-kh')
  })

  it('matches values case-insensitively and handles null values', () => {
    expect(includesSearchTerm('Main Store', 'store')).toBe(true)
    expect(includesSearchTerm(null, 'store')).toBe(false)
  })

  it('matches any supplied value and treats an empty search as a match', () => {
    expect(matchesAnySearchValue(['RM-001', 'Raw material'], 'raw')).toBe(true)
    expect(matchesAnySearchValue(['RM-001'], '')).toBe(true)
  })
})
