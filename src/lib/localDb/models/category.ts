/** Mirrors the Supabase `categories` table (dynamic-category registry). */
export interface LocalCategory {
  id: string
  name: string
  slug: string | null
  parent_id: string | null
  is_archived: number | null
  created_at: string | null
  updated_at: string | null
  code_prefix: string | null
}
