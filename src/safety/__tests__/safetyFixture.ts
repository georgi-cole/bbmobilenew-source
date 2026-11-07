import {
  declarePlayerAge,
  setOptionalPlayerFeature,
  type OptionalPlayerFeature,
} from '../playerSafety'

/** A fresh storage surface models a separate install without a production reset bypass. */
export function installSafetyFixture(age?: number, features: OptionalPlayerFeature[] = []) {
  const values = new Map<string, string>()
  const storage: Storage = {
    get length() {
      return values.size
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(String(key), String(value))
    },
    removeItem: (key) => {
      values.delete(key)
    },
    clear: () => {
      values.clear()
    },
  }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
  Object.defineProperty(window, 'localStorage', { configurable: true, value: storage })
  if (age !== undefined) declarePlayerAge(age)
  features.forEach((feature) => setOptionalPlayerFeature(feature, true))
  return storage
}
