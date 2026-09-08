import { QUEUE_PANEL_STATUSES } from '../../services/desktopQueuePanelService'
import type { DesktopQueuePanelController } from './useDesktopQueuePanel'
import { useDesktopQueuePanel } from './useDesktopQueuePanel'
import {
  describeQueueCommandType,
  formatQueueCommandTime,
  QUEUE_STATUS_UI,
  retryLabel,
} from './desktopQueuePresentation'

export interface DesktopQueuePanelProps {
  open: boolean
  onClose: () => void
}

type DesktopQueuePanelViewProps = DesktopQueuePanelProps & DesktopQueuePanelController

export function DesktopQueuePanelView({
  open,
  onClose,
  isEnabled,
  isLoading,
  isActing,
  actionError,
  counts,
  commands,
  replayPending,
  retryFailed,
}: DesktopQueuePanelViewProps) {
  if (!isEnabled || !open) return null

  const replayDisabled = isActing || counts.syncing > 0 || counts.pending === 0

  return (
    <div className="fixed inset-0 z-[160] bg-slate-950/40 p-3 sm:p-6" dir="rtl">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        aria-label="إغلاق لوحة قائمة المزامنة"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="desktop-queue-title"
        className="relative mr-auto flex max-h-[calc(100vh-1.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-[var(--app-border)] bg-white shadow-2xl sm:max-h-[calc(100vh-3rem)]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-[var(--app-border)] p-5">
          <div>
            <h2 id="desktop-queue-title" className="text-lg font-bold text-slate-900">
              قائمة انتظار المزامنة
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              الأوامر المحلية غير المتزامنة، دون عرض بيانات الطلب الداخلية.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[var(--app-border)] px-3 py-2 text-sm text-slate-600"
          >
            إغلاق
          </button>
        </header>

        <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
          {QUEUE_PANEL_STATUSES.map((status) => (
            <div key={status} className="rounded-2xl border border-[var(--app-border)] p-3">
              <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${QUEUE_STATUS_UI[status].className}`}>
                {QUEUE_STATUS_UI[status].label}
              </span>
              <strong className="mt-3 block text-2xl text-slate-900">{counts[status]}</strong>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-y border-[var(--app-border)] bg-slate-50 px-4 py-3">
          <p className="text-xs text-slate-500">تتم إعادة المحاولة حسب سياسة الخطأ المحفوظة.</p>
          <button
            type="button"
            disabled={replayDisabled}
            onClick={() => void replayPending()}
            aria-busy={isActing}
            className="shrink-0 rounded-xl bg-[var(--app-primary)] px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isActing ? 'جاري التنفيذ...' : `إعادة محاولة المعلّق (${counts.pending})`}
          </button>
        </div>

        {actionError ? (
          <p className="mx-4 mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
            {actionError}
          </p>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <p className="py-8 text-center text-sm text-slate-500">جاري تحميل قائمة الانتظار...</p>
          ) : commands.length === 0 ? (
            <p className="rounded-2xl bg-emerald-50 p-5 text-center text-sm font-semibold text-emerald-700">
              لا توجد أوامر غير متزامنة.
            </p>
          ) : (
            <ul className="space-y-3">
              {commands.map((command) => {
                const retryDisabled = isActing
                  || counts.syncing > 0
                  || !command.canRetry
                return (
                  <li key={command.commandId} className="rounded-2xl border border-[var(--app-border)] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-slate-900">
                          {describeQueueCommandType(command.commandType)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatQueueCommandTime(command.createdAt)} · المحاولات: {command.attempts}
                        </p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${QUEUE_STATUS_UI[command.status].className}`}>
                        {QUEUE_STATUS_UI[command.status].label}
                      </span>
                    </div>
                    {command.error ? (
                      <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
                        <p>{command.error.message}</p>
                        {command.error.code ? (
                          <p className="mt-1 font-mono text-[11px] text-slate-500">{command.error.code}</p>
                        ) : null}
                      </div>
                    ) : null}
                    {command.status === 'failed' || command.status === 'conflict' ? (
                      <button
                        type="button"
                        disabled={retryDisabled}
                        onClick={() => void retryFailed(command.commandId)}
                        aria-label={`${retryLabel(command)}: ${describeQueueCommandType(command.commandType)}`}
                        className="mt-3 rounded-xl border border-[var(--app-border)] px-3 py-2 text-xs font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {retryLabel(command)}
                      </button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  )
}

export function DesktopQueuePanel(props: DesktopQueuePanelProps) {
  const controller = useDesktopQueuePanel(props.open)
  return <DesktopQueuePanelView {...props} {...controller} />
}
