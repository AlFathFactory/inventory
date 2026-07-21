import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('idempotent inventory RPC migration', () => {
  const sql = readFileSync('supabase/migrations/20260721000100_make_offline_operations_idempotent.sql', 'utf8')

  it('deduplicates before and after FOR UPDATE and handles concurrent unique violations', () => {
    expect(sql).toContain("where import_key = p_request_id")
    expect(sql).toContain('for update')
    expect(sql).toContain('exception when unique_violation')
    expect(sql).toContain("'status', 'already_processed'")
  })

  it('updates the balance and records the movement in the same RPC transaction', () => {
    expect(sql).toContain('update public.%I set stock_balance')
    expect(sql).toContain('insert into public.inventory_operations')
    expect(sql).toContain("'status', 'success'")
  })
})
