const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
const MOBILE_AGENT =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36'

const cache = new Map()

function decode(text) {
  let value = String(text || '').replace(/<[^>]+>/g, ' ')
  for (let pass = 0; pass < 2; pass += 1) {
    value = value
      .replace(/&nbsp;|&#160;|&ensp;|&#8194;|&emsp;|&#8195;/gi, ' ')
      .replace(/&middot;|&#0*183;/gi, '·')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;|&#0*34;/gi, '"')
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => fromCode(Number.parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, digits) => fromCode(Number(digits)))
  }
  return value.replace(/\s+/g, ' ').trim()
}

function fromCode(code) {
  if (!Number.isFinite(code) || code < 32 || code > 0x10ffff) return ' '
  return String.fromCodePoint(code)
}

function pushResult(results, seen, item) {
  if (results.length >= 5) return
  const title = item.title.slice(0, 120)
  const url = item.url.split('#')[0]
  if (title.length < 6 || !url.startsWith('http')) return
  if (/so\.com|360\.cn|bing\.com|baidu\.com\/(s\?|link)|recommend_list|top\.baidu/i.test(url)) return
  if (/软件园|官方最新版|破解版|百度图片/.test(title)) return
  if (seen.has(url) || seen.has(title)) return
  seen.add(url)
  seen.add(title)
  results.push({ title, url, snippet: item.snippet.slice(0, 360) })
}

function relevant(question, item) {
  const hay = `${item.title} ${item.snippet}`.toLowerCase()
  const tokens = new Set((question.match(/[a-z][a-z0-9+#.-]{2,}/gi) || []).map((word) => word.toLowerCase()))
  for (const term of ['分发', '工具', '参数', '校验', '回退', '路由', '映射', '技能', '调度']) {
    if (question.includes(term)) tokens.add(term)
  }
  if (/skill|tool/i.test(question) && !/skill|tool|agent|智能体/.test(hay)) return false
  if (!tokens.size) return true
  let hits = 0
  for (const token of tokens) if (hay.includes(token)) hits += 1
  return hits >= Math.min(2, tokens.size)
}

function realJump(href) {
  try {
    const value = decodeURIComponent(href.replace(/&amp;/g, '&'))
    const direct = value.match(/[?&]u=(https?:\/\/[^&]+)/)?.[1]
    if (direct) return direct
    const packed = value.match(/[?&]u=([^&]+)/)?.[1]
    if (!packed) return ''
    const decoded = Buffer.from(decodeURIComponent(packed), 'base64').toString('utf8')
    return decoded.startsWith('http') ? decoded : ''
  } catch {
    return ''
  }
}

function parseMobileSo(html) {
  if (/访问异常|安全验证/.test(html.slice(0, 1500))) return []
  const results = []
  const seen = new Set()
  const pattern =
    /href="(https?:\/\/m\.so\.com\/jump\?u=[^"]+)"[\s\S]{0,400}?class="res-title">([\s\S]*?)<\/h3>[\s\S]{0,2500}?class="summary[^"]*">([\s\S]*?)<\/div>/gi
  for (const match of html.matchAll(pattern)) {
    pushResult(results, seen, {
      title: decode(match[2]),
      url: realJump(match[1]),
      snippet: decode(match[3]).replace(/文章浏览阅读\d+次。?/g, '').trim(),
    })
  }
  return results
}

function snippetFrom(part) {
  const packed = part.slice(0, 12000).match(/<!--s-data:([\s\S]*?)-->/)
  if (packed) {
    try {
      const json = JSON.parse(packed[1])
      const lines = json.summaryData?.generalLines || []
      const text = decode(lines.flatMap((line) => (line.data || []).map((item) => item.text || '')).join(' '))
      if (text) return text
    } catch {
      // 摘要结构不固定时，改抓页面里的短文本。
    }
  }
  try {
    return [...part.slice(0, 8000).matchAll(/"text":"((?:\\.|[^"\\])*)"/g)]
      .slice(0, 2)
      .map((item) => decode(JSON.parse(`"${item[1]}"`)))
      .join(' ')
  } catch {
    return ''
  }
}

function parseMobileBaidu(html) {
  if (/安全验证/.test(html.slice(0, 800))) return []
  const results = []
  const seen = new Set()
  for (const part of html.split('class="c-result result"').slice(1)) {
    pushResult(results, seen, {
      title: decode(part.match(/<!--s-text-->([\s\S]*?)<!--\/s-text-->/)?.[1] || ''),
      url: part.match(/"mu":"(https?:[^"\\]+)"/)?.[1] || '',
      snippet: snippetFrom(part),
    })
  }
  return results
}

function parseDesktopBaidu(html) {
  if (/安全验证/.test(html.slice(0, 800))) return []
  const results = []
  const seen = new Set()
  for (const part of html.split('<!--s-text-->').slice(1)) {
    const title = decode(part.split('<!--/s-text-->')[0] || '')
    const window = part.slice(0, 12000)
    pushResult(results, seen, {
      title,
      url: decode(window.match(/\bmu="(https?:\/\/[^"]+)"/i)?.[1] || ''),
      snippet: snippetFrom(window),
    })
  }
  return results
}

function parseBaidu(html) {
  const mobile = parseMobileBaidu(html)
  return mobile.length ? mobile : parseDesktopBaidu(html)
}

function parseDesktopSo(html) {
  if (/访问异常|安全验证/.test(html.slice(0, 1500))) return []
  const results = []
  const seen = new Set()
  for (const block of html.split('class="res-title"').slice(1)) {
    const title = decode(block.match(/<a[\s\S]*?>([\s\S]*?)<\/a>/i)?.[1] || '')
    let snippet = decode(block)
    snippet = snippet.replace(/^[>\s]+/, '')
    if (title && snippet.startsWith(title)) snippet = snippet.slice(title.length).trim()
    snippet = snippet.replace(/文章浏览阅读\d+次。?/g, '').replace(/[\w.-]+\.(?:com|cn|net|org)\s*反馈/gi, '').trim()
    pushResult(results, seen, {
      title,
      url: decode(block.match(/data-mdurl="([^"]+)"/i)?.[1] || ''),
      snippet,
    })
  }
  return results
}

function parseSo(html) {
  const mobile = parseMobileSo(html)
  return mobile.length ? mobile : parseDesktopSo(html)
}

async function fetchText(url, timeoutMs, userAgent = USER_AGENT) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'follow',
    headers: {
      'User-Agent': userAgent,
      'Accept-Language': 'zh-CN,zh;q=0.9',
      Accept: 'text/html,application/xhtml+xml',
    },
  })
  if (!response.ok) throw new Error(`检索失败 ${response.status}`)
  const type = response.headers.get('content-type') || ''
  if (type && !/text|html|xml|json/i.test(type)) return { text: '', url: response.url }
  return { text: await response.text(), url: response.url }
}

async function readPage(url) {
  try {
    const page = await fetchText(url, 5000)
    const region =
      page.text.match(/id="content_views"[\s\S]{0,3500}/i)?.[0] ||
      page.text.match(/<article[\s\S]{0,3500}/i)?.[0] ||
      ''
    return { extract: region ? decode(region).slice(0, 900) : '', url: page.url || url }
  } catch {
    return { extract: '', url }
  }
}

async function collect(question) {
  const merged = []
  const seen = new Set()
  const attempts = [
    {
      url: `https://www.baidu.com/s?rn=8&wd=${encodeURIComponent(question)}`,
      parse: parseBaidu,
      userAgent: USER_AGENT,
    },
    {
      url: `https://www.so.com/s?q=${encodeURIComponent(question)}`,
      parse: parseSo,
      userAgent: USER_AGENT,
    },
  ]
  for (const attempt of attempts) {
    if (merged.length >= 4) break
    try {
      const page = await fetchText(attempt.url, 8000, attempt.userAgent)
      for (const item of attempt.parse(page.text)) {
        if (!relevant(question, item)) continue
        pushResult(merged, seen, item)
        if (merged.length >= 5) break
      }
    } catch {
      // 这一路搜不到就换下一路。
    }
  }
  return merged
}

function focusedQuery(question) {
  const english = [...new Set(question.match(/[A-Za-z][A-Za-z0-9+#.-]{1,}/g) || [])]
  const terms = ['分发层', '工具选择', '参数校验', '失败回退', '工具调用', '工具集', '路由', '降级', '熔断', '重试', '映射', 'MCP']
  const kept = terms.filter((term) => question.toLowerCase().includes(term.toLowerCase()))
  if (!/skill|tool|工具|分发|路由|校验|回退|mcp/i.test(question)) return question
  return ['智能体', ...english, ...kept].join(' ').replace(/\s+/g, ' ').trim() || question
}

export async function searchPublic(query) {
  const question = String(query || '').replace(/\s+/g, ' ').trim().slice(0, 180)
  if (question.length < 2) return []
  const cached = cache.get(question)
  if (cached && Date.now() - cached.at < cached.ttl) return cached.results
  const merged = await collect(focusedQuery(question))
  const pages = await Promise.all(merged.slice(0, 2).map((item) => readPage(item.url)))
  const results = merged.map((item, index) => ({
    ...item,
    url: pages[index]?.url || item.url,
    extract: pages[index]?.extract || '',
  }))
  cache.set(question, { at: Date.now(), ttl: results.length ? 10 * 60 * 1000 : 45 * 1000, results })
  return results
}
