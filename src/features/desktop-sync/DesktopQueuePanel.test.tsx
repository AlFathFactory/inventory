import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DesktopQueuePanelController } from './useDesktopQueuePanel'

const mocks = vi.hoisted(() => ({
  controller: null as DesktopQueuePanelController | null,
}))

vi.mock('./useDesktopQueuePanel', () => ({
  useDesktopQueuePanel: () => mocks.controller,
}))

import { DesktopQueuePanel } from './DesktopQueuePanel'

function controller(
  overrides: Partial<DesktopQueuePanelController> = {},
): DesktopQueuePanelController {
  return {
    isEnabled: true,
    isLoading: false,
    isActing: false,
    actionError: null,
    counts: { pending: 2, syncing: 1, failed: 3, conflict: 4 },
    commands: [],
    refresh: vi.fn(async () => undefined),
    replayPending: vi.fn(async () => undefined),
    retryFailed: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('DesktopQueuePanel', () => {
  beforeEach(() => {
    mocks.controller = controller()
  })

  it('renders nothing on web', () => {
    mocks.controller = controller({ isEnabled: false })

    expect(renderToStaticMarkup(
      <DesktopQueuePanel open onClose={vi.fn()} />,
    )).toBe('')
  })

  it('renders the four desktop counts and recent command diagnostics', () => {
    mocks.controller = controller({
      counts: { pending: 2, syncing: 1, failed: 1, conflict: 1 },
      commands: [{
        commandId: 'failed-1',
        commandType: 'custody_add',
        createdAt: '2026-09-08T08:00:00.000Z',
        attempts: 2,
        status: 'failed',
        error: {
          code: 'temporary_error',
          message: 'Temporary server error.',
          retryable: true,
          requiresUserAction: false,
        },
        canRetry: true,
      }],
    })

    const html = renderToStaticMarkup(
      <DesktopQueuePanel open onClose={vi.fn()} />,
    )

    expect(html).toContain('قيد الانتظار')
    expect(html).toContain('جاري الرفع')
    expect(html).toContain('فشل')
    expect(html).toContain('تعارض')
    expect(html).toContain('إضافة عهدة')
    expect(html).toContain('المحاولات: 2')
    expect(html).toContain('Temporary server error.')
    expect(html).toContain('temporary_error')
    expect(html).not.toContain('payload')
  })

  it('enables retryable failures and disables non-retryable and conflict actions', () => {
    mocks.controller = controller({
      counts: { pending: 1, syncing: 0, failed: 2, conflict: 1 },
      commands: [
        {
          commandId: 'retryable',
          commandType: 'return',
          createdAt: '2026-09-08T08:00:00.000Z',
          attempts: 1,
          status: 'failed',
          error: { code: 'network', message: 'Retry.', retryable: true, requiresUserAction: false },
          canRetry: true,
        },
        {
          commandId: 'permanent',
          commandType: 'delete_operation',
          createdAt: '2026-09-08T08:01:00.000Z',
          attempts: 1,
          status: 'failed',
          error: { code: 'invalid', message: 'No retry.', retryable: false, requiresUserAction: false },
          canRetry: false,
        },
        {
          commandId: 'conflict',
          commandType: 'custody_scrap',
          createdAt: '2026-09-08T08:02:00.000Z',
          attempts: 1,
          status: 'conflict',
          error: { code: 'review', message: 'Review.', retryable: true, requiresUserAction: true },
          canRetry: false,
        },
      ],
    })

    const html = renderToStaticMarkup(
      <DesktopQueuePanel open onClose={vi.fn()} />,
    )

    expect(html).toContain('aria-label="إعادة المحاولة: مرتجع"')
    expect(html).toContain('disabled="" aria-label="غير قابل للمحاولة: حذف حركة"')
    expect(html).toContain('disabled="" aria-label="يتطلب مراجعة: تكهين عهدة"')
  })

  it('disables every replay action while another action is running', () => {
    mocks.controller = controller({
      isActing: true,
      counts: { pending: 2, syncing: 0, failed: 0, conflict: 0 },
    })

    const html = renderToStaticMarkup(
      <DesktopQueuePanel open onClose={vi.fn()} />,
    )

    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('جاري التنفيذ...')
  })
})
