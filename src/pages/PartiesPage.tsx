import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  allocateGroupIssue, createParty, getEmployeeActivity, getIssueEmployeeAllocations,
  getPartySummaries, getSupplierActivity, partyKeys, saveParty,
  type IssueEmployeeAllocation, type Party, type PartyKind,
} from '../services/partiesService'
import { inventoryKeys } from '../features/inventory/inventoryQueryKeys'
import { reportKeys } from '../features/reports/reportQueries'
import { usePagination } from '../hooks/usePagination'
import { TablePagination } from '../components/TablePagination'

const number = (row: Party, ...keys: string[]) => Number(keys.map((key) => row[key]).find((value) => value != null) ?? 0)
const text = (row: Party, ...keys: string[]) => String(keys.map((key) => row[key]).find((value) => value != null && value !== '') ?? '—')
const date = (value: unknown) => value ? new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(new Date(String(value))) : '—'

function PartyForm({ kind, party, saving, onClose, onSave }: {
  kind: PartyKind; party?: Party | null; saving: boolean; onClose: () => void
  onSave: (values: Record<string, string>) => void
}) {
  const [form, setForm] = useState({
    name: party?.name ?? '', code: String(party?.[kind === 'employee' ? 'employee_code' : 'supplier_code'] ?? ''),
    department: String(party?.department ?? ''), contactPerson: String(party?.contact_person ?? ''),
    phone: String(party?.phone ?? ''), notes: String(party?.notes ?? ''),
  })
  const field = (key: keyof typeof form, placeholder: string) => (
    <input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      placeholder={placeholder} className="rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-blue-500" />
  )
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4" dir="rtl">
      <div className="w-full max-w-lg rounded-[28px] bg-white p-6 shadow-2xl">
        <h2 className="text-xl font-bold">{party ? 'تعديل' : 'إضافة'} {kind === 'employee' ? 'موظف' : 'مورد'}</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {field('name', 'الاسم *')}{field('code', 'الكود')}
          {kind === 'employee' ? field('department', 'القسم') : field('contactPerson', 'مسؤول التواصل')}
          {field('phone', 'الهاتف')}
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="ملاحظات" className="min-h-24 rounded-xl border border-slate-200 p-3 sm:col-span-2" />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button disabled={saving} onClick={onClose} className="rounded-xl border px-4 py-2">إلغاء</button>
          <button disabled={saving || !form.name.trim()} onClick={() => onSave(form)}
            className="rounded-xl bg-blue-600 px-5 py-2 font-bold text-white disabled:opacity-50">
            {saving ? 'جارٍ الحفظ...' : 'حفظ'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AllocationDialog({ operationId, operationQuantity, onClose, onSaved }: {
  operationId: string
  operationQuantity: number
  onClose: () => void
  onSaved: () => void
}) {
  const allocations = useQuery({
    queryKey: partyKeys.issueAllocations(operationId),
    queryFn: () => getIssueEmployeeAllocations(operationId),
  })
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const rows = allocations.data ?? []
  const total = rows.reduce((sum, row) => sum + Number(values[row.employee_id] ?? row.allocated_quantity ?? 0), 0)
  const remaining = operationQuantity - total

  async function save() {
    setError('')
    const payload = rows.map((row) => ({
      employeeId: row.employee_id,
      quantity: Number(values[row.employee_id] ?? row.allocated_quantity ?? 0),
    }))
    if (payload.some((row) => !Number.isFinite(row.quantity) || row.quantity < 0)) {
      setError('أدخل كميات صحيحة وغير سالبة')
      return
    }
    if (remaining !== 0) {
      setError(`يجب توزيع كامل الكمية. المتبقي: ${remaining}`)
      return
    }
    const belowReturn = rows.find((row, index) => payload[index].quantity < Number(row.returned_quantity))
    if (belowReturn) {
      setError(`حصة ${belowReturn.employee_name_snapshot} لا يمكن أن تقل عن المرتجع (${belowReturn.returned_quantity})`)
      return
    }
    setSaving(true)
    try {
      await allocateGroupIssue(operationId, payload)
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر حفظ التوزيع')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/50 p-4" dir="rtl">
      <div className="w-full max-w-xl rounded-[28px] bg-white p-6 shadow-2xl">
        <h3 className="text-xl font-bold">توزيع كمية الصرف</h3>
        <p className="mt-1 text-sm text-slate-500">وزّع إجمالي {operationQuantity} على جميع مستلمي الحركة.</p>
        {allocations.isPending ? <div className="mt-5 h-36 animate-pulse rounded-2xl bg-slate-100" /> : (
          <div className="mt-5 space-y-3">
            {rows.map((row: IssueEmployeeAllocation) => (
              <label key={row.employee_id} className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 p-3">
                <div>
                  <div className="font-bold">{row.employee_name_snapshot}</div>
                  <div className="text-xs text-slate-500">مرتجع سابقًا: {row.returned_quantity}</div>
                </div>
                <input
                  type="number"
                  min={Number(row.returned_quantity)}
                  step="1"
                  value={values[row.employee_id] ?? String(row.allocated_quantity ?? '')}
                  onChange={(event) => setValues({ ...values, [row.employee_id]: event.target.value })}
                  className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-center"
                  placeholder="0"
                />
              </label>
            ))}
          </div>
        )}
        <div className={`mt-4 rounded-2xl p-4 ${remaining === 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
          <div className="flex justify-between"><span>الموزع: <strong>{total}</strong></span><span>المتبقي: <strong>{remaining}</strong></span></div>
        </div>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button disabled={saving} onClick={onClose} className="rounded-xl border px-4 py-2">إلغاء</button>
          <button disabled={saving || allocations.isPending || remaining !== 0} onClick={() => void save()} className="rounded-xl bg-blue-600 px-5 py-2 font-bold text-white disabled:opacity-50">
            {saving ? 'جارٍ الحفظ...' : 'حفظ التوزيع'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Details({ kind, party, onClose }: { kind: PartyKind; party: Party; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [distribution, setDistribution] = useState<{ id: string; quantity: number } | null>(null)
  const activity = useQuery({
    queryKey: partyKeys.activity(kind, party.id),
    queryFn: () => kind === 'employee' ? getEmployeeActivity(party.id) : getSupplierActivity(party.id),
  })
  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-950/45 p-4" dir="rtl">
      <div className="mx-auto my-6 max-w-6xl rounded-[28px] bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div><h2 className="text-2xl font-bold">{party.name}</h2><p className="mt-1 text-sm text-slate-500">{text(party, kind === 'employee' ? 'department' : 'contact_person')} • {text(party, 'phone')}</p></div>
          <button onClick={onClose} className="rounded-full bg-slate-100 px-4 py-2">إغلاق</button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(kind === 'employee'
            ? [['حركات الصرف', number(party, 'issue_movements_count')], ['تحتاج توزيع', number(party, 'pending_distribution_movements_count')], ['إجمالي المصروف', number(party, 'total_issued_quantity')], ['إجمالي المرتجع', number(party, 'total_returned_quantity')], ['صافي العهدة', number(party, 'net_issued_quantity')]]
            : [['حركات الإضافة', number(party, 'addition_movements_count')], ['إجمالي التوريد', number(party, 'total_supplied_quantity')], ['آخر إضافة', date(party.last_addition_date)], ['الحالة', party.is_active ? 'نشط' : 'غير نشط']]
          ).map(([label, value]) => <div key={String(label)} className="rounded-2xl bg-slate-50 p-4"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-xl font-bold">{String(value)}</div></div>)}
        </div>
        <div className="mt-6 overflow-x-auto">
          {activity.isPending ? <div className="h-40 animate-pulse rounded-2xl bg-slate-100" /> :
            activity.isError ? <p className="rounded-xl bg-red-50 p-4 text-red-700">تعذر تحميل النشاط</p> :
            activity.data?.length === 0 ? <p className="rounded-xl bg-slate-50 p-8 text-center text-slate-500">لا توجد حركات مرتبطة</p> :
            <table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b text-slate-500">
              {(kind === 'employee' ? ['الصنف', 'الكود', 'التصنيف', 'المصروف', 'المرتجع', 'المتبقي', 'التاريخ', 'المشروع', 'الحالة', 'إجراء']
                : ['الصنف', 'الكود', 'الكمية', 'التاريخ', 'أمر التوريد', 'كود الإضافة', 'التصنيف', 'المشروع']).map((h) => <th key={h} className="p-3 text-right">{h}</th>)}
            </tr></thead><tbody>{activity.data?.map((row, index) => <tr key={String(row.id ?? index)} className="border-b">
              {(kind === 'employee'
                ? [row.item_name, row.internal_code ?? row.item_code, row.category_name, row.allocation_status === 'pending_distribution' ? '— غير موزع' : row.issue_quantity, row.returned_quantity, row.remaining_quantity, date(row.issue_date ?? row.operation_date), row.project_name ?? row.department, row.allocation_status === 'pending_distribution' ? 'تحتاج توزيع' : row.return_status]
                : [row.item_name, row.item_code ?? row.internal_code, row.quantity, date(row.operation_date), row.purchase_order_number, row.addition_code, row.category_name, row.project_name]
              ).map((value, cell) => <td key={cell} className="p-3">{String(value ?? '—')}</td>)}
              {kind === 'employee' ? <td className="p-3">
                {row.allocation_status === 'pending_distribution' ? (
                  <button onClick={() => setDistribution({ id: String(row.operation_id), quantity: Number(row.operation_quantity) })} className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">توزيع الكمية</button>
                ) : '—'}
              </td> : null}
            </tr>)}</tbody></table>}
        </div>
      </div>
      {distribution ? (
        <AllocationDialog
          operationId={distribution.id}
          operationQuantity={distribution.quantity}
          onClose={() => setDistribution(null)}
          onSaved={() => {
            setDistribution(null)
            void queryClient.invalidateQueries({ queryKey: partyKeys.all })
            void queryClient.invalidateQueries({ queryKey: inventoryKeys.all })
            void queryClient.invalidateQueries({ queryKey: reportKeys.all })
          }}
        />
      ) : null}
    </div>
  )
}

export function PartiesPage() {
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<PartyKind>('employee')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Party | null | undefined>(undefined)
  const [selected, setSelected] = useState<Party | null>(null)
  const [saving, setSaving] = useState(false)
  const query = useQuery({ queryKey: partyKeys.summary(kind), queryFn: () => getPartySummaries(kind) })
  const rows = useMemo(() => (query.data ?? []).filter((party) =>
    [party.name, party.employee_code, party.supplier_code, party.department, party.contact_person, party.phone]
      .some((value) => String(value ?? '').toLocaleLowerCase('ar').includes(search.trim().toLocaleLowerCase('ar')))), [query.data, search])
  const pagination = usePagination(rows, { initialPageSize: 10 })

  async function persist(values: Record<string, string>) {
    setSaving(true)
    try {
      if (editing) await saveParty(kind, editing.id, {
        name: values.name.trim(), [kind === 'employee' ? 'employee_code' : 'supplier_code']: values.code || null,
        ...(kind === 'employee' ? { department: values.department || null } : { contact_person: values.contactPerson || null }),
        phone: values.phone || null, notes: values.notes || null,
      })
      else await createParty(kind, values)
      await queryClient.invalidateQueries({ queryKey: partyKeys.all })
      setEditing(undefined)
    } finally { setSaving(false) }
  }

  async function toggle(party: Party) {
    setSaving(true)
    try {
      await saveParty(kind, party.id, { is_active: !party.is_active })
      await queryClient.invalidateQueries({ queryKey: partyKeys.all })
    } finally { setSaving(false) }
  }

  const employeeColumns = ['الاسم', 'الكود', 'القسم', 'الهاتف', 'الحالة', 'حركات الصرف', 'المصروف', 'المرتجع', 'صافي العهدة', 'آخر صرف', 'الإجراءات']
  const supplierColumns = ['الاسم', 'الكود', 'مسؤول التواصل', 'الهاتف', 'الحالة', 'حركات الإضافة', 'إجمالي التوريد', 'آخر إضافة', 'الإجراءات']
  return (
    <section className="mx-auto w-full max-w-[1500px] p-4 lg:p-8" dir="rtl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-3xl font-bold">الموظفون والموردون</h1><p className="mt-1 text-slate-500">إدارة الأطراف المرتبطة بحركات المخزون</p></div>
        <button disabled={saving} onClick={() => setEditing(null)} className="rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-50">إضافة {kind === 'employee' ? 'موظف' : 'مورد'}</button>
      </div>
      <div className="mt-6 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
          <div className="flex rounded-2xl bg-slate-100 p-1">
            {(['employee', 'supplier'] as PartyKind[]).map((value) => <button key={value} onClick={() => { setKind(value); setSearch(''); pagination.setCurrentPage(1) }} className={`rounded-xl px-6 py-2 font-bold ${kind === value ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>{value === 'employee' ? 'الموظفين' : 'الموردين'}</button>)}
          </div>
          <input value={search} onChange={(e) => { setSearch(e.target.value); pagination.setCurrentPage(1) }} placeholder="بحث..." className="rounded-2xl border border-slate-200 px-4 py-2.5 sm:w-80" />
        </div>
        <div className="mt-5 grid gap-3 md:hidden">
          {query.isPending ? <div className="h-52 animate-pulse rounded-2xl bg-slate-100" /> : null}
          {query.isError ? <p className="rounded-xl bg-red-50 p-4 text-red-700">{query.error.message}</p> : null}
          {!query.isPending && !query.isError && rows.length === 0 ? <p className="rounded-2xl bg-slate-50 p-10 text-center text-slate-500">لا توجد نتائج</p> : null}
          {!query.isPending && !query.isError ? pagination.paginatedItems.map((party) => (
            <article key={party.id} role="button" tabIndex={0} onClick={() => setSelected(party)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(party) } }} className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.05)] transition hover:border-blue-200 hover:bg-blue-50/30 focus:outline-none focus:ring-2 focus:ring-blue-400">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-lg font-bold text-blue-700">
                    {party.name.trim().charAt(0) || '—'}
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate font-bold text-slate-900">{party.name}</h3>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {text(party, kind === 'employee' ? 'department' : 'contact_person')}
                      {' • '}
                      {text(party, kind === 'employee' ? 'employee_code' : 'supplier_code')}
                    </p>
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${party.is_active ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200'}`}>
                  {party.is_active ? 'نشط' : 'غير نشط'}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {(kind === 'employee'
                  ? [
                      ['حركات الصرف', number(party, 'issue_movements_count')],
                      ['صافي العهدة', number(party, 'net_issued_quantity')],
                      ['المرتجع', number(party, 'total_returned_quantity')],
                    ]
                  : [
                      ['حركات الإضافة', number(party, 'addition_movements_count')],
                      ['إجمالي التوريد', number(party, 'total_supplied_quantity')],
                      ['الهاتف', text(party, 'phone')],
                    ]
                ).map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl bg-slate-50 px-2 py-2.5 text-center">
                    <div className="truncate text-[10px] text-slate-500">{label}</div>
                    <div className="mt-1 truncate text-sm font-bold text-slate-800">{String(value)}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3">
                <button disabled={saving} onClick={(event) => { event.stopPropagation(); setSelected(party) }} className="flex-1 rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 disabled:opacity-50">التفاصيل</button>
                <button disabled={saving} onClick={(event) => { event.stopPropagation(); setEditing(party) }} className="flex-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">تعديل</button>
                <button disabled={saving} onClick={(event) => { event.stopPropagation(); void toggle(party) }} className="flex-1 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 disabled:opacity-50">{party.is_active ? 'تعطيل' : 'تفعيل'}</button>
              </div>
            </article>
          )) : null}
        </div>
        <div className="mt-5 hidden overflow-x-auto rounded-2xl border border-slate-200 md:block">
          {query.isPending ? <div className="h-64 animate-pulse rounded-2xl bg-slate-100" /> :
            query.isError ? <p className="rounded-xl bg-red-50 p-4 text-red-700">{query.error.message}</p> :
            rows.length === 0 ? <p className="p-12 text-center text-slate-500">لا توجد نتائج</p> :
            <table className="w-full min-w-[1100px] border-separate border-spacing-0 text-sm"><thead className="bg-slate-50"><tr className="text-slate-500">{(kind === 'employee' ? employeeColumns : supplierColumns).map((h) => <th key={h} className="border-b border-slate-200 px-4 py-3.5 text-right text-xs font-bold">{h}</th>)}</tr></thead>
              <tbody>{pagination.paginatedItems.map((party) => <tr key={party.id} tabIndex={0} onClick={() => setSelected(party)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(party) } }} className="group cursor-pointer transition-colors hover:bg-blue-50/40 focus:bg-blue-50/60 focus:outline-none"><td className="border-b border-slate-100 px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 font-bold text-blue-700 group-hover:bg-blue-100">{party.name.trim().charAt(0) || '—'}</div>
                    <div><div className="font-bold text-slate-900">{party.name}</div><div className="mt-0.5 text-[11px] text-slate-400">#{party.id.slice(0, 8)}</div></div>
                  </div>
                </td>
                <td className="border-b border-slate-100 px-4 py-3.5 font-medium text-slate-700">{text(party, kind === 'employee' ? 'employee_code' : 'supplier_code')}</td>
                <td className="border-b border-slate-100 px-4 py-3.5 text-slate-600">{text(party, kind === 'employee' ? 'department' : 'contact_person')}</td><td className="border-b border-slate-100 px-4 py-3.5 text-slate-600" dir="ltr">{text(party, 'phone')}</td>
                <td className="border-b border-slate-100 px-4 py-3.5"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${party.is_active ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200'}`}><span className={`h-1.5 w-1.5 rounded-full ${party.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`} />{party.is_active ? 'نشط' : 'غير نشط'}</span></td>
                {kind === 'employee' ? <><td className="border-b border-slate-100 px-4 py-3.5 font-semibold"><div>{number(party, 'issue_movements_count')}</div>{number(party, 'pending_distribution_movements_count') > 0 ? <span className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">{number(party, 'pending_distribution_movements_count')} تحتاج توزيع</span> : null}</td><td className="border-b border-slate-100 px-4 py-3.5 font-semibold text-blue-700">{number(party, 'total_issued_quantity')}</td><td className="border-b border-slate-100 px-4 py-3.5 font-semibold text-emerald-700">{number(party, 'total_returned_quantity')}</td><td className="border-b border-slate-100 px-4 py-3.5"><span className="rounded-lg bg-amber-50 px-2 py-1 font-bold text-amber-700">{number(party, 'net_issued_quantity')}</span></td><td className="whitespace-nowrap border-b border-slate-100 px-4 py-3.5 text-slate-500">{date(party.last_issue_date)}</td></>
                  : <><td className="border-b border-slate-100 px-4 py-3.5 font-semibold">{number(party, 'addition_movements_count')}</td><td className="border-b border-slate-100 px-4 py-3.5 font-semibold text-blue-700">{number(party, 'total_supplied_quantity')}</td><td className="whitespace-nowrap border-b border-slate-100 px-4 py-3.5 text-slate-500">{date(party.last_addition_date)}</td></>}
                <td className="border-b border-slate-100 px-4 py-3.5"><div className="flex items-center gap-1.5"><button disabled={saving} onClick={(event) => { event.stopPropagation(); setSelected(party) }} className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50">تفاصيل</button><button disabled={saving} onClick={(event) => { event.stopPropagation(); setEditing(party) }} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-50">تعديل</button><button disabled={saving} onClick={(event) => { event.stopPropagation(); void toggle(party) }} className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-100 disabled:opacity-50">{party.is_active ? 'تعطيل' : 'تفعيل'}</button></div></td>
              </tr>)}</tbody></table>}
        </div>
        {!query.isPending && !query.isError && rows.length > 0 ? (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <TablePagination
              currentPage={pagination.currentPage}
              pageSize={pagination.pageSize}
              totalItems={pagination.totalItems}
              totalPages={pagination.totalPages}
              pageStart={pagination.pageStart}
              pageEnd={pagination.pageEnd}
              onPageChange={pagination.setCurrentPage}
              onPageSizeChange={pagination.setPageSize}
            />
          </div>
        ) : null}
      </div>
      {editing !== undefined ? <PartyForm kind={kind} party={editing} saving={saving} onClose={() => setEditing(undefined)} onSave={(values) => void persist(values)} /> : null}
      {selected ? <Details kind={kind} party={selected} onClose={() => setSelected(null)} /> : null}
    </section>
  )
}
