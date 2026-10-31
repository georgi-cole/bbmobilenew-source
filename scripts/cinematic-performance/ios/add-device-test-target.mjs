import xcode from 'xcode'
import plist from 'plist'
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { resolve, dirname, basename, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const quote = (value) => `"${value}"`
const unquote = (value) => String(value ?? '').replace(/^"|"$/g, '')
const xml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')

/** Modifies an isolated copied project; never the repository's normal iOS app. */
export async function addDeviceTestTarget({ projectPath, packageId, displayName }) {
  const targetPath = resolve(projectPath)
  const ownedRoots = [
    resolve(root, 'renders/presentation-device-tests'),
    resolve(root, 'renders/presentation-mac-tests'),
  ]
  if (
    !ownedRoots.some((directory) => targetPath.startsWith(directory + sep)) ||
    !targetPath.endsWith(`${sep}project.pbxproj`)
  )
    throw new Error('An isolated QA Xcode project is required')
  if (!/^com\.georgicole\.thebigeye\.q(?:base|candidate)[a-f0-9]{8}$/.test(packageId))
    throw new Error('The test app must have its own package identifier')
  const project = xcode.project(targetPath)
  project.parseSync()
  const native = project.pbxNativeTargetSection()
  const applications = Object.entries(native).filter(
    ([, value]) =>
      value?.isa === 'PBXNativeTarget' &&
      unquote(value.productType) === 'com.apple.product-type.application'
  )
  if (applications.length !== 1) throw new Error('Expected exactly one copied application target')
  if (
    Object.values(native).some(
      (value) =>
        value?.isa === 'PBXNativeTarget' && unquote(value.name) === 'PresentationDeviceTests'
    )
  )
    throw new Error('Device test target already exists')
  const [applicationId, application] = applications[0]
  project.hash.project.objects.PBXTargetDependency ??= {}
  project.hash.project.objects.PBXContainerItemProxy ??= {}
  const oldDependencies = [...application.dependencies]
  const target = project.addTarget(
    'PresentationDeviceTests',
    'unit_test_bundle',
    'PresentationDeviceTests',
    `${packageId}.uitests`
  )
  target.pbxNativeTarget.productType = quote('com.apple.product-type.bundle.ui-testing')
  const productId = target.pbxNativeTarget.productReference
  const productName = 'PresentationDeviceTests.xctest'
  const fileReferences = project.pbxFileReferenceSection()
  Object.assign(fileReferences[productId], {
    name: quote(productName),
    path: quote(productName),
    explicitFileType: quote('wrapper.cfbundle'),
    sourceTree: 'BUILT_PRODUCTS_DIR',
  })
  fileReferences[`${productId}_comment`] = productName
  target.pbxNativeTarget.productReference_comment = productName
  for (const group of Object.values(project.hash.project.objects.PBXGroup)) {
    for (const child of group?.children ?? []) {
      if (child.value === productId) child.comment = productName
    }
  }
  // The generic bundle helper picks .mdimporter and adds an orphaned Copy
  // Files entry. UI tests use a .xctest product without an embedded copy.
  const buildFiles = project.pbxBuildFileSection()
  for (const [id, entry] of Object.entries(buildFiles)) {
    if (entry?.fileRef === productId) {
      delete buildFiles[id]
      delete buildFiles[`${id}_comment`]
    }
  }
  // addTarget creates an application -> test dependency; UI tests need the
  // opposite direction and must not introduce a target cycle.
  application.dependencies = oldDependencies
  project.addTargetDependency(target.uuid, [applicationId])
  for (const [type, name] of [
    ['PBXSourcesBuildPhase', 'Sources'],
    ['PBXFrameworksBuildPhase', 'Frameworks'],
    ['PBXResourcesBuildPhase', 'Resources'],
  ])
    project.addBuildPhase([], type, name, target.uuid)
  const group = project.addPbxGroup([], 'PresentationDeviceTests', 'PresentationDeviceTests')
  project.addToPbxGroup(group.uuid, project.getFirstProject().firstProject.mainGroup)
  project.addSourceFile('PresentationDeviceTests.swift', { target: target.uuid }, group.uuid)

  const configurations = project.pbxXCBuildConfigurationSection()
  const configurationLists = project.hash.project.objects.XCConfigurationList
  for (const reference of configurationLists[application.buildConfigurationList]
    .buildConfigurations) {
    configurations[reference.value].buildSettings.PRODUCT_BUNDLE_IDENTIFIER = quote(packageId)
  }
  for (const reference of configurationLists[target.pbxNativeTarget.buildConfigurationList]
    .buildConfigurations) {
    const settings = configurations[reference.value].buildSettings
    delete settings.INFOPLIST_FILE
    Object.assign(settings, {
      GENERATE_INFOPLIST_FILE: 'YES',
      WRAPPER_EXTENSION: 'xctest',
      PRODUCT_BUNDLE_IDENTIFIER: quote(`${packageId}.uitests`),
      CODE_SIGN_STYLE: 'Automatic',
      SWIFT_VERSION: '5.0',
      SWIFT_STRICT_CONCURRENCY: 'minimal',
      SDKROOT: 'iphoneos',
      SUPPORTED_PLATFORMS: quote('iphoneos iphonesimulator'),
      IPHONEOS_DEPLOYMENT_TARGET: '15.0',
      TARGETED_DEVICE_FAMILY: quote('1,2'),
      TEST_TARGET_NAME: quote(unquote(application.name)),
      ENABLE_TESTING_SEARCH_PATHS: 'YES',
      FRAMEWORK_SEARCH_PATHS: [
        quote('$(inherited)'),
        quote('$(PLATFORM_DIR)/Developer/Library/Frameworks'),
      ],
      LD_RUNPATH_SEARCH_PATHS: [
        quote('$(inherited)'),
        quote('@executable_path/Frameworks'),
        quote('@loader_path/Frameworks'),
      ],
    })
  }
  const attributes = project.getFirstProject().firstProject.attributes
  attributes.TargetAttributes ??= {}
  attributes.TargetAttributes[target.uuid] = {
    CreatedOnToolsVersion: '16.0',
    TestTargetID: applicationId,
    ProvisioningStyle: 'Automatic',
  }

  const projectDirectory = dirname(dirname(targetPath))
  const infoPath = resolve(projectDirectory, 'App/Info.plist')
  const info = plist.parse(await readFile(infoPath, 'utf8'))
  info.CFBundleDisplayName = displayName
  for (const url of info.CFBundleURLTypes ?? []) {
    url.CFBundleURLSchemes = (url.CFBundleURLSchemes ?? []).map((scheme) =>
      scheme === 'com.georgicole.thebigeye' ? packageId : scheme
    )
  }
  await writeFile(infoPath, plist.build(info))
  await mkdir(resolve(projectDirectory, 'PresentationDeviceTests'), { recursive: true })
  await copyFile(
    fileURLToPath(new URL('./PresentationDeviceTests.swift', import.meta.url)),
    resolve(projectDirectory, 'PresentationDeviceTests/PresentationDeviceTests.swift')
  )
  const removeUndefined = (value) => {
    if (!value || typeof value !== 'object') return
    for (const key of Object.keys(value)) {
      if (value[key] === undefined) delete value[key]
      else removeUndefined(value[key])
    }
  }
  removeUndefined(project.hash)
  await writeFile(targetPath, project.writeSync())
  const checked = xcode.project(targetPath)
  checked.parseSync()
  const checkedTarget = checked.pbxNativeTargetSection()[target.uuid]
  const dependency =
    checked.hash.project.objects.PBXTargetDependency[checkedTarget.dependencies[0]?.value]
  if (
    dependency?.target !== applicationId ||
    unquote(checked.pbxFileReferenceSection()[productId].path) !== productName ||
    checked
      .pbxNativeTargetSection()
      [
        applicationId
      ].dependencies.some((reference) => checked.hash.project.objects.PBXTargetDependency[reference.value]?.target === target.uuid)
  )
    throw new Error('Invalid copied UI test product or dependency graph')

  const container = `container:${basename(dirname(targetPath))}`
  const reference = (id, product, name) =>
    `<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="${xml(id)}" BuildableName="${xml(product)}" BlueprintName="${xml(name)}" ReferencedContainer="${xml(container)}"/>`
  const appReference = reference(applicationId, 'App.app', unquote(application.name))
  const testReference = reference(
    target.uuid,
    'PresentationDeviceTests.xctest',
    'PresentationDeviceTests'
  )
  const scheme = `<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1600" version="1.3">
 <BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries>
  <BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="NO" buildForAnalyzing="YES">${appReference}</BuildActionEntry>
  <BuildActionEntry buildForTesting="YES" buildForRunning="NO" buildForProfiling="NO" buildForArchiving="NO" buildForAnalyzing="YES">${testReference}</BuildActionEntry>
 </BuildActionEntries></BuildAction>
 <TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv="YES">
  <Testables><TestableReference skipped="NO">${testReference}</TestableReference></Testables><MacroExpansion>${appReference}</MacroExpansion>
 </TestAction>
 <LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0">${appReference}</BuildableProductRunnable></LaunchAction>
 <ProfileAction buildConfiguration="Debug" shouldUseLaunchSchemeArgsEnv="YES" savedToolIdentifier="" useCustomWorkingDirectory="NO" debugDocumentVersioning="YES"><BuildableProductRunnable runnableDebuggingMode="0">${appReference}</BuildableProductRunnable></ProfileAction>
 <AnalyzeAction buildConfiguration="Debug"/><ArchiveAction buildConfiguration="Debug" revealArchiveInOrganizer="NO"/>
</Scheme>`
  const schemes = resolve(dirname(targetPath), 'xcshareddata/xcschemes')
  await mkdir(schemes, { recursive: true })
  await writeFile(resolve(schemes, 'PresentationDeviceTests.xcscheme'), scheme)
  return {
    applicationTarget: applicationId,
    testTarget: target.uuid,
    scheme: 'PresentationDeviceTests',
    packageId,
  }
}
