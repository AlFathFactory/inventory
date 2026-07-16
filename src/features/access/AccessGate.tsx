import { useState, type FormEvent, type ReactNode } from 'react'
import { useAccess } from './AccessContext'

export function AccessGate({ children }: { children: ReactNode }) {
  const { user, unlock } = useAccess()
  const [password, setPassword] = useState('')
  const [hasError, setHasError] = useState(false)

  if (user) return <>{children}</>

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setHasError(!unlock(password))
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5" dir="rtl">
      <section className="w-full max-w-md rounded-[28px] border border-white/80 bg-white p-7 shadow-2xl shadow-blue-950/10 sm:p-9">
        <div className="mb-8 text-right">
          <p className="text-sm font-semibold text-blue-600">نظام إدارة المخزون</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">رمز الدخول</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">أدخل الرمز المخصص لك لفتح القسم المسموح به.</p>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block text-right text-sm font-semibold text-slate-700" htmlFor="access-password">الرمز</label>
          <input
            id="access-password"
            value={password}
            onChange={(event) => { setPassword(event.target.value); if (hasError) setHasError(false) }}
            type="password"
            autoComplete="current-password"
            autoFocus
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-right text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            aria-invalid={hasError}
            aria-describedby={hasError ? 'access-password-error' : undefined}
          />
          {hasError ? <p id="access-password-error" className="text-right text-sm text-red-600">الرمز غير صحيح.</p> : null}
          <button type="submit" className="w-full rounded-xl bg-blue-600 px-4 py-3 font-bold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200">دخول</button>
        </form>
      </section>
    </main>
  )
}
