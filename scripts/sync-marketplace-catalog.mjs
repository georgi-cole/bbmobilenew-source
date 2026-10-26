import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import prettier from 'prettier'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = new URL('../docs/MARKETPLACE_CATALOG.md', import.meta.url)
const server = await createServer({
  root,
  configFile: false,
  mode: 'marketplace-reference',
  envPrefix: 'MARKETPLACE_REFERENCE_UNUSED_',
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, watch: null },
  appType: 'custom',
})

try {
  const { renderMarketplaceDocumentation } = await server.ssrLoadModule(
    '/src/vip/marketplaceDocumentation.ts'
  )
  const outputPath = fileURLToPath(output)
  const formatted = await prettier.format(renderMarketplaceDocumentation(), {
    ...((await prettier.resolveConfig(outputPath)) ?? {}),
    filepath: outputPath,
  })

  if (process.argv.includes('--check')) {
    const current = await readFile(output, 'utf8').catch((error) => {
      if (error.code === 'ENOENT') return ''
      throw error
    })
    if (current.replaceAll('\r\n', '\n') !== formatted.replaceAll('\r\n', '\n')) {
      console.error('Marketplace documentation is stale. Run npm run generate:marketplace.')
      process.exitCode = 1
    } else {
      console.log('Marketplace documentation matches the runtime catalogs.')
    }
  } else {
    await writeFile(output, formatted, 'utf8')
    console.log('Updated docs/MARKETPLACE_CATALOG.md from the runtime catalogs.')
  }
} finally {
  await server.close()
}
