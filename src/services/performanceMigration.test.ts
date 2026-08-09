import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('dashboard, realtime, and offline idempotency migration', () => {
  const sql = readFileSync(
    'supabase/migrations/20260809104141_optimize_dashboard_realtime_and_offline_idempotency.sql',
    'utf8',
  )
  const trimmedSql = readFileSync(
    'supabase/migrations/20260809104358_trim_dashboard_payload.sql',
    'utf8',
  )

  it('keeps the dashboard envelope while projecting explicit fields', () => {
    expect(sql).toContain('get_inventory_dashboard_summary_rpc()')
    expect(sql).toContain("'category_counts'")
    expect(sql).toContain("'inventory_rows'")
    expect(sql).toContain('jsonb_strip_nulls(jsonb_build_object')
    expect(sql).not.toContain('to_jsonb(r)')
    expect(sql).toContain('security invoker')
  })

  it('adds every shared-data table to Realtime idempotently', () => {
    expect(sql).toContain("pubname = 'supabase_realtime'")
    expect(sql).toContain("'projects', 'imports'")
    expect(sql).toContain('alter publication supabase_realtime add table')
  })

  it('keeps the dashboard envelope after removing non-rendered movement fields', () => {
    expect(trimmedSql).toContain("'category_counts'")
    expect(trimmedSql).toContain("'inventory_rows'")
    expect(trimmedSql).not.toContain("'added', r.added")
    expect(trimmedSql).not.toContain("'issued', r.issued")
    expect(trimmedSql).not.toContain("'created_at', r.created_at")
  })

  it('deduplicates offline item creation by its stable request ID', () => {
    expect(sql).toContain('inventory_item_creation_requests')
    expect(sql).toContain("'already_processed'")
    expect(sql).toContain("'inventory-item-create:' || v_request_id")
  })
})
