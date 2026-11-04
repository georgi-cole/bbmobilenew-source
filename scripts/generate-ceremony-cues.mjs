// Offline, deterministic placeholder sound design. Never runs in the game/build.
// Replace the WAVs directly when commissioned recordings are ready.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const rate = 24000
const root = resolve('public/assets/sounds/ceremonies')
mkdirSync(root, { recursive: true })
const recipes = {
  transition: [0.52, 400, 1100, 0.9],
  suspense: [1.6, 95, 125, 0.15],
  reveal: [0.72, 220, 440, 0.28],
  shield: [0.95, 660, 880, 0.1],
  save: [0.85, 330, 660, 0.3],
  impact: [0.8, 105, 40, 0.65],
  door: [0.65, 145, 48, 0.8],
}
for (const [name, [seconds, from, to, noiseMix]] of Object.entries(recipes)) {
  const n = Math.round(rate * seconds),
    samples = new Float64Array(n)
  let seed = 19271,
    filtered = 0,
    phase = 0,
    peak = 0
  for (let i = 0; i < n; i++) {
    const t = i / rate,
      u = i / n
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    filtered += 0.12 * (seed / 2147483648 - 1 - filtered)
    phase += (2 * Math.PI * (from + (to - from) * u)) / rate
    const envelope =
      Math.sin(Math.PI * u) ** 2 * Math.exp(-u * (name === 'impact' || name === 'door' ? 5 : 1.5))
    const tone =
      Math.sin(phase) * 0.55 +
      Math.sin(phase * 1.5) * 0.22 * Math.exp(-t * 5) +
      Math.sin(phase * 2.01) * 0.12 * Math.exp(-t * 8)
    samples[i] = envelope * (tone * (1 - noiseMix) + filtered * noiseMix * 3)
    peak = Math.max(peak, Math.abs(samples[i]))
  }
  const out = Buffer.alloc(44 + n * 2)
  out.write('RIFF')
  out.writeUInt32LE(out.length - 8, 4)
  out.write('WAVEfmt ', 8)
  out.writeUInt32LE(16, 16)
  out.writeUInt16LE(1, 20)
  out.writeUInt16LE(1, 22)
  out.writeUInt32LE(rate, 24)
  out.writeUInt32LE(rate * 2, 28)
  out.writeUInt16LE(2, 32)
  out.writeUInt16LE(16, 34)
  out.write('data', 36)
  out.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++)
    out.writeInt16LE(Math.round((samples[i] / peak) * 0.65 * 32767), 44 + i * 2)
  writeFileSync(resolve(root, name + '.wav'), out)
}
console.log('Generated seven replaceable mono 24 kHz ceremony WAV cues')
