import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import yaml from 'js-yaml'

const workflow = yaml.load(
  readFileSync(new URL('../.github/workflows/ios-testflight.yml', import.meta.url), 'utf8')
)
const gradle = readFileSync(new URL('../android/app/build.gradle', import.meta.url), 'utf8')
const scripts = (job) => job.steps.map((step) => step.run ?? '').join('\n')

test('every main update starts a build, while manual candidate builds remain available', () => {
  assert.deepEqual(workflow.on.push.branches, ['main'])
  assert.equal(workflow.on.push.paths, undefined)
  assert.equal(workflow.on.push['paths-ignore'], undefined)
  assert.ok(Object.hasOwn(workflow.on, 'workflow_dispatch'))
  assert.equal(workflow.on.pull_request, undefined)
  assert.equal(workflow.on.pull_request_target, undefined)
})

test('signing jobs require successful source validation and use read-only repository access', () => {
  assert.equal(workflow.permissions.contents, 'read')
  assert.ok(workflow.jobs.quality.steps.some((step) => step.run === 'npm run check:pr'))
  assert.equal(workflow.jobs.upload.needs, 'quality')
  assert.equal(workflow.jobs.android.needs, 'quality')
  assert.equal(workflow.jobs.quality.env, undefined)
})

test('back-to-back merges queue without replacing pending or active uploads', () => {
  assert.equal(workflow.concurrency['cancel-in-progress'], false)
  assert.equal(workflow.concurrency.queue, 'max')
})

test('every job builds the triggering commit rather than a moving main branch', () => {
  for (const job of Object.values(workflow.jobs)) {
    const checkout = job.steps.find((step) => step.uses?.startsWith('actions/checkout@'))
    assert.equal(checkout.with.ref, '${{ github.sha }}')
    if (job === workflow.jobs.quality) {
      assert.equal(checkout.with['fetch-depth'], 0, 'quality gates need Git comparison history')
    }
  }
})

test('iOS retries receive a distinct build number used by the native archive', () => {
  const job = workflow.jobs.upload
  assert.equal(job.env.IOS_BUILD_NUMBER, '${{ github.run_id }}.${{ github.run_attempt }}')
  assert.ok(scripts(job).includes('CURRENT_PROJECT_VERSION="$IOS_BUILD_NUMBER"'))
  assert.ok(scripts(job).includes('altool --upload-app'))
})

test('iOS upload completion includes compliance and verified internal availability', () => {
  const steps = workflow.jobs.upload.steps
  const upload = steps.findIndex((step) => step.name === 'Upload the build to App Store Connect')
  const ready = steps.findIndex((step) => step.run === 'node scripts/complete-testflight.mjs')
  const cleanup = steps.findIndex((step) => step.name === 'Remove signing materials')
  assert.ok(ready > upload && ready < cleanup)
  assert.equal(steps[ready].env.ASC_API_KEY_P8_BASE64, '${{ secrets.ASC_API_KEY_P8_BASE64 }}')
  assert.ok(
    workflow.jobs.quality.steps.some(
      (step) => step.run === 'node scripts/complete-testflight.mjs --check-policy'
    )
  )
})

test('Android signing uses the existing upload key and keeps its passwords out of arguments', () => {
  const job = workflow.jobs.android
  assert.equal(job.env.ANDROID_KEYSTORE_PASSWORD, '${{ secrets.ANDROID_KEYSTORE_PASSWORD }}')
  assert.equal(job.env.ANDROID_KEY_ALIAS, '${{ secrets.ANDROID_KEY_ALIAS }}')
  assert.equal(
    job.env.ANDROID_KEY_PASSWORD,
    '${{ secrets.ANDROID_KEY_PASSWORD || secrets.ANDROID_KEYSTORE_PASSWORD }}'
  )
  const commands = scripts(job)
  assert.ok(commands.includes('-storepass:env ANDROID_KEYSTORE_PASSWORD'))
  assert.equal(
    job.env.ANDROID_UPLOAD_CERTIFICATE_SHA1,
    '65:B5:34:95:6A:38:CF:CA:4D:8C:A2:1C:B0:E9:C6:7C:DA:A8:91:12'
  )
  assert.ok(commands.includes('node scripts/verify-android-upload-certificate.mjs'))
  assert.ok(!commands.includes('-storepass "$ANDROID_KEYSTORE_PASSWORD"'))
  assert.ok(commands.includes('./gradlew bundleRelease'))
  assert.ok(commands.includes('jarsigner -verify'))
  const cleanup = job.steps.find((step) => step.name === 'Remove the temporary upload signing key')
  assert.equal(cleanup.if, 'always()')
  assert.equal(cleanup.run, 'rm -f "$RUNNER_TEMP/android-upload-key.jks"')
  for (const value of Object.values(job.env)) {
    assert.ok(!value.includes('runner.temp'), 'runner context is unavailable in job-level env')
  }
})

test('Android artifacts contain the signed AAB without exporting signing material', () => {
  const artifacts = workflow.jobs.android.steps.filter((step) =>
    step.uses?.startsWith('actions/upload-artifact@')
  )
  assert.equal(artifacts.length, 1)
  assert.equal(artifacts[0].with.path, 'android/app/build/outputs/bundle/release/app-release.aab')
  assert.equal(artifacts[0].with['if-no-files-found'], 'error')
  assert.ok(scripts(workflow.jobs.android).includes('ANDROID_VERSION_CODE=$(date +%s)'))
  assert.ok(gradle.includes("System.getenv('ANDROID_VERSION_CODE')"))
  assert.ok(gradle.includes('automaticVersionCode.toLong() > 2100000000L'))
})

test('Android SDK setup excludes the retired tools package from action defaults', () => {
  const sdk = workflow.jobs.android.steps.find((step) =>
    step.uses?.startsWith('android-actions/setup-android@')
  )
  assert.ok(sdk.with?.packages, 'override action defaults that include the retired tools package')
  assert.ok(!sdk.with.packages.split(/\s+/).includes('tools'))
})

test('both platforms validate production account and entitlement settings before building', () => {
  for (const [name, platform] of [
    ['upload', 'ios'],
    ['android', 'android'],
  ]) {
    const job = workflow.jobs[name]
    assert.ok(scripts(job).includes('VITE_VIP_DEV_ENTITLEMENT=false'))
    assert.ok(job.steps.some((step) => step.run?.includes('verify:store-env:' + platform)))
    assert.ok(job.steps.some((step) => step.run === 'npm run sync:' + platform))
  }
})
