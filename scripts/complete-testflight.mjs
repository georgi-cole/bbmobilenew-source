import { appendFile, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  completeTestFlight,
  createAppleClient,
  verifyEncryptionInputs,
} from './lib/testflight-readiness.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const policy = JSON.parse(
  await readFile(new URL('./testflight-readiness-policy.json', import.meta.url), 'utf8')
)
await verifyEncryptionInputs(root, policy)
if (process.argv.length === 3 && process.argv[2] === '--check-policy') {
  console.log('TestFlight encryption inputs match the user-approved baseline.')
} else {
  if (process.argv.length !== 2) throw new Error('Use no arguments or --check-policy.')
  const api = createAppleClient({
    issuerId: process.env.ASC_API_ISSUER_ID,
    keyId: process.env.ASC_API_KEY_ID,
    privateKeyBase64: process.env.ASC_API_KEY_P8_BASE64,
  })
  const result = await completeTestFlight({
    api,
    policy,
    buildNumber: process.env.IOS_BUILD_NUMBER,
  })
  const summary = `## TestFlight ready\n- Build: ${result.buildNumber}\n- Status: ${result.internalBuildState}\n- Group: The Big Eye Internal\n- Reused the completed encryption answer from approved build ${policy.approvedBuildId}.\n`
  console.log(summary)
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary)
}
