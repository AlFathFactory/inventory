import { Link } from 'react-router-dom'
import type { CategoryDefinition } from '../../../config/categoryConfig'
import type { ItemDetails } from '../../../services/itemsService'
import type { InventoryOperationType } from '../../../services/operationsService'
import { getDisplayText, getNumericValue } from '../../inventory-operations/operationForm'
import type { MonthlyMovementSummary } from '../types'

type ItemDetailsOverviewProps = {
  category: CategoryDefinition
  details: ItemDetails
  itemId: string
  monthlySummaries: MonthlyMovementSummary[]
  onEdit: () => void
  onOperation: (type: InventoryOperationType) => void
  isReadOnly?: boolean
  backTo?: string
  onBack?: () => void
  backLabel?: string
}

export function ItemDetailsOverview({
  category,
  details,
  itemId,
  monthlySummaries,
  onEdit,
  onOperation,
  isReadOnly = false,
  backTo,
  onBack,
  backLabel,
}: ItemDetailsOverviewProps) {
  return (
    <div className="rounded-[32px] border border-[var(--app-border)] bg-[var(--app-panel)] px-6 py-6 shadow-[var(--app-shadow)] lg:px-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-4 text-right">
          <div>
            <h2 className="text-[2rem] font-bold tracking-tight text-slate-950">
              {details.item_name || `صنف ${itemId}`}
            </h2>
            <div className="mt-2 flex items-center gap-2 text-sm">
              <span className="text-[var(--app-text-muted)]">كود الصنف:</span>
              <span
                dir="ltr"
                className="select-all rounded-lg bg-slate-100 px-2 py-1 font-mono font-semibold text-slate-800"
              >
                {getDisplayText(details.internal_code)}
              </span>
            </div>
            <p className="mt-2 text-sm text-[var(--app-text-muted)]">
              شاشة تفاصيل الصنف وسجل الحركات الكامل لهذا القسم.
            </p>
          </div>
          <div className={`grid gap-3 ${category.table === 'raw_materials' ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
            <Info label="اسم القسم" value={details.category_name || category.label} />
            {category.table !== 'raw_materials' ? (
              <Info label="اسم القسم" value={getDisplayText(details.project_name)} />
            ) : null}
            <Info label="اسم المورد" value={getDisplayText(details.supplier_name)} />
          </div>
        </div>
        {onBack ? (
          <button type="button" onClick={onBack} className="inline-flex h-[44px] items-center justify-center rounded-2xl border border-[var(--app-border)] bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            {backLabel ?? 'رجوع'}
          </button>
        ) : (
          <Link to={backTo ?? category.route} className="inline-flex h-[44px] items-center justify-center rounded-2xl border border-[var(--app-border)] bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            {backLabel ?? (backTo ? 'رجوع للوحة التحكم' : 'رجوع للقسم')}
          </Link>
        )}
      </div>

      <div className="mt-5 grid overflow-hidden rounded-2xl border border-[var(--app-border)] bg-slate-50 sm:grid-cols-3 sm:divide-x sm:divide-x-reverse sm:divide-[var(--app-border)]">
        <CompactStat label="الرصيد الحالي" value={getNumericValue(details.stock_balance).toLocaleString()} />
        <CompactStat label="الحد الأدنى" value={getNumericValue(details.min_quantity).toLocaleString()} />
        <CompactStat label="الحالة" value={details.status || 'غير محدد'} />
      </div>

      {category.table === 'raw_materials' ? (
        <div className="mt-4 grid overflow-hidden rounded-2xl border border-[var(--app-border)] sm:grid-cols-2 xl:grid-cols-6">
          <CompactStat label="رقم الكود" value={getDisplayText(details.code_number)} />
          <CompactStat label="الطول" value={getDisplayText(details.length)} />
          <CompactStat label="العرض" value={getDisplayText(details.width)} />
          <CompactStat
            label="السُمك / الأبعاد"
            value={getDisplayText(details.th ?? details.dimension_text)}
          />
          <CompactStat label="الوزن" value={getDisplayText(details.weight)} />
          <CompactStat label="مصدر الخامة" value={getDisplayText(details.material_source)} />
        </div>
      ) : null}

      {category.table === 'screws' || category.table === 'stock_screws' ? (
        <div className="mt-4 grid overflow-hidden rounded-2xl border border-[var(--app-border)] sm:grid-cols-2 sm:divide-x sm:divide-x-reverse sm:divide-[var(--app-border)]">
          <CompactStat label="DIN" value={getDisplayText(details.din)} />
          <CompactStat label="رقم الكود" value={getDisplayText(details.code_number)} />
        </div>
      ) : null}

      {category.table === 'cylinders' ? (
        <div className="mt-4 grid overflow-hidden rounded-2xl border border-[var(--app-border)] sm:grid-cols-2 sm:divide-x sm:divide-x-reverse sm:divide-[var(--app-border)]">
          <CompactStat
            label="ملي"
            value={getNumericValue(details.full_count).toLocaleString()}
          />
          <CompactStat
            label="فارغ"
            value={getNumericValue(details.empty_count).toLocaleString()}
          />
        </div>
      ) : null}

      {category.table === 'paints' ? (
        <div className="mt-4 grid max-w-2xl overflow-hidden rounded-2xl border border-[var(--app-border)] sm:grid-cols-2 sm:divide-x sm:divide-x-reverse sm:divide-[var(--app-border)]">
          <CompactStat label="تاريخ الإنتاج" value={getDisplayText(details.production_date)} />
          <CompactStat label="تاريخ الصلاحية" value={getDisplayText(details.expire_date)} />
        </div>
      ) : null}

      <div className="mt-5 overflow-hidden rounded-2xl border border-[var(--app-border)]">
        <div className="grid grid-cols-[minmax(120px,1fr)_1fr_1fr] bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-500">
          <span>الشهر</span>
          <span className="text-center">الإضافة</span>
          <span className="text-center">الصرف</span>
        </div>
        {monthlySummaries.length === 0 ? (
          <div className="px-4 py-5 text-center text-sm text-slate-500">
            لا توجد حركات شهرية مسجلة لهذا الصنف.
          </div>
        ) : monthlySummaries.map((summary) => (
          <div key={summary.monthKey} className="grid grid-cols-[minmax(120px,1fr)_1fr_1fr] items-center border-t border-[var(--app-border)] px-4 py-3 text-sm">
            <span className="font-medium text-slate-700">{summary.monthLabel}</span>
            <span className="text-center font-bold text-emerald-700">{summary.totalAdded.toLocaleString()}</span>
            <span className="text-center font-bold text-orange-700">{summary.totalIssued.toLocaleString()}</span>
          </div>
        ))}
      </div>

      {!isReadOnly ? <div className="mt-6 flex flex-wrap justify-start gap-3">
        <ActionButton label="إضافة كمية" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => onOperation('add')} />
        <ActionButton label="صرف كمية" className="bg-orange-500 text-white hover:bg-orange-600" onClick={() => onOperation('issue')} />
        <ActionButton label="تعديل الصنف" className="border border-[var(--app-border)] bg-white text-slate-700 hover:bg-slate-50" onClick={onEdit} />
      </div> : null}
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 px-4 py-2.5"><div className="text-xs text-slate-500">{label}</div><div className="mt-0.5 text-sm font-semibold text-slate-900">{value}</div></div>
}

function CompactStat({ label, value }: { label: string; value: string }) {
  return <div className="border-b border-[var(--app-border)] px-4 py-3 last:border-b-0 sm:border-b-0"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-lg font-bold text-slate-950">{value}</div></div>
}

function ActionButton({ label, className, onClick }: { label: string; className: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`inline-flex h-[44px] items-center rounded-2xl px-5 text-sm font-semibold transition ${className}`}>{label}</button>
}
