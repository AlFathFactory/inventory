import {
  getSupabaseConfigError,
  isSupabaseConfigured,
  supabaseClient,
} from '../lib/supabaseClient'

export type ProjectStatus = 'active' | 'inactive'

export type Project = {
  id: string | number
  name: string
  code: string | null
  status: ProjectStatus
  notes?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export type ProjectInput = {
  name: string
  code?: string | null
  status?: ProjectStatus
  notes?: string | null
}

export const usedProjectRenameMessage = 'لا يمكن تعديل اسم هذا القسم لأنه مرتبط بأصناف أو حركات مخزون. يمكنك إنشاء قسم جديد بالاسم الصحيح وإيقاف القسم القديم.'

type Result<T> = Promise<{ data: T; error: null } | { data: null; error: string }>

const itemProjectTables = [
  'consumables',
  'paints',
  'screws',
  'stock_screws',
  'raw_materials',
  'cylinders',
] as const

function unavailable<T>(): Result<T> {
  return Promise.resolve({ data: null, error: getSupabaseConfigError() })
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ar')
}

function projectError(error: { code?: string; message: string }) {
  if (error.code === 'P0001') return usedProjectRenameMessage
  return error.code === '23505'
    ? 'اسم القسم أو كود القسم مسجل بالفعل'
    : error.message
}

export async function getUsedProjectNames(): Result<string[]> {
  if (!isSupabaseConfigured || !supabaseClient) return unavailable()

  const { data, error } = await supabaseClient.rpc('get_used_project_names')
  if (error) return { data: null, error: error.message }

  return {
    data: (data ?? [])
      .map((row: { name?: string | null }) => String(row.name ?? ''))
      .filter(Boolean),
    error: null,
  }
}

export async function getProjects(): Result<Project[]> {
  if (!isSupabaseConfigured || !supabaseClient) return unavailable()
  const { data, error } = await supabaseClient
    .from('projects')
    .select('id, name, code, status, notes, created_at, updated_at')
    .order('name', { ascending: true })

  return error
    ? { data: null, error: error.message }
    : { data: (data ?? []) as Project[], error: null }
}

export async function getActiveProjects(): Result<Project[]> {
  if (!isSupabaseConfigured || !supabaseClient) return unavailable()
  const { data, error } = await supabaseClient
    .from('projects')
    .select('id, name, code, status')
    .eq('status', 'active')
    .order('name', { ascending: true })

  return error
    ? { data: null, error: error.message }
    : { data: (data ?? []) as Project[], error: null }
}

async function hasDuplicateProjectName(name: string, excludedId?: string | number) {
  const result = await getProjects()
  if (result.error) return { duplicate: false, error: result.error }
  const normalizedName = normalizeName(name)
  return {
    duplicate: (result.data ?? []).some((project) =>
      String(project.id) !== String(excludedId ?? '') &&
      normalizeName(project.name) === normalizedName,
    ),
    error: null,
  }
}

export async function createProject(values: ProjectInput): Result<Project> {
  if (!isSupabaseConfigured || !supabaseClient) return unavailable()
  const name = values.name.trim().replace(/\s+/g, ' ')
  if (!name) return { data: null, error: 'اسم القسم مطلوب' }

  const duplicate = await hasDuplicateProjectName(name)
  if (duplicate.error) return { data: null, error: duplicate.error }
  if (duplicate.duplicate) return { data: null, error: 'اسم القسم مسجل بالفعل' }

  const { data, error } = await supabaseClient
    .from('projects')
    .insert({
      name,
      code: values.code?.trim() || null,
      status: 'active',
      notes: values.notes?.trim() || null,
    })
    .select('id, name, code, status, notes, created_at, updated_at')
    .single()

  if (error) return { data: null, error: projectError(error) }
  return { data: data as Project, error: null }
}

export async function updateProject(
  id: string | number,
  values: ProjectInput,
): Result<Project> {
  if (!isSupabaseConfigured || !supabaseClient) return unavailable()
  const name = values.name.trim().replace(/\s+/g, ' ')
  if (!name) return { data: null, error: 'اسم القسم مطلوب' }

  const duplicate = await hasDuplicateProjectName(name, id)
  if (duplicate.error) return { data: null, error: duplicate.error }
  if (duplicate.duplicate) return { data: null, error: 'اسم القسم مسجل بالفعل' }

  const { data, error } = await supabaseClient
    .from('projects')
    .update({
      name,
      code: values.code?.trim() || null,
      status: values.status ?? 'active',
      notes: values.notes?.trim() || null,
    })
    .eq('id', id)
    .select('id, name, code, status, notes, created_at, updated_at')
    .single()

  if (error) return { data: null, error: projectError(error) }
  return { data: data as Project, error: null }
}

export async function setProjectStatus(
  id: string | number,
  status: ProjectStatus,
): Result<Project> {
  if (!isSupabaseConfigured || !supabaseClient) return unavailable()
  const { data, error } = await supabaseClient
    .from('projects')
    .update({ status })
    .eq('id', id)
    .select('id, name, code, status, notes, created_at, updated_at')
    .single()

  return error
    ? { data: null, error: error.message }
    : { data: data as Project, error: null }
}

async function getTableProjectNames(tableName: string): Promise<string[]> {
  const names: string[] = []
  const pageSize = 1000
  let offset = 0

  while (true) {
    const { data, error } = await supabaseClient!
      .from(tableName)
      .select('id, project')
      .not('project', 'is', null)
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (error) throw new Error(error.message)
    const page = (data ?? []) as Array<{ id: string | number; project: string | null }>
    names.push(...page.map((row) => row.project?.trim() ?? '').filter(Boolean))
    if (page.length < pageSize) return names
    offset += pageSize
  }
}

export async function getUnregisteredItemProjectNames(): Result<string[]> {
  if (!isSupabaseConfigured || !supabaseClient) return unavailable()

  try {
    const [projectsResult, tableNames] = await Promise.all([
      getProjects(),
      Promise.all(itemProjectTables.map(getTableProjectNames)),
    ])
    if (projectsResult.error) return { data: null, error: projectsResult.error }

    const registeredNames = new Set((projectsResult.data ?? []).map((project) => normalizeName(project.name)))
    const uniqueNames = new Map<string, string>()
    tableNames.flat().forEach((name) => {
      const normalized = normalizeName(name)
      if (normalized && !registeredNames.has(normalized) && !uniqueNames.has(normalized)) {
        uniqueNames.set(normalized, name.trim().replace(/\s+/g, ' '))
      }
    })

    return { data: [...uniqueNames.values()].sort((a, b) => a.localeCompare(b, 'ar')), error: null }
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'تعذر تحميل سجلات الأصناف الحالية',
    }
  }
}
