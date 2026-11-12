import { useEffect, useRef, useState } from 'react'
import { CoachView, CodingCard } from '../components/ui'
import { readScreenshot } from '../lib/api'
import { useApp } from '../lib/appContext'
import { CODE_LANGUAGES } from '../lib/constants'
import { coachDemo } from '../lib/demo'
import { generateCoach, generateCoding, generateReview } from '../lib/engine'
import { isFiller, uid } from '../lib/format'
import { classifyHeard } from '../lib/live'
import { useLiveListen, useSpeechInput } from '../lib/speech'
import { load, save, upsertSession } from '../lib/storage'
import type { ChatMessage, CoachAction, CoachCard, Session, Settings, Source } from '../lib/types'

function blankSession(): Session {
  const profile = load().profile
  return {
    id: uid(),
    type: 'assistant',
    title: '回答辅导',
    company: profile.targetCompany,
    role: profile.targetRole,
    language: profile.language,
    createdAt: Date.now(),
    messages: [],
  }
}

function coachMessage(card: CoachCard, source: Source, draft = false): ChatMessage {
  return {
    id: uid(),
    role: 'coach',
    content: card.script,
    createdAt: Date.now(),
    card,
    source,
    draft,
  }
}

export function AssistantPage() {
  const { pointer, envConfigured, touch, go } = useApp()
  const [settings, setSettings] = useState<Settings>(() => load().settings)
  const [session, setSession] = useState<Session | null>(() => {
    if (pointer.page !== 'assistant' || !pointer.sessionId) return null
    return load().sessions.find((item) => item.id === pointer.sessionId && item.type === 'assistant') || null
  })
  const [input, setInput] = useState('')
  const [heard, setHeard] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [codeLanguage, setCodeLanguage] = useState<(typeof CODE_LANGUAGES)[number]>('TypeScript')
  const profile = load().profile
  const speech = useSpeechInput(profile.language)
  const live = useLiveListen(profile.language)
  const sessionRef = useRef(session)
  const settingsRef = useRef(settings)
  const pendingRef = useRef(false)
  const heardRef = useRef('')
  const timerRef = useRef<number | null>(null)
  const queuedRef = useRef<{ kind: 'question' | 'coding'; text: string } | null>(null)
  const codeLanguageRef = useRef(codeLanguage)
  sessionRef.current = session
  settingsRef.current = settings
  codeLanguageRef.current = codeLanguage
  const modelOn = Boolean(settings.apiKey.trim() || envConfigured)
  const ordered = settings.newestFirst ? [...(session?.messages || [])].reverse() : session?.messages || []
  const lastQuestion = [...(session?.messages || [])].reverse().find((item) => item.role === 'interviewer')?.content || ''

  const stopLiveRef = useRef<() => void>(() => {})
  stopLiveRef.current = live.stop
  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    stopLiveRef.current()
  }, [])

  function patchSettings(partial: Partial<Settings>) {
    const db = load()
    db.settings = { ...db.settings, ...partial }
    save(db)
    setSettings(db.settings)
    touch()
  }

  function persist(next: Session) {
    sessionRef.current = next
    setSession(next)
    upsertSession(next)
    touch()
  }

  function finishPending() {
    pendingRef.current = false
    setPending(false)
    const queued = queuedRef.current
    queuedRef.current = null
    if (!queued) return
    if (queued.kind === 'coding') void answerCoding(queued.text)
    else void answerQuestion(queued.text)
  }

  async function answerQuestion(question: string, action: CoachAction = 'answer', addQuestion = true, live = false) {
    const text = question.trim()
    if (!text) return
    if (pendingRef.current) {
      queuedRef.current = { kind: 'question', text }
      return
    }
    const currentSettings = settingsRef.current
    if (addQuestion && action === 'answer' && currentSettings.autoSkip && isFiller(text)) {
      const base = sessionRef.current ?? blankSession()
      persist({
        ...base,
        messages: [...base.messages, { id: uid(), role: 'system', content: `已跳过寒暄：${text}`, createdAt: Date.now() }],
      })
      return
    }
    pendingRef.current = true
    setPending(true)
    setError('')
    let next = sessionRef.current ?? blankSession()
    if (addQuestion) {
      next = {
        ...next,
        title: next.messages.some((item) => item.role === 'interviewer') ? next.title : text.slice(0, 32),
        messages: [...next.messages, { id: uid(), role: 'interviewer', content: text, createdAt: Date.now() }],
      }
    }
    const previousScript = [...next.messages].reverse().find((item) => item.role === 'coach' && item.card)?.content
    const ready = Boolean(currentSettings.apiKey.trim() || envConfigured)
    if (ready && (live || currentSettings.responseTiming === 'fast')) {
      next = {
        ...next,
        messages: [...next.messages, coachMessage(coachDemo({
          profile,
          question: text,
          action,
          length: currentSettings.responseLength,
          previousScript,
        }), 'demo', true)],
      }
    }
    persist(next)
    try {
      const result = await generateCoach({
        profile,
        settings: currentSettings,
        envConfigured,
        question: text,
        action,
        previousScript,
        forceModel: ready,
        live,
      })
      const cleaned = next.messages.filter((item) => !item.draft)
      persist({ ...next, messages: [...cleaned, coachMessage(result.card, result.source)] })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '生成失败')
    } finally {
      finishPending()
    }
  }

  async function answerCoding(problem: string, live = false) {
    const text = problem.trim()
    if (!text) return
    if (pendingRef.current) {
      queuedRef.current = { kind: 'coding', text }
      return
    }
    pendingRef.current = true
    setPending(true)
    setError('')
    let next = sessionRef.current ?? blankSession()
    next = {
      ...next,
      title: next.messages.some((item) => item.role === 'interviewer') ? next.title : text.slice(0, 32),
      messages: [...next.messages, { id: uid(), role: 'interviewer', content: text, createdAt: Date.now() }],
    }
    persist(next)
    try {
      const coding = await generateCoding({
        settings: settingsRef.current,
        envConfigured,
        problem: text,
        language: codeLanguageRef.current,
        notes: '这是面试中听到或粘贴的编程题，先复述题目，再讲思路和代码。',
        live,
      })
      persist({
        ...next,
        messages: [...next.messages, {
          id: uid(),
          role: 'coach',
          content: coding.narration,
          createdAt: Date.now(),
          coding,
          source: coding.source,
        }],
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '题目讲解失败')
    } finally {
      finishPending()
    }
  }

  function submitText(text: string) {
    const value = text.trim()
    if (!value) return
    setInput('')
    const intent = classifyHeard(value)
    if (intent === 'coding') void answerCoding(value)
    else void answerQuestion(value)
  }

  function acceptFinal(chunk: string) {
    const incoming = chunk.trim()
    if (!incoming) return
    const text = `${heardRef.current} ${incoming}`.trim()
    const intent = classifyHeard(text)
    if (intent === 'partial') {
      heardRef.current = text
      setHeard(text)
      return
    }
    heardRef.current = ''
    setHeard('')
    if (intent === 'skip') return
    if (intent === 'coding') void answerCoding(text, true)
    else void answerQuestion(text, 'answer', true, true)
  }

  function answerHeardNow() {
    const text = `${heardRef.current} ${live.consume()}`.trim()
    if (!text) return
    if (timerRef.current) window.clearTimeout(timerRef.current)
    heardRef.current = ''
    setHeard('')
    const intent = classifyHeard(text)
    if (intent === 'partial') {
      heardRef.current = text
      setHeard(text)
      return
    }
    if (intent === 'skip') return
    if (intent === 'coding') void answerCoding(text, true)
    else void answerQuestion(text, 'answer', true, true)
  }

  async function pasteShot(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const images = [...event.clipboardData.files].filter((file) => file.type.startsWith('image/')).slice(0, 3)
    if (!images.length) return
    event.preventDefault()
    if (pendingRef.current) {
      setError('请等当前这题讲完，再贴下一张截图。')
      return
    }
    if (images.some((file) => file.size > 8_000_000)) {
      setError('截图太大，请裁到题目区域再贴。')
      return
    }
    pendingRef.current = true
    setPending(true)
    setError('')
    try {
      const text = (await Promise.all(images.map((file) => readScreenshot(file)))).filter(Boolean).join('\n').trim()
      if (!text) throw new Error('截图里没有识别出文字。')
      pendingRef.current = false
      setPending(false)
      const coding = classifyHeard(text) === 'coding' || /示例|输入[:：]|输出[:：]|给定|函数|数组|leetcode|class\s/i.test(text)
      if (coding) void answerCoding(text, true)
      else void answerQuestion(text)
    } catch (reason) {
      pendingRef.current = false
      setPending(false)
      setError(reason instanceof Error ? reason.message : '截图识别失败')
    }
  }

  async function finish() {
    if (!sessionRef.current || pendingRef.current) return
    pendingRef.current = true
    setPending(true)
    setError('')
    live.stop()
    try {
      const analysis = await generateReview({
        profile,
        settings: settingsRef.current,
        envConfigured,
        session: sessionRef.current,
      })
      persist({ ...sessionRef.current, endedAt: Date.now(), analysis })
      go('history', sessionRef.current.id)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '复盘失败')
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }

  const hearing = `${heard} ${live.interim}`.trim()

  return (
    <div className="page">
      <p className="kicker">回答辅导</p>
      <div className="spread wrap">
        <h1>面试官说完，回答就出现。</h1>
        <button className="btn" type="button" disabled={!session || pending} onClick={() => void finish()}>结束并复盘</button>
      </div>
      <p className="lede">
        实时监听会一直听周围的声音。说完后一旦停顿，马上把这一句发给模型，并尽快把回答显示出来。浏览器的在线识别连不上时，会改用本地语音模型，它能听清普通话和夹杂的英文术语。
        {modelOn ? ' 有密钥时先显示一版草稿，模型返回后立刻替换。' : ' 当前是演示引擎，停顿后会马上给出回答。'}
      </p>
      <div className="toolbar">
        <button
          className={live.listening ? 'btn btn-primary' : 'btn'}
          type="button"
          disabled={!live.supported}
          title={live.supported ? '打开麦克风并持续听你说的话' : '当前浏览器不能使用麦克风，请换 Chrome 或 Edge'}
          onClick={() => (live.listening ? live.stop() : live.start(acceptFinal))}
        >
          {live.listening ? '停止监听' : '实时监听'}
        </button>
        {live.devices.length > 0 ? (
          <select value={live.deviceId} onChange={(event) => live.chooseDevice(event.target.value)}>
            {live.devices.map((item) => (
              <option key={item.deviceId} value={item.deviceId}>{item.label || '麦克风'}</option>
            ))}
          </select>
        ) : null}
        <select value={settings.responseLength} onChange={(event) => patchSettings({ responseLength: event.target.value as Settings['responseLength'] })}>
          <option value="short">大约 30 秒</option>
          <option value="medium">大约 1 分钟</option>
          <option value="long">大约 2 分钟</option>
        </select>
        <select value={settings.responseTiming} onChange={(event) => patchSettings({ responseTiming: event.target.value as Settings['responseTiming'] })}>
          <option value="fast">快，先出草稿</option>
          <option value="balanced">均衡</option>
          <option value="deep">更深的考察点</option>
        </select>
        <select value={codeLanguage} onChange={(event) => setCodeLanguage(event.target.value as (typeof CODE_LANGUAGES)[number])}>
          {CODE_LANGUAGES.map((item) => <option key={item}>{item}</option>)}
        </select>
        <button className={settings.autoSkip ? 'chip on' : 'chip'} type="button" onClick={() => patchSettings({ autoSkip: !settings.autoSkip })}>跳过寒暄</button>
        <button className={settings.newestFirst ? 'chip on' : 'chip'} type="button" onClick={() => patchSettings({ newestFirst: !settings.newestFirst })}>新消息在前</button>
      </div>
      {live.error ? <div className="banner banner-bad">{live.error}</div> : null}
      {live.note ? <div className="banner">{live.note}</div> : null}
      {speech.error ? <div className="banner banner-bad">{speech.error}</div> : null}
      {live.listening || hearing ? (
        <div className={live.listening ? 'banner banner-ok hearing' : 'banner'}>
          <div className="spread wrap">
            <strong>{live.level > 0.004 ? '已听到声音' : live.listening ? '正在听，请对着麦克风说话' : '刚听到'}</strong>
            <button className="btn" type="button" disabled={!hearing || pending} onClick={answerHeardNow}>就按这句回答</button>
          </div>
          <div className="meter" data-level={live.level.toFixed(4)}>
            <span style={{ width: `${Math.min(100, Math.round(live.level * 3500))}%` }} />
          </div>
          <p>{hearing || '停顿大约半秒后，这句话会自动发给模型。若音量条不动，请在上方换一个麦克风。'}</p>
        </div>
      ) : null}
      {error ? <div className="banner banner-bad">{error}</div> : null}
      <div className={`transcript font-${settings.fontScale}`}>
        {ordered.length === 0 ? <div className="bubble bubble-sys">例如：讲一次你把延迟降下来的经历。或：给定一个整数数组，返回和为目标值的两个下标。</div> : null}
        {ordered.map((message) => {
          if (message.coding) return <CodingCard key={message.id} result={message.coding} />
          if (message.role === 'system') return <div className="bubble bubble-sys" key={message.id}>{message.content}</div>
          if (message.role === 'interviewer') return <div className="bubble bubble-q" key={message.id}><span className="tiny">听到的问题</span><p>{message.content}</p></div>
          if (message.card) return <CoachView key={message.id} card={message.card} draft={message.draft} source={message.source} />
          return <div className="bubble" key={message.id}><p>{message.content}</p></div>
        })}
      </div>
      <div className="composer">
        <button
          className={speech.listening ? 'mic on' : 'mic'}
          type="button"
          disabled={!speech.supported || live.listening}
          title={live.listening ? '实时监听已经占用麦克风' : '把一句话写进输入框'}
          onClick={() => (speech.listening ? speech.stop() : speech.start(input, setInput))}
        >
          {speech.listening ? '停止' : '语音'}
        </button>
        <textarea
          value={input}
          placeholder="粘贴问题、编程题，或直接把题目截图贴进来。"
          onPaste={(event) => void pasteShot(event)}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault()
              submitText(input)
            }
          }}
        />
        <button className="btn btn-primary" type="button" disabled={pending || !input.trim()} onClick={() => submitText(input)}>
          {pending ? '查找资料并整理…' : '生成回答'}
        </button>
      </div>
      <div className="row wrap">
        <button className="btn" type="button" disabled={pending || !(input.trim() || lastQuestion)} onClick={() => { const typed = input.trim(); setInput(''); void answerQuestion(typed || lastQuestion, 'followup', Boolean(typed)) }}>准备追问</button>
        <button className="btn" type="button" disabled={pending || !(input.trim() || lastQuestion)} onClick={() => { const typed = input.trim(); setInput(''); void answerQuestion(typed || lastQuestion, 'shorter', Boolean(typed)) }}>压到半分钟</button>
        <button className="btn" type="button" disabled={pending || !(input.trim() || lastQuestion)} onClick={() => { const typed = input.trim(); setInput(''); void answerQuestion(typed || lastQuestion, 'translate', Boolean(typed)) }}>英文框架</button>
      </div>
    </div>
  )
}
