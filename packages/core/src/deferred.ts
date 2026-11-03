export function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>(function pending(accept, decline) {
    resolve = accept
    reject = decline
  })
  return { promise, resolve, reject, run }

  function run(action: () => T | PromiseLike<T>) {
    try {
      resolve(action())
    } catch (error) {
      reject(error)
    }
  }
}
