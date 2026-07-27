import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ToastOnChange } from '../components/ToastProvider'
import {
  createProject,
  setProjectStatus,
  updateProject,
  type Project,
  type ProjectStatus,
} from '../services/projectsService'
import {
  projectKeys,
  projectsQueryOptions,
  unregisteredProjectsQueryOptions,
  usedProjectNamesQueryOptions,
} from '../features/projects/projectQueries'

type ProjectFormState = {
  name: string
  code: string
  status: ProjectStatus
  notes: string
}

const emptyForm: ProjectFormState = {
  name: '',
  code: '',
  status: 'active',
  notes: '',
}

function statusLabel(status: ProjectStatus) {
  return status === 'active' ? 'نشط' : 'غير نشط'
}

export function ProjectsPage() {
  const queryClient = useQueryClient()
  const projectsQuery = useQuery(projectsQueryOptions)
  const unregisteredQuery = useQuery(unregisteredProjectsQueryOptions)
  const usedProjectNamesQuery = useQuery(usedProjectNamesQueryOptions)
  const [searchTerm, setSearchTerm] = useState('')
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [form, setForm] = useState<ProjectFormState>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [pendingName, setPendingName] = useState<string | null>(null)
  const usedProjectNames = useMemo(() => new Set(usedProjectNamesQuery.data ?? []), [usedProjectNamesQuery.data])
  const editingProjectIsUsed = editingProject ? usedProjectNames.has(editingProject.name) : false

  const filteredProjects = useMemo(() => {
    const search = searchTerm.trim().toLowerCase()
    if (!search) return projectsQuery.data ?? []
    return (projectsQuery.data ?? []).filter((project) =>
      [project.name, project.code, project.notes, statusLabel(project.status)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search)),
    )
  }, [projectsQuery.data, searchTerm])

  async function refreshProjects() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: projectKeys.all }),
      queryClient.invalidateQueries({ queryKey: projectKeys.active }),
      queryClient.invalidateQueries({ queryKey: projectKeys.unregistered }),
      queryClient.invalidateQueries({ queryKey: projectKeys.used }),
    ])
  }

  function openCreate(name = '') {
    setEditingProject(null)
    setForm({ ...emptyForm, name })
    setFormError(null)
    setIsFormOpen(true)
  }

  function openEdit(project: Project) {
    setEditingProject(project)
    setForm({
      name: project.name,
      code: project.code ?? '',
      status: project.status,
      notes: project.notes ?? '',
    })
    setFormError(null)
    setIsFormOpen(true)
  }

  async function saveProject() {
    if (!form.name.trim()) {
      setFormError('اسم القسم مطلوب')
      return
    }

    setIsSaving(true)
    setFormError(null)
    const result = editingProject
      ? await updateProject(editingProject.id, form)
      : await createProject(form)
    setIsSaving(false)

    if (result.error) {
      setFormError(result.error)
      return
    }

    setIsFormOpen(false)
    setEditingProject(null)
    setForm(emptyForm)
    await refreshProjects()
    setMessage({ text: editingProject ? 'تم تعديل القسم بنجاح' : 'تمت إضافة القسم بنجاح', type: 'success' })
  }

  async function toggleStatus(project: Project) {
    const nextStatus: ProjectStatus = project.status === 'active' ? 'inactive' : 'active'
    if (nextStatus === 'inactive' && !window.confirm(`هل تريد إلغاء تنشيط القسم «${project.name}»؟`)) return

    setPendingName(project.name)
    setMessage(null)
    const result = await setProjectStatus(project.id, nextStatus)
    setPendingName(null)
    if (result.error) {
      setMessage({ text: result.error, type: 'error' })
      return
    }
    await refreshProjects()
    setMessage({ text: nextStatus === 'active' ? 'تم تنشيط القسم' : 'تم إلغاء تنشيط القسم', type: 'success' })
  }

  async function addImportedName(name: string) {
    setPendingName(name)
    setMessage(null)
    const result = await createProject({ name, status: 'active' })
    setPendingName(null)
    if (result.error) {
      setMessage({ text: result.error, type: 'error' })
      return
    }
    await refreshProjects()
    setMessage({ text: `تمت إضافة القسم «${name}»`, type: 'success' })
  }

  const queryError = projectsQuery.error instanceof Error
    ? projectsQuery.error.message
    : unregisteredQuery.error instanceof Error
      ? unregisteredQuery.error.message
      : usedProjectNamesQuery.error instanceof Error
        ? usedProjectNamesQuery.error.message
      : null

  return (
    <section dir="rtl" className="space-y-6">
      <div className="flex flex-col gap-4 rounded-[28px] border border-[var(--app-border)] bg-white p-6 shadow-[var(--app-shadow)] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">إدارة الأقسام</h2>
          <p className="mt-1 text-sm text-slate-500">أضف الأقسام وعدّلها لتوحيد أسمائها في جميع نماذج المخزون.</p>
        </div>
        <button type="button" onClick={() => openCreate()} className="h-[44px] rounded-2xl bg-[var(--app-primary)] px-5 text-sm font-bold text-white hover:bg-[var(--app-primary-strong)]">
          + إضافة سجل جديد
        </button>
      </div>

      <ToastOnChange message={message?.text ?? null} type={message?.type} />
      {queryError ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{queryError}</div> : null}

      <div className="rounded-[28px] border border-[var(--app-border)] bg-white p-5 shadow-[var(--app-shadow)]">
        <label className="block max-w-xl space-y-2">
          <span className="text-sm font-semibold text-slate-700">بحث الأقسام</span>
          <input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="ابحث بالاسم أو الكود أو الحالة" className="h-[44px] w-full rounded-2xl border border-[var(--app-border)] px-4 text-sm outline-none focus:border-[var(--app-primary)]" />
        </label>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-right text-sm">
            <thead className="bg-slate-50 text-slate-700"><tr><th className="px-4 py-3">اسم القسم</th><th className="px-4 py-3">كود القسم</th><th className="px-4 py-3">الحالة</th><th className="px-4 py-3">ملاحظات</th><th className="px-4 py-3">الإجراءات</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProjects.map((project) => (
                <tr key={project.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-900"><span>{project.name}</span>{usedProjectNames.has(project.name) ? <span className="mr-2 rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">مستخدم</span> : null}</td>
                  <td className="px-4 py-3">{project.code || '—'}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${project.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{statusLabel(project.status)}</span></td>
                  <td className="max-w-xs px-4 py-3 text-slate-600">{project.notes || '—'}</td>
                  <td className="px-4 py-3"><div className="flex gap-2"><button type="button" onClick={() => openEdit(project)} className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">تعديل</button><button type="button" disabled={pendingName === project.name} onClick={() => void toggleStatus(project)} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50">{project.status === 'active' ? 'إلغاء التنشيط' : 'تنشيط'}</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!projectsQuery.isPending && filteredProjects.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">لا توجد سجلات مطابقة</p> : null}
          {projectsQuery.isPending ? <p className="py-10 text-center text-sm text-slate-500">جاري تحميل الأقسام...</p> : null}
        </div>
      </div>

      <div className="rounded-[28px] border border-amber-200 bg-amber-50/60 p-5 shadow-[var(--app-shadow)]">
        <h3 className="text-lg font-bold text-slate-900">سجلات موجودة في الأصناف ولم يتم تسجيلها</h3>
        <p className="mt-1 text-sm text-slate-600">راجع الأسماء المستوردة من Excel وأضف الأسماء الصحيحة فقط.</p>
        {unregisteredQuery.isPending ? <p className="mt-5 text-sm text-slate-500">جاري فحص الأصناف...</p> : null}
        {!unregisteredQuery.isPending && (unregisteredQuery.data?.length ?? 0) === 0 ? <p className="mt-5 text-sm text-slate-500">لا توجد أسماء غير مسجلة.</p> : null}
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {(unregisteredQuery.data ?? []).map((name) => (
            <div key={name} className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-white p-4">
              <span className="font-semibold text-slate-800">{name}</span>
              <button type="button" disabled={pendingName === name} onClick={() => void addImportedName(name)} className="rounded-xl bg-amber-100 px-3 py-2 text-xs font-bold text-amber-800 disabled:opacity-50">إضافة إلى الأقسام</button>
            </div>
          ))}
        </div>
      </div>

      {isFormOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6">
          <div className="max-h-full w-full max-w-xl overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between"><h3 className="text-xl font-bold text-slate-900">{editingProject ? 'تعديل القسم' : 'إضافة قسم جديد'}</h3><button type="button" onClick={() => setIsFormOpen(false)} aria-label="إغلاق" className="h-10 w-10 rounded-full bg-slate-100 text-xl">×</button></div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <ProjectField label="اسم القسم *"><input autoFocus value={form.name} disabled={editingProjectIsUsed} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="h-[44px] w-full rounded-2xl border border-[var(--app-border)] px-4 text-sm disabled:bg-slate-50 disabled:text-slate-500" />{editingProjectIsUsed ? <p className="text-xs text-amber-700">الأقسام المستخدمة لا يمكن تغيير أسمائها للحفاظ على سلامة بيانات الأصناف والحركات.</p> : null}</ProjectField>
              <ProjectField label="كود القسم (اختياري)"><input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} className="h-[44px] w-full rounded-2xl border border-[var(--app-border)] px-4 text-sm" /></ProjectField>
              <ProjectField label="الحالة"><select value={form.status} disabled={!editingProject} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as ProjectStatus }))} className="h-[44px] w-full rounded-2xl border border-[var(--app-border)] bg-white px-4 text-sm disabled:bg-slate-50"><option value="active">نشط</option><option value="inactive">غير نشط</option></select></ProjectField>
              <ProjectField label="ملاحظات" wide><textarea rows={3} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className="w-full rounded-2xl border border-[var(--app-border)] px-4 py-3 text-sm" /></ProjectField>
            </div>
            {formError ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</p> : null}
            {editingProjectIsUsed ? <button type="button" onClick={() => openCreate()} className="mt-5 text-sm font-bold text-[var(--app-primary)] hover:underline">إنشاء سجل جديد بدلًا منه</button> : null}
            <div className="mt-6 flex gap-3"><button type="button" onClick={() => setIsFormOpen(false)} className="h-[44px] rounded-2xl px-5 text-sm font-bold text-slate-700">إلغاء</button><button type="button" disabled={isSaving} onClick={() => void saveProject()} className="h-[44px] rounded-2xl bg-[var(--app-primary)] px-6 text-sm font-bold text-white disabled:opacity-50">{isSaving ? 'جاري الحفظ...' : 'حفظ'}</button></div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function ProjectField({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={`space-y-2 ${wide ? 'sm:col-span-2' : ''}`}><span className="block text-sm font-semibold text-slate-700">{label}</span>{children}</label>
}
