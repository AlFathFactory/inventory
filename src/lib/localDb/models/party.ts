/** Mirrors the Supabase `projects` table. */
export interface LocalProject {
  id: string
  name: string
  code: string | null
  status: string | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

/** Mirrors the Supabase `employees` table (issue recipients). */
export interface LocalEmployee {
  id: string
  name: string
  employee_code: string | null
  department: string | null
  phone: string | null
  notes: string | null
  is_active: number
  created_at: string | null
  updated_at: string | null
}

/** Mirrors the Supabase `suppliers` table (addition sources). */
export interface LocalSupplier {
  id: string
  name: string
  supplier_code: string | null
  phone: string | null
  contact_person: string | null
  notes: string | null
  is_active: number
  created_at: string | null
  updated_at: string | null
}
