import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useAccess } from './AccessContext'

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2" />
    </svg>
  )
}

export function AccessGate({ children }: { children: ReactNode }) {
  const { user, unlock } = useAccess()
  const [password, setPassword] = useState('')
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    if (!user) {
      setPassword('')
      setHasError(false)
    }
  }, [user])

  if (user) return <>{children}</>

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setHasError(!unlock(password))
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#081842] px-5 py-8" dir="rtl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_84%_18%,rgba(245,158,11,0.25),transparent_24%),radial-gradient(circle_at_13%_84%,rgba(37,99,235,0.42),transparent_32%)]" />
      <div className="absolute -right-24 top-12 h-72 w-72 rounded-full border border-white/10" />
      <div className="absolute -bottom-28 -left-20 h-96 w-96 rounded-full border border-white/10" />

      <section className="relative grid w-full max-w-5xl overflow-hidden rounded-[32px] border border-white/15 bg-white shadow-2xl shadow-black/30 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="relative flex min-h-[280px] flex-col justify-between overflow-hidden bg-[#0b2167] p-8 text-white sm:p-12">
          <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(21,94,239,0.38),transparent_55%)]" />
          <div className="relative">
            <div className="inline-flex">
              <img src="/logo.png" alt="مصنع الفاتح" className="h-28 w-56 object-contain" />
            </div>
            <p className="mt-8 text-sm font-semibold tracking-wide text-amber-300">نظام إدارة المخزون</p>
            <h1 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">مرحباً بك في مصنع الفاتح</h1>
            <p className="mt-4 max-w-sm text-sm leading-7 text-blue-100">بوابة بسيطة وآمنة لتنظيم الوصول إلى أقسام النظام.</p>
          </div>
          <div className="relative mt-10 flex items-center gap-3 text-sm text-blue-100">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            أدخل رمزك للمتابعة
          </div>
        </div>

        <div className="flex items-center p-7 sm:p-12">
          <div className="w-full">
            <div className="mb-8 text-right">
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <LockIcon />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">رمز الدخول</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">أدخل الرمز المخصص لك للوصول إلى القسم المسموح به.</p>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div>
                <label className="mb-2 block text-right text-sm font-semibold text-slate-700" htmlFor="access-password">الرمز</label>
                <input
                  id="access-password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value)
                    if (hasError) setHasError(false)
                  }}
                  type="password"
                  autoComplete="current-password"
                  autoFocus
                  placeholder="أدخل رمز الدخول"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-right text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                  aria-invalid={hasError}
                  aria-describedby={hasError ? 'access-password-error' : undefined}
                />
                {hasError ? <p id="access-password-error" className="mt-2 text-right text-sm font-medium text-red-600">الرمز غير صحيح. حاول مرة أخرى.</p> : null}
              </div>
              <button type="submit" className="w-full rounded-xl bg-[#155eef] px-4 py-3.5 font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-[#174cd3] focus:outline-none focus:ring-4 focus:ring-blue-200">
                دخول إلى النظام
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  )
}
