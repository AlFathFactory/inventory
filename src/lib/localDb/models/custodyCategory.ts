/**
 * Custody category tables, mirroring their Supabase counterparts exactly as
 * `get_inventory_sync_delta_rpc` returns them. The two shapes differ on
 * purpose and are not merged into a shared base: only cutting discs carry a
 * code and a scrap date, only gloves carry a quantity and an archive flag.
 */

/** Mirrors the Supabase `cutting_discs` table (صواريخ). */
export interface LocalCuttingDisc {
  id: string
  code: string | null
  type_name: string | null
  received_by: string | null
  received_date: string | null
  scrapped_date: string | null
  source_file: string | null
  source_sheet: string | null
  created_at: string | null
  updated_at: string | null
  notes: string | null
  internal_code: string | null
  supplier_name: string | null
}

/** Mirrors the Supabase `long_welding_gloves` table (جوانتي لحام طويل). */
export interface LocalLongWeldingGlove {
  id: string
  type_name: string | null
  received_by: string | null
  received_date: string | null
  source_file: string | null
  source_sheet: string | null
  created_at: string | null
  updated_at: string | null
  quantity: number | null
  notes: string | null
  /** SQLite has no boolean type; stored as 0/1. */
  is_archived: number | null
  internal_code: string | null
  supplier_name: string | null
}
