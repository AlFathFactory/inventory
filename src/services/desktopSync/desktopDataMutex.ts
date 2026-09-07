let locked = false
const waiters: Array<() => void> = []

function release(): void {
  const next = waiters.shift()
  if (next) next()
  else locked = false
}

function executeLocked<T>(operation: () => Promise<T>): Promise<T> {
  let result: Promise<T>
  try {
    result = operation()
  } catch (error) {
    release()
    return Promise.reject(error)
  }
  return result.finally(release)
}

/**
 * Serializes every operation that can write the desktop SQLite projection.
 * Queue replay holds it while changing remote state; the following delta then
 * takes it next, so full/delta sync and replay never race each other.
 */
export function runWithDesktopDataMutex<T>(operation: () => Promise<T>): Promise<T> {
  if (!locked) {
    locked = true
    return executeLocked(operation)
  }
  return new Promise<T>((resolve, reject) => {
    waiters.push(() => {
      executeLocked(operation).then(resolve, reject)
    })
  })
}
