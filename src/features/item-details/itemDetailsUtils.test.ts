import { describe, expect, it } from 'vitest'
import type { ItemMovement } from '../../services/itemsService'
import { getLatestMovementId } from './itemDetailsUtils'

function movement(
  id: string,
  operationDate: string,
  createdAt: string | null,
): ItemMovement {
  return {
    id,
    operation_date: operationDate,
    created_at: createdAt,
  } as ItemMovement
}

describe('getLatestMovementId', () => {
  it('uses insertion time instead of the displayed operation-date order', () => {
    const displayedMovements = [
      movement('older-entry', '2026-08-31', '2026-08-20T09:00:00Z'),
      movement('latest-entry', '2026-08-01', '2026-08-31T09:00:00Z'),
    ]

    expect(getLatestMovementId(displayedMovements)).toBe('latest-entry')
  })

  it('uses the movement id as the deterministic tie-breaker', () => {
    const createdAt = '2026-08-31T09:00:00Z'
    const movements = [
      movement('00000000-0000-0000-0000-000000000001', '2026-08-31', createdAt),
      movement('00000000-0000-0000-0000-000000000002', '2026-08-01', createdAt),
    ]

    expect(getLatestMovementId(movements)).toBe(
      '00000000-0000-0000-0000-000000000002',
    )
  })

  it('puts movements without an insertion time behind timestamped movements', () => {
    const movements = [
      movement('no-created-at', '2026-08-31', null),
      movement('timestamped', '2026-08-01', '2026-08-20T09:00:00Z'),
    ]

    expect(getLatestMovementId(movements)).toBe('timestamped')
    expect(getLatestMovementId([])).toBeUndefined()
  })
})
