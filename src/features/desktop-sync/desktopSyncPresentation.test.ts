import { describe, expect, it } from 'vitest'
import {
  describeConnectivityState,
  describeSyncPhase,
  formatLastSync,
  NEVER_SYNCED_LABEL,
} from './desktopSyncPresentation'
import type { DesktopSyncPhase } from '../../services/desktopSync/syncStatusStore'

describe('describeSyncPhase', () => {
  const phases: DesktopSyncPhase[] = ['idle', 'syncing', 'synced', 'failed']

  it('labels every phase the status surface can be in', () => {
    for (const phase of phases) {
      expect(describeSyncPhase(phase).label).toBeTruthy()
      expect(describeSyncPhase(phase).className).toBeTruthy()
    }
  })

  it('distinguishes syncing, synced and failed', () => {
    const labels = phases.map((phase) => describeSyncPhase(phase).label)
    expect(new Set(labels).size).toBe(phases.length)
    expect(describeSyncPhase('syncing').label).toBe('جاري المزامنة')
    expect(describeSyncPhase('synced').label).toBe('تمت المزامنة')
    expect(describeSyncPhase('failed').label).toBe('فشلت المزامنة')
  })
})

describe('describeConnectivityState', () => {
  it('provides distinct desktop labels for all typed connectivity states', () => {
    const labels = ['online', 'offline', 'checking']
      .map((state) => describeConnectivityState(state as 'online' | 'offline' | 'checking').label)

    expect(new Set(labels).size).toBe(3)
    expect(describeConnectivityState('online').label).toBe('متصل')
    expect(describeConnectivityState('offline').label).toBe('غير متصل')
  })
})

describe('formatLastSync', () => {
  it('reports a fresh install as never synced', () => {
    expect(formatLastSync(null)).toBe(NEVER_SYNCED_LABEL)
  })

  it('ignores an unparseable stored timestamp instead of rendering NaN', () => {
    expect(formatLastSync('not-a-date')).toBe(NEVER_SYNCED_LABEL)
  })

  it('renders a stored timestamp', () => {
    const label = formatLastSync('2026-09-05T08:30:00.000Z')
    expect(label.startsWith('آخر مزامنة:')).toBe(true)
    expect(label).not.toContain('Invalid')
  })
})
