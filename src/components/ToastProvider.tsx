import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type ToastType = 'success' | 'error'

type Toast = { id: number; text: string; type: ToastType }
type ToastContextValue = { showToast: (text: string, type?: ToastType) => void }

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback((text: string, type: ToastType = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current, { id, text, type }])
    window.setTimeout(() => dismiss(id), 5000)
  }, [dismiss])

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed right-4 top-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div key={toast.id} role="status" className={[
            'flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-xl backdrop-blur transition-all',
            toast.type === 'success'
              ? 'border-emerald-200 bg-emerald-50/95 text-emerald-800'
              : 'border-red-200 bg-red-50/95 text-red-800',
          ].join(' ')}>
            <span className="min-w-0 flex-1 leading-6">{toast.text}</span>
            <button type="button" onClick={() => dismiss(toast.id)} className="-m-1 rounded-lg p-1 text-current/70 hover:bg-black/5" aria-label="إغلاق الإشعار">×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}

export function ToastOnChange({ message, type = 'success' }: { message: string | null; type?: ToastType }) {
  const { showToast } = useToast()

  useEffect(() => {
    if (message) showToast(message, type)
  }, [message, showToast, type])

  return null
}
