import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { handleChat, health, readBody, sendJson } from './handleChat.mjs'
import { ocrImage, readImage } from './ocr.mjs'
import { searchPublic } from './search.mjs'
import { readAudio, transcribeWav } from './transcribe.mjs'

const dist = path.resolve('dist')
const indexFile = path.join(dist, 'index.html')
if (!fs.existsSync(indexFile)) {
  console.error('还没有构建产物。开发时运行 npm run dev；要单独启动服务请先 npm run build。')
  process.exit(1)
}

const port = Number(process.env.PORT || 5173)
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

function fileFor(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0])
  const candidate = path.normalize(path.join(dist, decoded))
  const relative = path.relative(dist, candidate)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  return indexFile
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1')
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') {
      sendJson(res, 200, health())
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/chat') {
      sendJson(res, 200, await handleChat(await readBody(req)))
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/transcribe') {
      const text = await transcribeWav(await readAudio(req), url.searchParams.get('lang') || 'zh-CN')
      sendJson(res, 200, { text })
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/search') {
      const body = await readBody(req)
      sendJson(res, 200, { results: await searchPublic(body.query) })
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/ocr') {
      sendJson(res, 200, { text: await ocrImage(await readImage(req)) })
      return
    }
    if (url.pathname.startsWith('/api/')) {
      sendJson(res, 404, { error: '没有这个接口' })
      return
    }
    const file = fileFor(url.pathname)
    if (!file) {
      res.statusCode = 403
      res.end('禁止访问')
      return
    }
    res.statusCode = 200
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream')
    fs.createReadStream(file).pipe(res)
  } catch (error) {
    if (!res.headersSent) sendJson(res, error.status || 500, { error: error.message || '服务错误' })
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`镜面已在 http://127.0.0.1:${port}`)
})
