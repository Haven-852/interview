import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'models')
const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'whisper_worker.py')
const noiseCue = /明镜与点点|点点栏目|请不吝点赞|谢谢观看|感谢观看|感谢收看|感谢收听|字幕由|amara\.org|订阅.{0,12}转发.{0,12}打赏/i

function dropNoise(text) {
  const pieces = String(text || '')
    .split(/(?<=[。！？!?])/)
    .map((piece) => piece.trim())
    .filter(Boolean)
  return pieces.filter((piece) => !noiseCue.test(piece.replace(/\s+/g, ''))).join('').trim()
}

let child = null
let ready = null
let chain = Promise.resolve()
let pending = null

export async function readAudio(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 2_000_000) {
      const error = new Error('录音太长，请说短一些再停顿。')
      error.status = 413
      throw error
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

function fail(message, status = 500) {
  const error = new Error(message)
  error.status = status
  return error
}

function startWorker() {
  if (child && ready) return ready
  fs.mkdirSync(root, { recursive: true })
  const python = process.env.MIRROR_PYTHON || 'py'
  const args = python === 'py' ? ['-3.11', script, root] : [script, root]
  const proc = spawn(python, args, {
    windowsHide: true,
    env: {
      ...process.env,
      HF_ENDPOINT: process.env.HF_ENDPOINT || 'https://hf-mirror.com',
      HF_HUB_DISABLE_PROGRESS_BARS: '1',
      PYTHONIOENCODING: 'utf-8',
      PYTHONUNBUFFERED: '1',
    },
  })
  child = proc
  const lines = createInterface({ input: proc.stdout })
  let stderr = ''
  proc.stderr.on('data', (chunk) => {
    stderr = `${stderr}${chunk.toString('utf8')}`.slice(-2000)
  })
  ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      proc.kill()
      reject(fail('语音模型还没准备好。第一次下载可能需要几分钟，请稍后再说一句。', 503))
    }, 12 * 60 * 1000)
    const finish = (error) => {
      clearTimeout(timer)
      child = null
      ready = null
      if (pending) {
        pending.reject(error || fail('语音模型进程已退出。'))
        pending = null
      }
      if (error) reject(error)
    }
    proc.on('error', (error) => finish(fail(`没有找到 Python 3.11，无法启动语音模型。${error.message}`, 503)))
    proc.on('exit', (code) => {
      if (code === 0) return
      finish(fail(stderr.trim() || '语音模型没有启动成功。', 503))
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
      pending = null
      try {
        const data = JSON.parse(text)
        if (data.error) current.reject(fail(data.error))
        else current.resolve(String(data.text || '').trim())
      } catch {
        current.reject(fail('语音模型返回了无法读取的结果。'))
      }
    })
  })
  return ready
}

function ask(wav) {
  const run = chain.catch(() => undefined).then(async () => {
    await startWorker()
    if (!child?.stdin.writable) throw fail('语音模型进程不可用。', 503)
    const result = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (pending) pending = null
        reject(fail('这句话识别超时，请再说一次。', 504))
      }, 90_000)
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
    child.stdin.write(`${JSON.stringify({ wav })}\n`)
    return result
  })
  chain = run
  return run
}

export async function transcribeWav(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF') {
    throw fail('录音格式不正确', 400)
  }
  const wav = path.join(os.tmpdir(), `mirror-hear-${Date.now()}-${Math.random().toString(16).slice(2)}.wav`)
  fs.writeFileSync(wav, buffer)
  try {
    const text = dropNoise(await ask(wav))
    return text
  } finally {
    fs.rmSync(wav, { force: true })
  }
}
