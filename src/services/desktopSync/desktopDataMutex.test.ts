import { describe, expect, it } from 'vitest'
import { runWithDesktopDataMutex } from './desktopDataMutex'

describe('desktop data mutex', () => {
  it('serializes replay and sync work without overlap', async () => {
    const events: string[] = []
    let releaseReplay: (() => void) | undefined
    const replay = runWithDesktopDataMutex(async () => {
      events.push('replay:start')
      await new Promise<void>((resolve) => { releaseReplay = resolve })
      events.push('replay:end')
    })
    const sync = runWithDesktopDataMutex(async () => {
      events.push('sync:start')
      events.push('sync:end')
    })

    await Promise.resolve()
    expect(events).toEqual(['replay:start'])
    releaseReplay!()
    await Promise.all([replay, sync])

    expect(events).toEqual(['replay:start', 'replay:end', 'sync:start', 'sync:end'])
  })
})
