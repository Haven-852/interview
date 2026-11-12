import { handleChat, health, readBody, sendJson } from './handleChat.mjs'
import { ocrImage, readImage } from './ocr.mjs'
import { searchPublic } from './search.mjs'
import { readAudio, transcribeWav } from './transcribe.mjs'

async function handle(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/health') {
    sendJson(res, 200, health())
    return
  }
    if (req.method === 'POST' && url.pathname === '/api/chat') {
      const body = await readBody(req)
      sendJson(res, 200, await handleChat(body))
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/transcribe') {
      const text = await transcribeWav(await readAudio(req), url.searchParams.get('lang') || 'zh-CN')
      sendJson(res, 200, { text })
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/search') {
      const body = await readBody(req)
      const results = await searchPublic(body.query)
      sendJson(res, 200, { results })
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/ocr') {
      const text = await ocrImage(await readImage(req))
      sendJson(res, 200, { text })
      return
    }
  sendJson(res, 404, { error: '没有这个接口' })
}

function attach(middlewares) {
  middlewares.use((req, res, next) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    if (!url.pathname.startsWith('/api/')) return next()
    handle(req, res, url).catch((error) => {
      if (res.headersSent) return
      sendJson(res, error.status || 500, { error: error.message || '服务错误' })
    })
  })
}

export function mirrorApi() {
  return {
    name: 'mirror-api',
    configureServer(server) {
      attach(server.middlewares)
    },
    configurePreviewServer(server) {
      attach(server.middlewares)
    },
  }
}
