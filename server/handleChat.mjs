import { loadEnv } from './env.mjs'

export async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 1_000_000) {
      const error = new Error('请求体过大')
      error.status = 413
      throw error
    }
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    const error = new Error('请求体不是 JSON')
    error.status = 400
    throw error
  }
}

export function sendJson(res, status, data) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

export function health() {
  loadEnv()
  return {
    envConfigured: Boolean(process.env.OPENAI_API_KEY),
    envModel: process.env.OPENAI_MODEL || '',
  }
}

export async function handleChat(body) {
  loadEnv()
  const apiKey = String(body.apiKey || process.env.OPENAI_API_KEY || '').trim()
  const apiBase = String(body.apiBase || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
  const model = String(body.model || process.env.OPENAI_MODEL || 'gpt-4o-mini').trim()
  if (!apiKey) {
    const error = new Error('没有可用的模型密钥')
    error.status = 400
    throw error
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    const error = new Error('消息为空')
    error.status = 400
    throw error
  }
  let parsed
  try {
    parsed = new URL(apiBase)
  } catch {
    const error = new Error('模型地址不是合法 URL')
    error.status = 400
    throw error
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    const error = new Error('模型地址只支持 http 或 https')
    error.status = 400
    throw error
  }
  const endpoint = /\/chat\/completions\/?$/.test(apiBase) ? apiBase : `${apiBase}/chat/completions`
  const deepseek = /deepseek/i.test(model) || /deepseek\.com/i.test(apiBase)
  const thinking = body.thinking === 'enabled'
  const payload = {
    model,
    temperature: Number.isFinite(body.temperature) ? body.temperature : 0.4,
    max_tokens: Number.isFinite(body.maxTokens) ? body.maxTokens : 1200,
    messages: body.messages.map((message) => ({
      role: message.role,
      content: String(message.content ?? ''),
    })),
  }
  if (deepseek) {
    payload.thinking = { type: thinking ? 'enabled' : 'disabled' }
    if (thinking) {
      payload.reasoning_effort = 'low'
      payload.max_tokens = Math.min(8000, Math.max(payload.max_tokens, 2500))
    }
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(90_000) : undefined,
  })
  const raw = await response.text()
  let data
  try {
    data = raw ? JSON.parse(raw) : {}
  } catch {
    data = { error: { message: raw.slice(0, 300) } }
  }
  if (!response.ok) {
    const error = new Error(data.error?.message || `模型请求失败（${response.status}）`)
    error.status = response.status
    throw error
  }
  const choice = data.choices?.[0]
  const content = readContent(choice?.message?.content)
  if (content) return { content }
  const reasoning = readContent(choice?.message?.reasoning_content)
  if (choice?.finish_reason === 'length' && reasoning) {
    const error = new Error('模型把额度用在思考上了，还没写出回答。请再测试一次。')
    error.status = 502
    throw error
  }
  const error = new Error(reasoning ? '模型只返回了思考过程，没有最终回答。' : '模型没有返回内容')
  error.status = 502
  throw error
}

function readContent(value) {
  if (typeof value === 'string') return value.trim()
  if (!Array.isArray(value)) return ''
  return value
    .map((part) => (typeof part === 'string' ? part : part?.text || ''))
    .join('')
    .trim()
}
