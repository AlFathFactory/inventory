import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('inventory report search normalization migration', () => {
  const sql = readFileSync(
    'supabase/migrations/20260819000100_normalize_inventory_report_search.sql',
    'utf8',
  )

  it('normalizes both report search input and searchable database values', () => {
    expect(sql).toContain('normalize_inventory_search_term(p_search)')
    expect(sql).toContain('normalize_inventory_search_term(')
    expect(sql).toContain("'[[:space:]]+'")
    expect(sql).toContain('pg_catalog.strpos(')
  })

  it('does not reintroduce a raw ilike prefilter', () => {
    expect(sql.toLocaleLowerCase('en')).not.toContain('ilike')
  })
})
