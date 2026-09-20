/** A small deterministic source for human timing and policy ties. It is separate from game RNG. */
export class SeededRandom {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0
  }

  next(): number {
    let value = (this.state += 0x6d2b79f5)
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000
  }

  int(minimum: number, maximum: number): number {
    return Math.floor(this.next() * (maximum - minimum + 1)) + minimum
  }

  pick<T>(values: readonly T[]): T {
    if (!values.length) throw new Error('Cannot choose from an empty collection.')
    return values[Math.min(values.length - 1, Math.floor(this.next() * values.length))]!
  }

  weighted<T extends { weight: number }>(values: readonly T[]): T {
    const total = values.reduce((sum, value) => sum + Math.max(0, value.weight), 0)
    if (total <= 0) return this.pick(values)
    let cursor = this.next() * total
    for (const value of values) {
      cursor -= Math.max(0, value.weight)
      if (cursor <= 0) return value
    }
    return values[values.length - 1]!
  }
}
