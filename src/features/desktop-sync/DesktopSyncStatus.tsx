import { useDesktopSync } from './useDesktopSync'
import { describeSyncPhase, formatLastSync } from './desktopSyncPresentation'

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 4v5h-5" />
    </svg>
  )
}

/**
 * Minimal desktop sync surface: current status, last successful sync time,
 * and a manual refresh. Renders nothing on web — the runtime check lives in
 * `useDesktopSync`, not here.
 */
export function DesktopSyncStatus() {
  const { isEnabled, phase, isSyncing, lastSuccessfulSyncAt, lastError, refresh } = useDesktopSync()

  if (!isEnabled) return null

  const ui = describeSyncPhase(phase)

  return (
    <div className="flex items-center gap-2">
      <div className="text-left">
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${ui.className}`}>
          {ui.label}
        </span>
        <p className="mt-1 text-[11px] text-[var(--app-text-muted)]">
          {formatLastSync(lastSuccessfulSyncAt)}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void refresh()}
        disabled={isSyncing}
        title={lastError ?? 'تحديث البيانات من الخادم'}
        aria-label="تحديث البيانات من الخادم"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--app-border)] text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={isSyncing ? 'animate-spin' : undefined}>
          <RefreshIcon />
        </span>
      </button>
    </div>
  )
}
