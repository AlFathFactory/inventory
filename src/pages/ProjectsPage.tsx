import { useEffect, useState } from 'react'

type ProjectStatus = 'نشط' | 'مغلق'

type ProjectRecord = {
  id: string
  name: string
  code: string
  status: ProjectStatus
  itemCount: number
  updatedAt: string
  notes: string
}

type ProjectFormValues = {
  name: string
  code: string
  status: ProjectStatus
  notes: string
}

const initialProjects: ProjectRecord[] = [
  {
    id: 'PRJ-001',
    name: 'مشروع A',
    code: 'PRJ-001',
    status: 'نشط',
    itemCount: 124,
    updatedAt: '09/07',
    notes: 'توريدات المرحلة الأولى للمخزن الرئيسي.',
  },
  {
    id: 'PRJ-002',
    name: 'مشروع B',
    code: 'PRJ-002',
    status: 'نشط',
    itemCount: 88,
    updatedAt: '08/07',
    notes: 'متابعة احتياج الدهانات والمسامير أسبوعيًا.',
  },
  {
    id: 'PRJ-003',
    name: 'مشروع C',
    code: 'PRJ-003',
    status: 'مغلق',
    itemCount: 42,
    updatedAt: '01/07',
    notes: 'تم إغلاق المشروع بعد تسليم آخر دفعة.',
  },
]

const emptyFormValues: ProjectFormValues = {
  name: '',
  code: '',
  status: 'نشط',
  notes: '',
}

function mapProjectToFormValues(project: ProjectRecord): ProjectFormValues {
  return {
    name: project.name,
    code: project.code,
    status: project.status,
    notes: project.notes,
  }
}

export function ProjectsPage() {
  const [projects, setProjects] = useState(initialProjects)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    initialProjects[0]?.id ?? null,
  )
  const [formValues, setFormValues] = useState<ProjectFormValues>(
    initialProjects[0] ? mapProjectToFormValues(initialProjects[0]) : emptyFormValues,
  )

  const filteredProjects = projects.filter((project) => {
    const normalizedSearchTerm = searchTerm.trim().toLowerCase()

    if (!normalizedSearchTerm) {
      return true
    }

    return [project.name, project.code, project.status].some((value) =>
      value.toLowerCase().includes(normalizedSearchTerm),
    )
  })

  useEffect(() => {
    if (!selectedProjectId) {
      return
    }

    const selectedProject = projects.find((project) => project.id === selectedProjectId)

    if (!selectedProject) {
      return
    }

    setFormValues(mapProjectToFormValues(selectedProject))
  }, [projects, selectedProjectId])

  const handleSelectProject = (project: ProjectRecord) => {
    setSelectedProjectId(project.id)
    setFormValues(mapProjectToFormValues(project))
  }

  const handleCreateProject = () => {
    setSelectedProjectId(null)
    setFormValues(emptyFormValues)
  }

  const handleDeleteProject = (projectId: string) => {
    setProjects((currentProjects) =>
      currentProjects.filter((currentProject) => currentProject.id !== projectId),
    )

    if (selectedProjectId === projectId) {
      setSelectedProjectId(null)
      setFormValues(emptyFormValues)
    }
  }

  const handleUpdateField = <Key extends keyof ProjectFormValues>(
    field: Key,
    value: ProjectFormValues[Key],
  ) => {
    setFormValues((currentValues) => ({
      ...currentValues,
      [field]: value,
    }))
  }

  const handleSaveProject = () => {
    const trimmedName = formValues.name.trim()
    const trimmedCode = formValues.code.trim()

    if (!trimmedName || !trimmedCode) {
      return
    }

    setProjects((currentProjects) => {
      const existingProjectIndex = currentProjects.findIndex(
        (project) => project.id === selectedProjectId,
      )
      const nextProject: ProjectRecord = {
        id: selectedProjectId ?? trimmedCode,
        name: trimmedName,
        code: trimmedCode,
        status: formValues.status,
        notes: formValues.notes.trim(),
        itemCount:
          existingProjectIndex >= 0 ? currentProjects[existingProjectIndex].itemCount : 0,
        updatedAt: 'اليوم',
      }

      if (existingProjectIndex >= 0) {
        const updatedProjects = [...currentProjects]
        updatedProjects[existingProjectIndex] = nextProject
        return updatedProjects
      }

      return [nextProject, ...currentProjects]
    })

    setSelectedProjectId(trimmedCode)
  }

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <button
          type="button"
          onClick={handleCreateProject}
          className="inline-flex h-11 items-center justify-center rounded-[16px] bg-[var(--app-primary)] px-8 text-sm font-bold text-white transition hover:bg-blue-700"
        >
          إضافة مشروع
        </button>

        <label className="block w-full max-w-[320px]">
          <span className="sr-only">بحث عن مشروع</span>
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="بحث عن مشروع..."
            className="h-11 w-full rounded-[16px] border border-[var(--app-border)] bg-white px-5 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-slate-300"
          />
        </label>
      </div>

      <div className="overflow-hidden rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel)] shadow-[var(--app-shadow)]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-right">
            <thead className="bg-[var(--app-panel-soft)] text-sm font-semibold text-slate-800">
              <tr>
                <th className="px-6 py-4">اسم المشروع</th>
                <th className="px-6 py-4">الكود</th>
                <th className="px-6 py-4">الحالة</th>
                <th className="px-6 py-4">عدد الأصناف</th>
                <th className="px-6 py-4">آخر تحديث</th>
                <th className="px-6 py-4">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {filteredProjects.map((project) => (
                <tr
                  key={project.id}
                  className={selectedProjectId === project.id ? 'bg-blue-50/60' : undefined}
                >
                  <td className="px-6 py-4 font-medium text-slate-900">{project.name}</td>
                  <td className="px-6 py-4">{project.code}</td>
                  <td className="px-6 py-4">{project.status}</td>
                  <td className="px-6 py-4">{project.itemCount}</td>
                  <td className="px-6 py-4">{project.updatedAt}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-3 text-slate-700">
                      <button
                        type="button"
                        onClick={() => handleSelectProject(project)}
                        className="cursor-pointer transition hover:text-slate-950"
                      >
                        تعديل
                      </button>
                      <span className="text-slate-300">/</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteProject(project.id)}
                        className="cursor-pointer transition hover:text-red-600"
                      >
                        حذف
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredProjects.length ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-slate-500">
                    لا توجد مشاريع مطابقة لعبارة البحث الحالية.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-[30px] border border-[var(--app-border)] bg-[var(--app-panel)] px-5 py-7 shadow-[var(--app-shadow)] sm:px-8">
        <div className="mx-auto max-w-[780px]">
          <h2 className="text-right text-[2rem] font-bold tracking-tight text-slate-900">
            بيانات المشروع
          </h2>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="sr-only">اسم المشروع</span>
              <input
                type="text"
                value={formValues.name}
                onChange={(event) => handleUpdateField('name', event.target.value)}
                placeholder="اسم المشروع"
                className="h-11 w-full rounded-[16px] border border-[var(--app-border)] bg-white px-5 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-slate-300"
              />
            </label>

            <label className="block">
              <span className="sr-only">كود المشروع</span>
              <input
                type="text"
                value={formValues.code}
                onChange={(event) => handleUpdateField('code', event.target.value)}
                placeholder="كود المشروع"
                className="h-11 w-full rounded-[16px] border border-[var(--app-border)] bg-white px-5 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-slate-300"
              />
            </label>

            <label className="block">
              <span className="sr-only">الحالة</span>
              <select
                value={formValues.status}
                onChange={(event) =>
                  handleUpdateField('status', event.target.value as ProjectStatus)
                }
                className="h-11 w-full rounded-[16px] border border-[var(--app-border)] bg-white px-5 text-sm text-slate-700 outline-none focus:border-slate-300"
              >
                <option value="نشط">نشط</option>
                <option value="مغلق">مغلق</option>
              </select>
            </label>
          </div>

          <label className="mt-4 block">
            <span className="sr-only">ملاحظات</span>
            <textarea
              value={formValues.notes}
              onChange={(event) => handleUpdateField('notes', event.target.value)}
              placeholder="ملاحظات"
              rows={3}
              className="w-full rounded-[16px] border border-[var(--app-border)] bg-white px-5 py-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-slate-300"
            />
          </label>

          <div className="mt-6 flex justify-start">
            <button
              type="button"
              onClick={handleSaveProject}
              className="inline-flex h-11 min-w-[240px] items-center justify-center rounded-[16px] bg-[var(--app-primary)] px-8 text-sm font-bold text-white transition hover:bg-blue-700"
            >
              حفظ المشروع
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
