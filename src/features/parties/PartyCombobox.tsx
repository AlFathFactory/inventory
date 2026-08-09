import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createParty, normalizePartyName, partyKeys, searchAvailableParties,
  type Employee, type Party, type PartyKind,
} from '../../services/partiesService'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'

type Props = {
  kind: PartyKind
  selectedId?: string | null
  selectedName?: string
  disabled?: boolean
  error?: string
  onInputChange?: (value: string) => void
  onSelect: (party: Party) => void
}

export function PartyCombobox({
  kind,
  selectedId,
  selectedName = '',
  disabled,
  error,
  onInputChange,
  onSelect,
}: Props) {
  const queryClient = useQueryClient()
  const { connectionState } = useNetworkStatus()
  const canCreate = connectionState === 'online'
  const [input, setInput] = useState(selectedName)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [creating, setCreating] = useState(false)
  const [hasSimilarMatches, setHasSimilarMatches] = useState(false)
  const [saving, setSaving] = useState(false)
  const [createError, setCreateError] = useState('')
  const [form, setForm] = useState({ name: '', code: '', department: '', phone: '', contactPerson: '', notes: '' })
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(normalizePartyName(input)), 300)
    return () => window.clearTimeout(timer)
  }, [input])
  useEffect(() => setInput(selectedName), [selectedName])
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const query = useQuery({
    queryKey: [...partyKeys.list(kind), search, connectionState],
    queryFn: () => searchAvailableParties(kind, search),
    enabled: open,
  })
  const options = query.data ?? []

  function choose(party: Party) {
    setInput(party.name)
    setOpen(false)
    onSelect(party)
  }

  function startCreate() {
    if (!canCreate) return
    setForm((current) => ({ ...current, name: normalizePartyName(input) }))
    setHasSimilarMatches(options.length > 0)
    setCreateError('')
    setOpen(false)
    setCreating(true)
  }

  async function submitCreate() {
    if (!normalizePartyName(form.name)) return setCreateError('الاسم مطلوب')
    setSaving(true)
    setCreateError('')
    try {
      const party = await createParty(kind, form)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: partyKeys.list(kind) }),
        queryClient.invalidateQueries({ queryKey: partyKeys.summary(kind) }),
      ])
      choose(party)
      setCreating(false)
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : 'تعذر حفظ السجل')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div ref={container} className="relative text-right">
        <input
          role="combobox" aria-expanded={open} aria-autocomplete="list"
          value={input} disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setInput(event.target.value)
            setOpen(true)
            onInputChange?.(event.target.value)
          }}
          onKeyDown={(event) => {
            const max = options.length + (search && canCreate ? 1 : 0)
            if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((value) => Math.min(value + 1, Math.max(0, max - 1))) }
            if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((value) => Math.max(value - 1, 0)) }
            if (event.key === 'Enter' && open) {
              event.preventDefault()
              if (activeIndex < options.length) choose(options[activeIndex])
              else if (search && canCreate) startCreate()
            }
            if (event.key === 'Escape') setOpen(false)
          }}
          className={`h-[46px] w-full rounded-2xl border bg-white px-4 text-sm outline-none ${error ? 'border-red-300' : 'border-[var(--app-border)] focus:border-[var(--app-primary)]'}`}
          placeholder={kind === 'employee' ? 'ابحث عن الموظف بالاسم أو الكود أو القسم' : 'ابحث عن المورد بالاسم أو الكود أو الهاتف'}
        />
        {open ? (
          <div role="listbox" className="absolute z-[70] mt-2 max-h-64 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
            {query.isPending ? <div className="animate-pulse p-3 text-sm text-slate-500">جارٍ البحث...</div> : null}
            {query.isError ? <div className="p-3 text-sm text-red-600">تعذر تحميل النتائج</div> : null}
            {!query.isPending && options.map((party, index) => (
              <button key={party.id} type="button" role="option" onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(party)}
                className={`w-full rounded-xl px-3 py-2 text-right ${activeIndex === index ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                <div className="font-semibold text-slate-900">{party.name}</div>
                <div className="text-xs text-slate-500">
                  {kind === 'employee'
                    ? [party.department, party.employee_code].filter(Boolean).join(' • ')
                    : [party.contact_person, party.supplier_code].filter(Boolean).join(' • ')}
                </div>
              </button>
            ))}
            {!query.isPending && search && canCreate ? (
              <button type="button" onMouseEnter={() => setActiveIndex(options.length)} onClick={startCreate}
                className={`w-full rounded-xl px-3 py-2 text-right font-semibold text-blue-700 ${activeIndex === options.length ? 'bg-blue-50' : ''}`}>
                إضافة {kind === 'employee' ? 'موظف' : 'مورد'} جديد باسم &quot;{search}&quot;
              </button>
            ) : null}
            {!query.isPending && !canCreate ? <div className="p-3 text-xs font-semibold text-amber-700">يمكن الاختيار من البيانات المحفوظة فقط. أعد الاتصال لتسجيل موظف أو مورد جديد.</div> : null}
            {!query.isPending && !search && options.length === 0 ? <div className="p-3 text-sm text-slate-500">ابدأ الكتابة للبحث</div> : null}
          </div>
        ) : null}
        {selectedId ? <p className="mt-1 text-xs text-emerald-700">تم اختيار سجل مرتبط</p> : null}
        {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
      </div>

      {creating ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4" dir="rtl">
          <div className="w-full max-w-lg rounded-[28px] bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-bold">إضافة {kind === 'employee' ? 'موظف' : 'مورد'} جديد</h3>
            {hasSimilarMatches ? (
              <p className="mt-1 text-sm text-amber-700">يوجد اسم مشابه بالفعل. راجع النتائج أولًا، أو أكّد إنشاء سجل جديد.</p>
            ) : null}
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="الاسم *" className="rounded-xl border p-3" />
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="الكود" className="rounded-xl border p-3" />
              {kind === 'employee'
                ? <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="القسم" className="rounded-xl border p-3" />
                : <input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} placeholder="مسؤول التواصل" className="rounded-xl border p-3" />}
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="الهاتف" className="rounded-xl border p-3" />
            </div>
            {createError ? <p className="mt-3 text-sm text-red-600">{createError}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button disabled={saving} onClick={() => setCreating(false)} className="rounded-xl border px-4 py-2">إلغاء</button>
              <button disabled={saving} onClick={() => void submitCreate()} className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-50">
                {saving ? 'جارٍ الحفظ...' : 'تأكيد إنشاء السجل'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

type MultiEmployee = Pick<Employee, 'id' | 'name' | 'employee_code' | 'department'>

type MultiEmployeeProps = {
  selected: MultiEmployee[]
  disabled?: boolean
  error?: string
  onChange: (employees: MultiEmployee[]) => void
}

export function MultiEmployeeCombobox({ selected, disabled, error, onChange }: MultiEmployeeProps) {
  const queryClient = useQueryClient()
  const { connectionState } = useNetworkStatus()
  const canCreate = connectionState === 'online'
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [createError, setCreateError] = useState('')
  const [form, setForm] = useState({ name: '', code: '', department: '', phone: '', notes: '' })
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(normalizePartyName(input)), 300)
    return () => window.clearTimeout(timer)
  }, [input])
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const query = useQuery({
    queryKey: [...partyKeys.list('employee'), 'multi', search, connectionState],
    queryFn: () => searchAvailableParties('employee', search),
    enabled: open,
  })
  const selectedIds = new Set(selected.map((employee) => employee.id))
  const options = (query.data ?? []).filter((employee) => !selectedIds.has(employee.id))

  function startCreate() {
    if (!canCreate) return
    setForm({ name: normalizePartyName(input), code: '', department: '', phone: '', notes: '' })
    setCreateError('')
    setOpen(false)
    setCreating(true)
  }

  async function submitCreate() {
    if (!normalizePartyName(form.name)) {
      setCreateError('اسم الموظف مطلوب')
      return
    }
    setSaving(true)
    setCreateError('')
    try {
      const employee = await createParty('employee', form)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: partyKeys.list('employee') }),
        queryClient.invalidateQueries({ queryKey: partyKeys.summary('employee') }),
      ])
      if (!selected.some((item) => item.id === employee.id)) {
        onChange([...selected, employee as Employee])
      }
      setInput('')
      setCreating(false)
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : 'تعذر إنشاء الموظف')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div ref={container} className="relative">
      <div className={`rounded-2xl border bg-white p-2 ${error ? 'border-red-300' : 'border-[var(--app-border)] focus-within:border-[var(--app-primary)]'}`}>
        {selected.length ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {selected.map((employee) => (
              <span key={employee.id} className="inline-flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">
                {employee.name}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(selected.filter((item) => item.id !== employee.id))}
                  className="text-blue-400 hover:text-red-600"
                  aria-label={`إزالة ${employee.name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <input
          value={input}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(event) => { setInput(event.target.value); setOpen(true) }}
          placeholder="ابحث وأضف أكثر من موظف"
          className="h-8 w-full border-0 px-2 text-sm outline-none"
        />
      </div>
      {open ? (
        <div className="absolute z-[70] mt-2 max-h-56 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
          {query.isPending ? <div className="animate-pulse p-3 text-sm text-slate-500">جارٍ البحث...</div> : null}
          {!query.isPending && options.length === 0 ? <div className="p-3 text-sm text-slate-500">لا يوجد موظفون آخرون مطابقون</div> : null}
          {options.map((employee) => (
            <button
              key={employee.id}
              type="button"
              onClick={() => {
                onChange([...selected, employee])
                setInput('')
              }}
              className="w-full rounded-xl px-3 py-2 text-right hover:bg-blue-50"
            >
              <div className="font-semibold">{employee.name}</div>
              <div className="text-xs text-slate-500">{[employee.department, employee.employee_code].filter(Boolean).join(' • ')}</div>
            </button>
          ))}
          {search && canCreate ? (
            <button
              type="button"
              onClick={startCreate}
              className="mt-1 w-full rounded-xl bg-blue-50 px-3 py-2.5 text-right text-sm font-bold text-blue-700 hover:bg-blue-100"
            >
              إضافة موظف جديد باسم &quot;{search}&quot;
            </button>
          ) : null}
          {!canCreate ? <div className="p-3 text-xs font-semibold text-amber-700">يمكن اختيار الموظفين المحفوظين فقط أثناء العمل دون اتصال.</div> : null}
        </div>
      ) : null}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
      <p className="mt-1 text-xs text-slate-500">لن تُنسب الكمية لأي موظف حتى يتم توزيعها لاحقًا.</p>
      {creating ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/45 p-4" dir="rtl">
          <div className="w-full max-w-lg rounded-[28px] bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-slate-900">إضافة موظف جديد</h3>
            <p className="mt-1 text-sm text-slate-500">سيتم إنشاء الموظف وإضافته تلقائيًا إلى مستلمي حركة الصرف.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="الاسم *" className="rounded-xl border border-slate-200 p-3" />
              <input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="كود الموظف" className="rounded-xl border border-slate-200 p-3" />
              <input value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} placeholder="القسم" className="rounded-xl border border-slate-200 p-3" />
              <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="الهاتف" className="rounded-xl border border-slate-200 p-3" />
            </div>
            {createError ? <p className="mt-3 text-sm text-red-600">{createError}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={saving} onClick={() => setCreating(false)} className="rounded-xl border border-slate-200 px-4 py-2">إلغاء</button>
              <button type="button" disabled={saving} onClick={() => void submitCreate()} className="rounded-xl bg-blue-600 px-5 py-2 font-bold text-white disabled:opacity-50">
                {saving ? 'جارٍ الحفظ...' : 'تأكيد وإضافة للمستلمين'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
