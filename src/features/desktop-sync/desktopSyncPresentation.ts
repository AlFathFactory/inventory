import type { DesktopSyncPhase } from '../../services/desktopSync/syncStatusStore'

/**
 * Pure presentation helpers for the sync status surface, kept out of the
 * component so they can be tested without a DOM renderer.
 */

export interface PhaseUi {
  label: string
  className: string
}

const PHASE_UI: Record<DesktopSyncPhase, PhaseUi> = {
  idle: { label: 'بانتظار المزامنة', className: 'bg-slate-100 text-slate-700' },
  syncing: { label: 'جاري المزامنة', className: 'bg-blue-50 text-blue-700' },
  synced: { label: 'تمت المزامنة', className: 'bg-emerald-50 text-emerald-700' },
  failed: { label: 'فشلت المزامنة', className: 'bg-red-50 text-red-700' },
}

export function describeSyncPhase(phase: DesktopSyncPhase): PhaseUi {
  return PHASE_UI[phase]
}

export const NEVER_SYNCED_LABEL = 'لم تتم أي مزامنة بعد'

/** Last successful sync time, or a clear "never" for a fresh install. */
export function formatLastSync(value: string | null): string {
  if (!value) return NEVER_SYNCED_LABEL

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return NEVER_SYNCED_LABEL

  return `آخر مزامنة: ${date.toLocaleString('ar-EG', {
    dateStyle: 'short',
    timeStyle: 'short',
  })}`
}
