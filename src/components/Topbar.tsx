import { useLocation } from 'react-router-dom'
import { categoryConfig, type CategoryKey } from '../config/categoryConfig'

type TopbarCopy = {
  title: string
  subtitle: string
}

const topbarCopyByPath: Record<string, TopbarCopy> = {
  '/': {
    title: 'لوحة التحكم',
    subtitle: 'نظام CRUD كامل لإدارة المخزون والإنتاج',
  },
  '/operations': {
    title: 'العمليات',
    subtitle: 'نظام CRUD كامل لإدارة المخزون والمشاريع والعمليات',
  },
  '/items': {
    title: 'الأصناف',
    subtitle: 'عرض سريع لكل الأصناف وربطها بحالة المخزون الحالية',
  },
  '/projects': {
    title: 'المشاريع',
    subtitle: 'مراجعة الأصناف حسب المشاريع وربط البيانات التشغيلية بها',
  },
  '/import': {
    title: 'استيراد Excel',
    subtitle: 'حمّل ملف Excel وراجع النتائج قبل حفظها في قاعدة البيانات',
  },
  '/low-stock': {
    title: 'الأصناف القليلة',
    subtitle: 'كل الأصناف التي وصلت إلى الحد الأدنى أو اقتربت منه',
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

  const categoryKey = pathname.slice(prefix.length) as CategoryKey
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
    <header className="px-5 pt-6 sm:px-7 lg:px-8 lg:pt-6">
      <div className="flex flex-col-reverse gap-6 rounded-[30px] border border-[var(--app-border)] bg-[var(--app-panel)] px-6 py-5 shadow-[var(--app-shadow)] lg:flex-row lg:items-start lg:justify-between lg:px-7 lg:py-6">
        <label className="block lg:w-[260px]">
          <span className="sr-only">بحث سريع</span>
          <input
            type="search"
            placeholder="بحث سريع..."
            className="h-[42px] w-full rounded-2xl border border-[var(--app-border)] bg-white px-4 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-slate-300"
          />
        </label>

        <div className="text-right">
          <h1 className="text-[2rem] font-bold tracking-tight text-slate-900 lg:text-[2.15rem]">
            {copy.title}
          </h1>
          <p className="mt-2 text-sm text-[var(--app-text-muted)]">
            {copy.subtitle}
          </p>
        </div>
      </div>
    </header>
  )
}
