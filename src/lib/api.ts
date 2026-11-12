import type { LlmMessage, Settings } from './types'

export async function fetchHealth(): Promise<{ envConfigured: boolean; envModel: string }> {
  const response = await fetch('/api/health')
  if (!response.ok) return { envConfigured: false, envModel: '' }
  const data = (await response.json()) as { envConfigured?: boolean; envModel?: string }
  return { envConfigured: Boolean(data.envConfigured), envModel: data.envModel || '' }
}

export async function chatComplete(input: {
  messages: LlmMessage[]
  settings: Settings
  temperature: number
  maxTokens: number
  thinking?: 'enabled' | 'disabled'
}) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: input.messages,
      apiKey: input.settings.apiKey,
      apiBase: input.settings.apiBase,
      model: input.settings.model,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      thinking: input.thinking ?? (input.settings.responseTiming === 'deep' ? 'enabled' : 'disabled'),
    }),
  })
  const data = (await response.json().catch(() => ({}))) as { content?: string; error?: string }
  if (!response.ok) throw new Error(data.error || '模型请求失败')
  if (!data.content) throw new Error('模型没有返回内容')
  return data.content
}

export async function searchPublic(query: string) {
  const response = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const data = (await response.json().catch(() => ({}))) as {
    results?: { title?: string; url?: string; snippet?: string; extract?: string }[]
  }
  if (!response.ok || !Array.isArray(data.results)) return []
  return data.results
    .filter((item) => item.title && item.url)
    .slice(0, 5)
    .map((item) => ({
      title: item.title || '',
      url: item.url || '',
      snippet: item.snippet || '',
      extract: item.extract || '',
    }))
}

export async function readScreenshot(file: Blob) {
  const response = await fetch('/api/ocr', {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'image/png' },
    body: await file.arrayBuffer(),
  })
  const data = (await response.json().catch(() => ({}))) as { text?: string; error?: string }
  if (!response.ok) throw new Error(data.error || '截图识别失败')
  return (data.text || '').trim()
}

export async function transcribeSpeech(wav: ArrayBuffer, language: 'zh' | 'en') {
  const response = await fetch(`/api/transcribe?lang=${language === 'en' ? 'en-US' : 'zh-CN'}`, {
    method: 'POST',
    headers: { 'Content-Type': 'audio/wav' },
    body: wav,
  })
  const data = (await response.json().catch(() => ({}))) as { text?: string; error?: string }
  if (!response.ok) throw new Error(data.error || '本机语音识别失败')
  return (data.text || '').trim()
}
