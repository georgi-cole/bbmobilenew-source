import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const resultsRoot = path.join(root, 'test-results')
const child = spawn(process.execPath, ['scripts/run-season-simulation.mjs'], {
  cwd: root,
  env: process.env,
  stdio: ['inherit', 'inherit', 'inherit'],
})

async function findProgressFile(directory) {
  let entries
  try {
    entries = await fs.readdir(directory, { withFileTypes: true })
  } catch {
    return null
  }
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      const nested = await findProgressFile(candidate)
      if (nested) return nested
    } else if (entry.name === 'season-simulation-progress.json') {
      return candidate
    }
  }
  return null
}

function render(progress) {
  process.stdout.write('\x1b[2J\x1b[H')
  if (!progress) {
    console.log('Season simulation\n\nStarting browser and waiting for the first checkpoint…')
    return
  }
  const elapsed = Math.floor(progress.elapsedMs / 1000)
  const minutes = Math.floor(elapsed / 60)
  const seconds = String(elapsed % 60).padStart(2, '0')
  console.log(`${progress.mode} · ${progress.persona}`)
  console.log(`\nDay ${progress.day}`)
  console.log(`Phase: ${progress.phase}`)
  console.log(`Last action: ${progress.lastAction}`)
  console.log(`Actions: ${progress.actions}`)
  console.log(`Findings: ${progress.findings}`)
  console.log(`Objectives: ${progress.objectivesVerified} / ${progress.objectivesTotal}`)
  console.log(`Elapsed: ${minutes}m ${seconds}s`)
  console.log(
    `\nProgress file: ${path.relative(root, path.join(resultsRoot, '…', 'season-simulation-progress.json'))}`
  )
}

let lastProgressPath = null
const timer = setInterval(async () => {
  const progressPath = await findProgressFile(resultsRoot)
  if (!progressPath) {
    render(null)
    return
  }
  lastProgressPath = progressPath
  try {
    render(JSON.parse(await fs.readFile(progressPath, 'utf8')))
  } catch {
    render(null)
  }
}, 1000)

child.on('exit', (code, signal) => {
  clearInterval(timer)
  if (lastProgressPath) console.log(`\nFinal progress: ${lastProgressPath}`)
  process.exitCode = code ?? (signal ? 1 : 0)
})
