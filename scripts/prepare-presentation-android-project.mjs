import { execFileSync } from 'node:child_process'
import { readFile, writeFile, symlink, realpath } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const root = fileURLToPath(new URL('../', import.meta.url))
const argument = process.argv.find((value) => value.startsWith('--artifact='))?.slice(11)
if (!argument) throw new Error('Pass --artifact=<isolated Android device-test output>')
const artifact = resolve(root, argument)
const ownedRoot = resolve(root, 'renders/presentation-device-tests')
if (!artifact.startsWith(ownedRoot + sep))
  throw new Error('An isolated device-test artifact is required')
const metadata = JSON.parse(await readFile(resolve(artifact, 'device-test-artifact.json'), 'utf8'))
if (
  metadata.kind !== 'isolated-presentation-device-test-artifact' ||
  metadata.platform !== 'android' ||
  metadata.releaseApproved !== false
)
  throw new Error('Not an unapproved Android test artifact')
if (!/^com\.georgicole\.thebigeye\.q(?:base|candidate)[a-f0-9]{8}$/.test(metadata.packageId))
  throw new Error('The test app must have its own package identifier')
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 200 * 1024 * 1024 })
if (git('diff', 'HEAD', '--name-only', '--', 'android').toString().trim())
  throw new Error('Review local Android native changes before copying a reference project')
if (git('rev-parse', 'HEAD').toString().trim() !== metadata.baseRevision)
  throw new Error('The native reference revision changed; create a fresh matched artifact')
const nativeHarnessFingerprint = createHash('sha256')
  .update(await readFile(fileURLToPath(import.meta.url)))
  .digest('hex')
if (existsSync(resolve(artifact, 'android'))) {
  if (!process.argv.includes('--rebuild'))
    throw new Error(
      'The copied native project already exists; use --rebuild only for this isolated QA build'
    )
  const prior = JSON.parse(
    await readFile(resolve(artifact, 'android-project-receipt.json'), 'utf8')
  )
  if (
    prior.kind !== 'isolated-presentation-android-test-build' ||
    prior.packageId !== metadata.packageId ||
    prior.sourceArtifact.sourceFingerprint !== metadata.sourceFingerprint
  )
    throw new Error('The previous native build does not match this isolated artifact')
} else {
  const archive = resolve(artifact, 'native-android-source.tar')
  await writeFile(archive, git('archive', '--format=tar', 'HEAD', '--', 'android'))
  execFileSync('tar', ['-xf', archive, '-C', artifact], { cwd: root, stdio: 'inherit' })
}
const sourcePackage = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
await writeFile(
  resolve(artifact, 'package.json'),
  JSON.stringify(
    {
      name: 'presentation-device-test',
      version: '0.0.0',
      private: true,
      dependencies: sourcePackage.dependencies,
    },
    null,
    2
  )
)
const linkedModules = resolve(artifact, 'node_modules')
if (existsSync(linkedModules)) {
  if ((await realpath(linkedModules)) !== (await realpath(resolve(root, 'node_modules'))))
    throw new Error('Unexpected test dependency link')
} else {
  await symlink(
    resolve(root, 'node_modules'),
    linkedModules,
    process.platform === 'win32' ? 'junction' : 'dir'
  )
}
const gradlePath = resolve(artifact, 'android/app/build.gradle')
let gradle = await readFile(gradlePath, 'utf8')
if (
  (gradle.match(/applicationId "com\.georgicole\.thebigeye"/g) ?? []).length !== 1 &&
  !gradle.includes(`applicationId "${metadata.packageId}"`)
)
  throw new Error('Unexpected Android application identifier')
gradle = gradle.replace(
  'applicationId "com.georgicole.thebigeye"',
  `applicationId "${metadata.packageId}"`
)
await writeFile(gradlePath, gradle)
const stringsPath = resolve(artifact, 'android/app/src/main/res/values/strings.xml')
let strings = await readFile(stringsPath, 'utf8')
strings = strings.replace(
  /(<string name="(?:app_name|title_activity_main)">)[^<]*(<\/string>)/g,
  `$1${metadata.displayName}$2`
)
strings = strings.replace(
  /(<string name="(?:package_name|custom_url_scheme)">)[^<]*(<\/string>)/g,
  `$1${metadata.packageId}$2`
)
await writeFile(stringsPath, strings)
const manifestPath = resolve(artifact, 'android/app/src/main/AndroidManifest.xml')
let manifest = await readFile(manifestPath, 'utf8')
const aliasPattern =
  /android:name="(?:\.|com\.georgicole\.thebigeye(?:\.q(?:base|candidate)[a-f0-9]{8})?\.)StoryIconStage(\d{2})"/g
if ([...manifest.matchAll(aliasPattern)].length !== 8)
  throw new Error('Review the eight isolated launcher aliases')
manifest = manifest.replace(
  aliasPattern,
  (_match, stage) => `android:name="${metadata.packageId}.StoryIconStage${stage}"`
)
manifest = manifest
  .replaceAll(
    'android:name=".MainActivity"',
    'android:name="com.georgicole.thebigeye.MainActivity"'
  )
  .replaceAll(
    'android:targetActivity=".MainActivity"',
    'android:targetActivity="com.georgicole.thebigeye.MainActivity"'
  )
await writeFile(manifestPath, manifest)
const sdk =
  process.env.ANDROID_SDK_ROOT ??
  process.env.ANDROID_HOME ??
  (process.env.LOCALAPPDATA && resolve(process.env.LOCALAPPDATA, 'Android/Sdk'))
if (!sdk || !existsSync(resolve(sdk, 'platform-tools')))
  throw new Error('An installed Android SDK is required')
await writeFile(
  resolve(artifact, 'android/local.properties'),
  `sdk.dir=${sdk.replaceAll('\\', '/')}\n`
)
execFileSync(
  process.execPath,
  [resolve(root, 'node_modules/@capacitor/cli/bin/capacitor'), 'sync', 'android'],
  { cwd: artifact, stdio: 'inherit' }
)
const javaDirectory =
  process.env.JAVA_HOME ??
  (process.platform === 'win32' && existsSync('C:/Program Files/Android/Android Studio/jbr')
    ? 'C:/Program Files/Android/Android Studio/jbr'
    : undefined)
const environment = { ...process.env, ...(javaDirectory ? { JAVA_HOME: javaDirectory } : {}) }
const wrapper = resolve(artifact, `android/gradlew${process.platform === 'win32' ? '.bat' : ''}`)
const buildOptions = { cwd: resolve(artifact, 'android'), env: environment, stdio: 'inherit' }
if (process.platform === 'win32') {
  execFileSync('cmd.exe', ['/d', '/s', '/c', 'gradlew.bat --no-daemon assembleDebug'], buildOptions)
} else {
  execFileSync(wrapper, ['--no-daemon', 'assembleDebug'], buildOptions)
}
const apk = resolve(artifact, 'android/app/build/outputs/apk/debug/app-debug.apk')
const apkSha256 = createHash('sha256')
  .update(await readFile(apk))
  .digest('hex')
const mergedManifest = await readFile(
  resolve(
    artifact,
    'android/app/build/intermediates/merged_manifests/debug/processDebugManifest/AndroidManifest.xml'
  ),
  'utf8'
)
for (let stage = 1; stage <= 8; stage++) {
  if (
    !mergedManifest.includes(
      `android:name="${metadata.packageId}.StoryIconStage${String(stage).padStart(2, '0')}"`
    )
  )
    throw new Error('A launcher alias escaped the isolated QA identifier')
}
await writeFile(
  resolve(artifact, 'android-project-receipt.json'),
  JSON.stringify(
    {
      kind: 'isolated-presentation-android-test-build',
      sourceArtifact: metadata,
      nativeSourceRevision: git('rev-parse', 'HEAD').toString().trim(),
      packageId: metadata.packageId,
      apk: 'android/app/build/outputs/apk/debug/app-debug.apk',
      apkSha256,
      nativeHarnessFingerprint,
      verifiedIsolatedLauncherAliases: 8,
      nativeDebugBuild: true,
      productionWebRenderer: true,
      signedWithDevelopmentKey: true,
      installedOnDevice: false,
      actualPhysicalDevice: false,
      limitation:
        'A debug native wrapper permits WebView inspection. It is not a store-release performance certification.',
    },
    null,
    2
  )
)
console.log(
  JSON.stringify(
    { artifact, apk, apkSha256, installedOnDevice: false, actualPhysicalDevice: false },
    null,
    2
  )
)
