import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readXml(path: string): Document {
  const xml = new DOMParser().parseFromString(readFileSync(resolve(path), 'utf8'), 'text/xml')
  expect(xml.querySelector('parsererror')).toBeNull()
  return xml
}

function plistValue(xml: Document, key: string): Element | null | undefined {
  return [...xml.querySelectorAll('plist > dict > key')].find((node) => node.textContent === key)
    ?.nextElementSibling
}

describe('installed game display configuration', () => {
  it('identifies Android as a game with a portrait launch and keyboard resizing', () => {
    const manifest = readXml('android/app/src/main/AndroidManifest.xml')
    expect(manifest.querySelector('application')?.getAttribute('android:appCategory')).toBe('game')
    const activity = manifest.querySelector('activity')
    expect(activity?.getAttribute('android:screenOrientation')).toBe('portrait')
    expect(activity?.getAttribute('android:windowSoftInputMode')).toBe('adjustResize')
  })

  it('opts iOS into Game Mode and permits the landscape minigames on phones and tablets', () => {
    const info = readXml('ios/App/App/Info.plist')
    expect(plistValue(info, 'LSApplicationCategoryType')?.textContent).toBe(
      'public.app-category.games'
    )
    expect(plistValue(info, 'LSSupportsGameMode')?.tagName).toBe('true')
    expect(plistValue(info, 'GCSupportsGameMode')?.tagName).toBe('true')
    expect(plistValue(info, 'UIViewControllerBasedStatusBarAppearance')?.tagName).toBe('true')
    for (const key of [
      'UISupportedInterfaceOrientations',
      'UISupportedInterfaceOrientations~ipad',
    ]) {
      expect([...plistValue(info, key)!.children].map((node) => node.textContent)).toEqual([
        'UIInterfaceOrientationPortrait',
        'UIInterfaceOrientationLandscapeLeft',
        'UIInterfaceOrientationLandscapeRight',
      ])
    }
  })

  it('launches the iOS controller that registers native game display support', () => {
    const storyboard = readXml('ios/App/App/Base.lproj/Main.storyboard')
    const controller = storyboard.querySelector('viewController')
    expect(controller?.getAttribute('customClass')).toBe('MainViewController')
    expect(controller?.getAttribute('customModule')).toBe('App')
    expect(readFileSync(resolve('ios/App/App/MainViewController.swift'), 'utf8')).toContain(
      'registerPluginInstance(GameDisplayPlugin())'
    )
    expect(readFileSync(resolve('ios/App/App.xcodeproj/project.pbxproj'), 'utf8')).toContain(
      'MainViewController.swift in Sources'
    )
  })
})
