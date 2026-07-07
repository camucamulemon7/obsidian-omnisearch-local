type Subscriber<T> = (value: T) => void

export function writable<T>(initialValue: T) {
  let value = initialValue
  const subscribers = new Set<Subscriber<T>>()

  return {
    subscribe(callback: Subscriber<T>) {
      subscribers.add(callback)
      callback(value)
      return () => subscribers.delete(callback)
    },
    set(nextValue: T) {
      value = nextValue
      subscribers.forEach(callback => callback(value))
    },
    update(updater: (value: T) => T) {
      value = updater(value)
      subscribers.forEach(callback => callback(value))
    },
  }
}
