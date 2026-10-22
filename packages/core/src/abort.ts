/** Stops waiting when the signal aborts, even if the awaited work ignores the signal. */
export function raceAbort<T>(
  pending: Promise<T>,
  signal: AbortSignal | undefined,
  message: string
): Promise<T> {
  if (!signal) return pending
  return new Promise(function wait(resolve, reject) {
    function abort() {
      reject(new Error(message))
    }
    signal.addEventListener('abort', abort, { once: true })
    pending.then(resolve, reject).finally(function cleanup() {
      signal.removeEventListener('abort', abort)
    })
    if (signal.aborted) abort()
  })
}
