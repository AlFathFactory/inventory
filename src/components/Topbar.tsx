import { useLocation } from 'react-router-dom'
import { categoryConfig, type CategoryKey } from '../config/categoryConfig'

type TopbarCopy = {
  title: string
  subtitle: string
}

type TopbarProps = { onMenuClick: () => void }

function MenuIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
}

const topbarCopyByPath: Record<string, TopbarCopy> = {
  '/': {
    title: 'لوحة التحكم',
    subtitle: 'نظام كامل لإدارة المخزون والإنتاج',
  },
  '/import': {
    title: 'استيراد البيانات',
    subtitle: 'نظام كامل لإدارة المخزون والإنتاج',
  },
  '/low-stock': {
    title: 'التنبيهات',
    subtitle: 'تنبيهات المخزون وصلاحية الدهانات التي تحتاج إلى متابعة',
  },
  '/item-code-guide': {
    title: 'دليل أكواد الأصناف',
    subtitle: 'افهم معنى كود الصنف بسرعة وابحث عنه بسهولة داخل المخزن.',
  },
  '/projects': {
    title: 'إدارة الأقسام',
    subtitle: 'إدارة أسماء الأقسام المستخدمة في أصناف وحركات المخزون',
  },
  '/sync-center': {
    title: 'مركز المزامنة',
    subtitle: 'متابعة البيانات المحفوظة على الجهاز وإعادة محاولة العمليات المتعثرة',
  },
  '/out-of-stock': {
    title: 'الأصناف المنتهية',
    subtitle: 'الأصناف التي رصيدها صفر وتحتاج إلى إجراء سريع',
  },
}

function getCategoryTopbarCopy(pathname: string): TopbarCopy | null {
  const prefix = '/category/'

  if (!pathname.startsWith(prefix)) {
    return null
  }

  const categoryKey = pathname.slice(prefix.length).split('/')[0] as CategoryKey
  const category = categoryConfig[categoryKey]

  if (!category) {
    return null
  }

  return {
    title: category.label,
    subtitle: `استعراض بيانات ${category.label} مع إمكانات البحث والتصفية بالتاريخ`,
  }
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const location = useLocation()
  const copy =
    topbarCopyByPath[location.pathname] ??
    getCategoryTopbarCopy(location.pathname) ?? {
      title: 'نظام المخزون',
      // subtitle: 'واجهة عربية تدعم RTL لإدارة المخزون داخل المصنع',
    }

  return (
    <header className="px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8">
      <div className="flex flex-col-reverse gap-4 rounded-[18px] border border-[var(--app-border)] bg-[var(--app-panel)] px-5 py-4 shadow-[var(--app-shadow)] sm:flex-row sm:items-start sm:justify-between lg:h-[74px] lg:items-center lg:px-7">
        <div className="text-right">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-[24px]">
            {copy.title}
          </h1>
          <p className="mt-1 text-[13px] text-[var(--app-text-muted)]">
            {copy.subtitle}
          </p>
        </div>
        <button type="button" onClick={onMenuClick} className="flex h-10 w-10 shrink-0 items-center justify-center self-start rounded-xl border border-[var(--app-border)] text-slate-700 transition hover:bg-slate-50 lg:hidden" aria-label="Open navigation" aria-controls="mobile-navigation"><MenuIcon /></button>
      </div>
    </header>
  )
}
