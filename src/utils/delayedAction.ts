export function createDelayedAction<T>(action: (value: T) => void, delayMs = 250) {
  let timer: ReturnType<typeof setTimeout> | null = null

  function cancel() {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
  }

  return {
    schedule(value: T) {
      cancel()
      timer = setTimeout(() => {
        timer = null
        action(value)
      }, delayMs)
    },
    cancel,
    runNow(value: T) {
      cancel()
      action(value)
    },
    dispose: cancel,
  }
}
