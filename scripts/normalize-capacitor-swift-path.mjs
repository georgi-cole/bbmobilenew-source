import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const packageFile = resolve('ios/App/CapApp-SPM/Package.swift')
const current = readFileSync(packageFile, 'utf8')
const normalized = current.replace(
  /path: "([^"]+)"/g,
  (_match, path) => `path: "${path.replaceAll('\\', '/')}"`
)

if (normalized !== current) {
  writeFileSync(packageFile, normalized)
  console.log('Normalized the local Swift package path for cross-platform builds.')
}
