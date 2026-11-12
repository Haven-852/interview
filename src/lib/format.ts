import type { Profile } from './types'

export function uid() {
  return crypto.randomUUID()
}

export function formatTime(ts: number) {
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

export function formatDuration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  if (minutes <= 0) return `${seconds} 秒`
  return `${minutes} 分 ${seconds} 秒`
}

export function isFiller(text: string) {
  return /^(嗯+|啊+|哦+|呃+|喂+|hi+|hey+|hello+|你好|您好|在吗|听得到吗|可以听到吗|测试|测试麦克风|麦克风测试|谢谢|好的谢谢)[。.!！?？\s]*$/i.test(
    text.trim(),
  )
}

const noiseCue = /明镜与点点|点点栏目|请不吝点赞|谢谢观看|感谢观看|感谢收看|感谢收听|字幕由|amara\.org|订阅.{0,12}转发.{0,12}打赏/i

export function dropNoise(text: string) {
  const pieces = text
    .split(/(?<=[。！？!?])/)
    .map((piece) => piece.trim())
    .filter(Boolean)
  const kept = pieces.filter((piece) => !noiseCue.test(piece.replace(/\s+/g, '')))
  return kept.join('').trim()
}

export function readiness(profile: Profile) {
  return [
    { ok: profile.resume.trim().length >= 40, label: '简历已写到可以引用' },
    { ok: profile.jobDescription.trim().length >= 20, label: '岗位描述已填写' },
    { ok: profile.targetRole.trim().length > 0, label: '目标岗位已填写' },
    { ok: profile.priorityQuestions.some((item) => item.trim()), label: '至少一条优先问题' },
  ]
}

export function questionsOf(profile: Profile) {
  return profile.priorityQuestions.map((item) => item.trim()).filter(Boolean)
}

export function clip(text: string, max = 6000) {
  const value = text.trim()
  if (value.length <= max) return value
  return `${value.slice(0, max)}\n…（已截断）`
}
