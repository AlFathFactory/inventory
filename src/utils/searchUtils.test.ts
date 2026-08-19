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

  it.each([
    ['مسمار20*80'],
    ['مسمار      20    *'],
  ])('ignores spacing differences in inventory dimensions: %s', (query) => {
    expect(
      includesSearchTerm('مسمار 20 * 80', normalizeSearchTerm(query)),
    ).toBe(true)
  })

  it('normalizes Arabic and Persian digits to western digits', () => {
    expect(normalizeSearchTerm('مسمار ٢٠ * ۸۰')).toBe('مسمار20*80')
  })

  it.each([
    ['طاقيه', 'طاقية'],
    ['طاقية', 'طاقيه'],
    ['على', 'علي'],
    ['علي', 'على'],
  ])('matches Arabic letter variants in both directions: %s / %s', (query, value) => {
    expect(includesSearchTerm(value, normalizeSearchTerm(query))).toBe(true)
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
