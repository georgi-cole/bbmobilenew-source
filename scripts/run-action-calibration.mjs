import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import ts from 'typescript'

const root = fileURLToPath(new URL('../', import.meta.url))
const option = (name, fallback) =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const count = Number(option('seeds', '100'))
const firstSeed = Number(option('first-seed', '1000'))
if (!Number.isInteger(count) || count < 1 || count > 10_000 || !Number.isInteger(firstSeed))
  throw new Error('Use --seeds=1..10000 and an integer --first-seed')
const output = path.resolve(root, option('out', 'test-results/action-calibration'))
const baselineRef = option('baseline-ref', 'origin/main')
const testedRef = option('tested-ref', '')
const replayFile = option('replay', '')
const sources = new Map()
const manifests = new Map()
const refs = [
  { name: option('baseline-label', 'main'), ref: baselineRef },
  ...(testedRef ? [{ name: option('tested-label', 'tested-build'), ref: testedRef }] : []),
].filter((item) => item.ref !== 'none' && !replayFile)
const sourcePaths = {
  vip: 'src/minigames/quickTapRace/vip/quickTapVipLogic.ts',
  competition: 'src/ai/competition/index.ts',
  registry: 'src/ai/competition/minigameAiRegistry.ts',
}
const git = (args) =>
  execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  }).trim()
const provenance = refs.map(({ name, ref }, i) => {
  const sha = git(['rev-parse', '--verify', `${ref}^{commit}`])
  manifests.set(i, new Set(git(['ls-tree', '-r', '--name-only', sha]).split('\n')))
  for (const [kind, sourcePath] of Object.entries(sourcePaths)) {
    const id = `virtual:action-calibration-${i}-${kind}.ts`
    sources.set(id, { i, sha, sourcePath })
  }
  return { name, ref, sha }
})

const server = await createServer({
  root,
  configFile: false,
  logLevel: 'error',
  server: { middlewareMode: true },
  appType: 'custom',
  plugins: [
    {
      name: 'calibration-historical-source',
      resolveId(id) {
        if (sources.has(id)) return `\0${id}`
      },
      load(id) {
        const entry = sources.get(id.slice(1))
        if (!id.startsWith('\0') || !entry) return
        const { i, sha, sourcePath } = entry
        const raw = git(['show', `${sha}:${sourcePath}`])
        if (sourcePath.endsWith('.json')) return `export default ${raw}`
        // Resolve the whole logic dependency graph at the historical commit.
        // Mixing old dispatchers with current helpers would invalidate the comparison.
        return ts
          .transpileModule(raw, {
            compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
          })
          .outputText.replace(
            /((?:from\s*|import\s*\()\s*['"])(\.[^'"]+)(['"])/g,
            (_, before, specifier, after) => {
              const resolved = path.posix.normalize(
                path.posix.join(path.posix.dirname(sourcePath), specifier)
              )
              const found = [
                resolved,
                `${resolved}.ts`,
                `${resolved}.tsx`,
                `${resolved}.js`,
                `${resolved}/index.ts`,
              ].find((candidate) => manifests.get(i).has(candidate))
              if (!found) throw new Error(`Cannot resolve historical ${sha}:${resolved}`)
              const dependencyId = `virtual:action-calibration-${i}/${found}`
              sources.set(dependencyId, { i, sha, sourcePath: found })
              return `${before}${dependencyId}${after}`
            }
          )
      },
    },
  ],
})
try {
  const { runActionCalibration, actionCalibrationMarkdown, replayCalibrationTrace } =
    await server.ssrLoadModule('/src/experiments/actionCalibration/actionCalibration.ts')
  if (replayFile) {
    const trace = JSON.parse(readFileSync(path.resolve(root, replayFile), 'utf8'))
    const actual = replayCalibrationTrace(trace)
    process.stdout.write(
      JSON.stringify(
        {
          game: trace.game,
          seed: trace.seed,
          expected: trace.score,
          actual,
          matches: trace.score === actual.score,
        },
        null,
        2
      ) + '\n'
    )
    if (actual.score !== trace.score) process.exitCode = 1
  } else {
    const baselines = []
    for (let i = 0; i < refs.length; i++) {
      const vip = await server.ssrLoadModule(`virtual:action-calibration-${i}-vip.ts`)
      const competition = await server.ssrLoadModule(
        `virtual:action-calibration-${i}-competition.ts`
      )
      baselines.push({
        name: refs[i].name,
        simulate(game, seed, playerId, profile) {
          return game === 'pressurePlank'
            ? {
                score: competition.simulateMinigameAiScore({
                  gameKey: game,
                  seed,
                  playerId,
                  profile,
                }),
              }
            : vip.simulateQuickTapVipAiRace({
                seed,
                playerId,
                profile,
                mode: game === 'quickTapVipRace' ? 'race' : 'seasons',
              })
        },
      })
    }
    const report = runActionCalibration({
      seeds: Array.from({ length: count }, (_, i) => (firstSeed + i) >>> 0),
      baselines,
      onProgress: (label) => process.stdout.write(`${label}\n`),
    })
    mkdirSync(output, { recursive: true })
    writeFileSync(
      path.join(output, 'report.json'),
      JSON.stringify({ provenance, ...report }, null, 2) + '\n'
    )
    writeFileSync(path.join(output, 'report.md'), actionCalibrationMarkdown(report))
    for (const example of report.examples)
      writeFileSync(
        path.join(output, `${example.game}-${example.reference}-trace.json`),
        JSON.stringify(example, null, 2) + '\n'
      )
    process.stdout.write(
      `${report.simulatedOpponents} opponent runs, ${report.verifiedReplays} replays, ${report.parityFailures.length} parity failures.\nReport: ${path.join(output, 'report.md')}\n`
    )
    if (report.parityFailures.length) process.exitCode = 1
  }
} finally {
  await server.close()
}
