import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const output = path.resolve('artifacts/changing-room-preview')
await mkdir(output, { recursive: true })
const assets = {}
async function embed(relative) {
  const bytes = await readFile(path.resolve('public', relative))
  assets[relative] = `data:image/webp;base64,${bytes.toString('base64')}`
}
await embed('assets/dressing-room/dressing-room-mobile.webp')
for (let number = 1; number <= 35; number++) {
  for (const role of ['casual', 'main']) {
    await embed(`assets/player_characters/character ${number}/${role}.webp`)
  }
}

const result = await build({
  entryPoints: ['src/previews/changingRoom/ChangingRoomPreview.tsx'],
  bundle: true,
  write: false,
  outdir: output,
  format: 'iife',
  platform: 'browser',
  target: ['es2022'],
  jsx: 'automatic',
  minify: true,
  loader: { '.svg': 'dataurl' },
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{
    name: 'isolated-preview-assets',
    setup(builder) {
      builder.onResolve({ filter: /utils\/avatar$/ }, () => ({ path: 'avatar', namespace: 'preview' }))
      builder.onResolve({ filter: /preloadAppearance$/ }, () => ({ path: 'preload', namespace: 'preview' }))
      builder.onLoad({ filter: /.*/, namespace: 'preview' }, ({ path: name }) => ({
        loader: 'js',
        contents: name === 'avatar'
          ? `export function joinPublicAssetPath(value) { const key = decodeURIComponent(value.split('?')[0]).replace(/^\\//, ''); return globalThis.__LOOK_PREVIEW_ASSETS__[key] || value; }`
          : 'export async function warmAppearanceRole() {}',
      }))
    },
  }],
})
const js = result.outputFiles.find((file) => file.path.endsWith('.js'))?.text
const css = result.outputFiles.find((file) => file.path.endsWith('.css'))?.text
if (!js || !css) throw new Error('Preview bundling did not produce both JavaScript and CSS.')
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>The Big Eye — Changing Room Test Page</title><style>${css}</style></head><body><div id="root"></div><script>globalThis.__LOOK_PREVIEW_ASSETS__=${JSON.stringify(assets)};</script><script>${js.replaceAll('</script', '<\\/script')}</script></body></html>`
await writeFile(path.join(output, 'changing-room-test.html'), html)
console.log(`Built offline preview with ${Object.keys(assets).length} embedded repository assets (${Math.round(Buffer.byteLength(html) / 1024)} KB).`)
