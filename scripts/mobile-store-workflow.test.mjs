import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import yaml from 'js-yaml'
import plist from 'plist'

const workflow = yaml.load(
  readFileSync(new URL('../.github/workflows/ios-testflight.yml', import.meta.url), 'utf8')
)
const gradle = readFileSync(new URL('../android/app/build.gradle', import.meta.url), 'utf8')
const recovery = yaml.load(
  readFileSync(new URL('../.github/workflows/testflight-readiness.yml', import.meta.url), 'utf8')
)
const scripts = (job) => job.steps.map((step) => step.run ?? '').join('\n')

test('store uploads require an explicit run with a selectable platform', () => {
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch'])
  const platform = workflow.on.workflow_dispatch.inputs.platform
  assert.deepEqual(platform.options, ['both', 'ios', 'android'])
  assert.equal(platform.default, 'both')
  assert.match(workflow.jobs.quality.if, /refs\/heads\/release\/testflight-/)
  assert.match(workflow.jobs.upload.if, /inputs\.platform != 'android'/)
  assert.equal(
    workflow.jobs.android.if,
    "github.ref == 'refs/heads/main' && inputs.platform != 'ios'"
  )
})

test('signing jobs require successful source validation and use read-only repository access', () => {
  assert.equal(workflow.permissions.contents, 'read')
  assert.ok(workflow.jobs.quality.steps.some((step) => step.run === 'npm run check:pr'))
  assert.deepEqual(workflow.jobs.upload.needs, ['quality', 'cinematic-media'])
  assert.deepEqual(workflow.jobs.android.needs, ['quality', 'cinematic-media'])
  assert.equal(workflow.jobs.quality.env, undefined)
  assert.equal(workflow.jobs.upload.permissions, undefined)
  assert.equal(workflow.jobs.android.permissions, undefined)
  const media = workflow.jobs['cinematic-media']
  assert.equal(media.needs, 'quality')
  assert.equal(media.permissions.contents, 'write')
  assert.ok(media.steps.some((step) => step.run === 'node scripts/publish-vip-cinematic-pack.mjs'))
})

test('back-to-back dispatches queue without replacing pending or active uploads', () => {
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

test('iOS 27 launches the scene-based app on a simulator before archiving and uploading', () => {
  const info = plist.parse(
    readFileSync(new URL('../ios/App/App/Info.plist', import.meta.url), 'utf8')
  )
  const scenes = info.UIApplicationSceneManifest
  assert.equal(scenes.UIApplicationSupportsMultipleScenes, false)
  assert.deepEqual(scenes.UISceneConfigurations.UIWindowSceneSessionRoleApplication, [
    {
      UISceneConfigurationName: 'Main',
      UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
      UISceneStoryboardFile: 'Main',
    },
  ])
  const steps = workflow.jobs.upload.steps.map(({ name }) => name)
  const smoke = steps.indexOf('Smoke-test iOS 27 launch')
  const web = steps.indexOf('Build the production iOS web bundle')
  const archive = steps.indexOf('Archive and export the signed app')
  assert.ok(web >= 0 && smoke > web && archive > smoke)
})

test('iOS keeps both app configurations and the signed store package iPhone-only', () => {
  const project = readFileSync(
    new URL('../ios/App/App.xcodeproj/project.pbxproj', import.meta.url),
    'utf8'
  )
  const configuredFamilies = Array.from(
    project.matchAll(/TARGETED_DEVICE_FAMILY = ([^;]+);/g),
    (match) => match[1]
  )
  assert.deepEqual(configuredFamilies, ['1', '1'])
  const steps = workflow.jobs.upload.steps
  const archive = steps.findIndex(({ name }) => name === 'Archive and export the signed app')
  const verify = steps.findIndex(({ name }) => name === 'Verify the signed IPA targets iPhone only')
  const upload = steps.findIndex(({ name }) => name === 'Upload the build to App Store Connect')
  assert.ok(archive >= 0 && verify > archive && upload > verify)
  assert.match(steps[verify].run, /families != \[1\]/)
  assert.match(steps[verify].run, /UIDeviceFamily/)
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

test('readiness recovery uses an existing exact build from validated main without rebuilding or signing', () => {
  assert.deepEqual(Object.keys(recovery.on), ['workflow_dispatch'])
  assert.equal(recovery.on.workflow_dispatch.inputs.build_number.required, true)
  assert.equal(recovery.permissions.contents, 'read')
  const job = recovery.jobs.complete
  assert.equal(job.if, "github.ref == 'refs/heads/main'")
  assert.ok(job.steps.some((step) => step.run === 'npm run check:pr'))
  assert.equal(
    job.steps.find((step) => step.uses?.startsWith('actions/checkout@')).with.ref,
    '${{ github.sha }}'
  )
  const ready = job.steps.find((step) => step.run === 'node scripts/complete-testflight.mjs')
  assert.equal(ready.env.IOS_BUILD_NUMBER, '${{ inputs.build_number }}')
  assert.ok(!scripts(job).includes('xcodebuild'))
  assert.ok(!scripts(job).includes('altool'))
  assert.ok(!scripts(job).includes('gradlew'))
  assert.notEqual(recovery.concurrency.group, workflow.concurrency.group)
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

test('Android artifacts contain the signed AAB and diagnostics without exporting signing material', () => {
  const artifacts = workflow.jobs.android.steps.filter((step) =>
    step.uses?.startsWith('actions/upload-artifact@')
  )
  assert.equal(artifacts.length, 1)
  assert.match(
    artifacts[0].with.path,
    /android\/app\/build\/outputs\/bundle\/release\/app-release\.aab/
  )
  assert.match(
    artifacts[0].with.path,
    /android\/app\/build\/outputs\/mapping\/release\/mapping\.txt/
  )
  assert.match(
    artifacts[0].with.path,
    /android\/app\/build\/outputs\/native-debug-symbols\/release\/native-debug-symbols\.zip/
  )
  assert.equal(artifacts[0].with['if-no-files-found'], 'error')
  assert.match(gradle, /minifyEnabled true/)
  assert.match(gradle, /debugSymbolLevel 'FULL'/)
  assert.match(
    scripts(workflow.jobs.android),
    /BUNDLE-METADATA\/com\.android\.tools\.build\.obfuscation\/proguard\.map/
  )
  assert.match(scripts(workflow.jobs.android), /native_symbols_embedded=true/)
  assert.match(
    scripts(workflow.jobs.android),
    /Native debug symbols are not embedded; check the build warning for pre-stripped native libraries\./
  )
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

test('Google Play uploads use a scoped short-lived token after saving the signed artifact', () => {
  const steps = workflow.jobs.android.steps
  const artifact = steps.findIndex((step) => step.id === 'android_bundle')
  const connection = steps.findIndex((step) => step.id === 'play_connection')
  const auth = steps.findIndex((step) => step.id === 'google_play_auth')
  const upload = steps.findIndex((step) => step.id === 'play_upload')
  assert.ok(artifact < connection && connection < auth && auth < upload)
  assert.equal(
    steps[connection].env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON,
    '${{ secrets.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON }}'
  )
  assert.equal(steps[auth].if, "steps.play_connection.outputs.configured == 'true'")
  assert.match(steps[auth].uses, /^google-github-actions\/auth@[a-f0-9]{40}$/)
  assert.equal(steps[auth].with.token_format, 'access_token')
  assert.equal(
    steps[auth].with.access_token_scopes,
    'https://www.googleapis.com/auth/androidpublisher'
  )
  assert.equal(steps[auth].with.create_credentials_file, false)
  assert.equal(steps[auth].with.export_environment_variables, false)
  assert.equal(steps[upload].if, steps[auth].if)
  assert.equal(steps[upload].run, 'node scripts/publish-google-play-internal.mjs')
  assert.equal(
    steps[upload].env.GOOGLE_PLAY_ACCESS_TOKEN,
    '${{ steps.google_play_auth.outputs.access_token }}'
  )
  assert.ok(
    workflow.jobs.quality.steps.some(
      (step) => step.run === 'node --test scripts/google-play-internal.test.mjs'
    )
  )
})
