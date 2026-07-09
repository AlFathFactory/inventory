export function Topbar() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="flex flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div>
          <p className="text-sm text-slate-500">نظام المخزون للمصنع</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            لوحة التحكم
          </h1>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 sm:w-auto">
          <span>جاهز لاستيراد ملفات Excel وربط البيانات مع Supabase</span>
        </div>
      </div>
    </header>
  )
}
