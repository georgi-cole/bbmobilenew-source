import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
const isPlayer = process.argv.includes('--player'),
  base = path.resolve(isPlayer ? 'player_characters' : 'ai_characters'),
  aiBase = path.resolve('ai_characters'),
  port = isPlayer ? 4321 : 4320
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.css': 'text/css; charset=utf-8',
}
http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1:' + port),
        pathname = decodeURIComponent(url.pathname)
      let assetRoot = base,
        route = pathname
      if (pathname === '/' || pathname === '/review.html') {
        assetRoot = aiBase
        route = '/review.html'
      } else if (pathname.startsWith('/shared/')) {
        assetRoot = path.join(aiBase, 'shared')
        route = pathname.slice('/shared'.length)
      }
      const file = path.resolve(assetRoot, '.' + route)
      if (file !== assetRoot && !file.startsWith(assetRoot + path.sep)) {
        res.writeHead(403)
        res.end()
        return
      }
      const bytes = await fs.readFile(file)
      res.writeHead(200, {
        'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      })
      res.end(bytes)
    } catch {
      res.writeHead(404)
      res.end('Not found')
    }
  })
  .listen(port, '127.0.0.1', () =>
    console.log((isPlayer ? 'Player' : 'AI') + ' artwork review: http://127.0.0.1:' + port + '/')
  )
