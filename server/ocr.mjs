import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'ocr.ps1')
const workerScript = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'ocr_worker.py')

function ocrError(code) {
  if (code === 'NO_ENGINE') return '这台电脑没有中文文字识别。请在 Windows 语言设置里安装中文光学字符识别。'
  if (code === 'NO_ASYNC') return '这台电脑暂时读不了截图。'
  if (/parameter is incorrect|file|image|format/i.test(code)) return '这张图片格式读不了，请换成 PNG 或 JPG。'
  return '截图识别失败，请换一张更清晰的图，或直接把题目打出来。'
}

function fail(message, status = 500) {
  const error = new Error(message)
  error.status = status
  return error
}

function isCjk(text) {
  return /[\u3400-\u9fff]/.test(text) || /^[，。：；、（）()【】《》""''：,:.]$/.test(text)
}

function isToken(text) {
  return /^[A-Za-z0-9_]+$/.test(text)
}

export function assembleOcr(raw) {
  const lines = []
  let words = []
  const flush = () => {
    if (!words.length) return
    words.sort((a, b) => a.x - b.x)
    let text = ''
    let prev = null
    for (const word of words) {
      if (!prev) text = word.t
      else {
        const gap = word.x - (prev.x + prev.w)
        const glue = gap >= 0 && gap < 8 && isToken(prev.t) && isToken(word.t)
        const cjk = isCjk(prev.t) && isCjk(word.t)
        text += glue || cjk || gap < 3 ? word.t : ` ${word.t}`
      }
      prev = word
    }
    lines.push(text.replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g, '$1').replace(/([：，。；、])\s+/g, '$1'))
    words = []
  }
  for (const line of String(raw || '').split(/\r?\n/)) {
    if (!line.trim()) {
      flush()
      continue
    }
    const [t, x, w] = line.split('\t')
    if (!t || Number.isNaN(Number(x))) continue
    words.push({ t, x: Number(x), w: Number(w) || 0 })
  }
  flush()
  return lines.join('\n').replace(/[ \t]+\n/g, '\n').trim()
}

export async function readImage(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 8_000_000) throw fail('截图太大，请裁到题目区域再贴。', 413)
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

let child = null
let ready = null
let chain = Promise.resolve()
let pending = null

function startWorker() {
  if (child && ready) return ready
  const python = process.env.MIRROR_PYTHON || 'py'
  const args = python === 'py' ? ['-3.11', workerScript] : [workerScript]
  const proc = spawn(python, args, {
    windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' },
  })
  child = proc
  const lines = createInterface({ input: proc.stdout })
  ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      proc.kill()
      reject(fail('文字识别模型还没准备好。', 503))
    }, 60_000)
    const finish = (error) => {
      clearTimeout(timer)
      child = null
      ready = null
      if (pending) {
        pending.reject(error || fail('文字识别进程已退出。'))
        pending = null
      }
      if (error) reject(error)
    }
    proc.on('error', (error) => finish(fail(error.message, 503)))
    proc.on('exit', (code) => {
      if (code === 0) return
      finish(fail('文字识别模型没有启动。', 503))
    })
    lines.on('line', (line) => {
      const text = line.trim()
      if (!text) return
      if (text === 'READY') {
        clearTimeout(timer)
        resolve()
        return
      }
      if (!pending) return
      const current = pending
      let data
      try {
        data = JSON.parse(text)
      } catch {
        return
      }
      pending = null
      if (data.error) current.reject(fail(data.error))
      else current.resolve(String(data.text || '').trim())
    })
  })
  return ready
}

function askWorker(image) {
  const run = chain.catch(() => undefined).then(async () => {
    await startWorker()
    if (!child?.stdin.writable) throw fail('文字识别进程不可用。', 503)
    const result = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(fail('这张截图识别超时。', 504)), 40_000)
      pending = {
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        },
      }
    })
    child.stdin.write(`${JSON.stringify({ img: image })}\n`)
    return result
  })
  chain = run
  return run
}

function windowsOcr(image, out) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, image, out],
      { timeout: 25000, windowsHide: true },
      (error) => (error ? reject(error) : resolve()),
    )
  }).then(() => {
    const raw = fs.readFileSync(out, 'utf8')
    if (raw.startsWith('ERROR ')) throw fail(ocrError(raw.slice(6).trim()), 422)
    return assembleOcr(raw)
  })
}

export async function ocrImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 32) throw fail('这不是一张可以识别的图片。', 400)
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const image = path.join(os.tmpdir(), `mirror-ocr-${id}.img`)
  const out = path.join(os.tmpdir(), `mirror-ocr-${id}.txt`)
  fs.writeFileSync(image, buffer)
  try {
    try {
      const text = await askWorker(image)
      if (text) return text
    } catch {
      // 文字模型不可用时，退回系统自带识别。
    }
    const text = await windowsOcr(image, out).catch((error) => {
      const raw = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : ''
      if (raw.startsWith('ERROR ')) throw fail(ocrError(raw.slice(6).trim()), 422)
      throw error
    })
    if (!text) throw fail('截图里没有识别出文字。请换一张更清晰的图，或直接把题目打出来。', 422)
    return text
  } finally {
    fs.rmSync(image, { force: true })
    fs.rmSync(`${image}.scaled.png`, { force: true })
    fs.rmSync(out, { force: true })
  }
}
