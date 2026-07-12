import { useLocation } from 'react-router-dom'
import { categoryConfig, type CategoryKey } from '../config/categoryConfig'

type TopbarCopy = {
  title: string
  subtitle: string
}

const topbarCopyByPath: Record<string, TopbarCopy> = {
  '/': {
    title: 'لوحة التحكم',
    subtitle: 'نظام كامل لإدارة المخزون والإنتاج',
  },
  '/items': {
    title: 'الأصناف',
    subtitle: 'نظام كامل لإدارة المخزون والمشاريع والعمليات',
  },
  '/projects': {
    title: 'المشاريع',
    subtitle: 'مراجعة الأصناف حسب المشاريع وربط البيانات التشغيلية بها',
  },
  '/operations': {
    title: 'مركز عمليات المخزون',
    subtitle: 'إدارة الإضافة والصرف والجرد مع تحديث الرصيد وسجل الحركات',
  },
  '/import': {
    title: 'استيراد البيانات',
    subtitle: 'نظام كامل لإدارة المخزون والمشاريع والعمليات',
  },
  '/low-stock': {
    title: 'الأصناف القليلة',
    subtitle: 'كل الأصناف التي وصلت إلى الحد الأدنى أو تحتاج إلى متابعة',
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

export function Topbar() {
  const location = useLocation()
  const copy =
    topbarCopyByPath[location.pathname] ??
    getCategoryTopbarCopy(location.pathname) ?? {
      title: 'نظام المخزون',
      subtitle: 'واجهة عربية تدعم RTL لإدارة المخزون داخل المصنع',
    }

  return (
    <header className="px-6 pt-6 lg:px-8">
      <div className="flex flex-col-reverse gap-4 rounded-[18px] border border-[var(--app-border)] bg-[var(--app-panel)] px-5 py-4 shadow-[var(--app-shadow)] lg:h-[74px] lg:flex-row lg:items-center lg:justify-between lg:px-7">
        <div className="text-right">
          <h1 className="text-[24px] font-bold tracking-tight text-slate-900">
            {copy.title}
          </h1>
          <p className="mt-1 text-[13px] text-[var(--app-text-muted)]">
            {copy.subtitle}
          </p>
        </div>
      </div>
    </header>
  )
}
