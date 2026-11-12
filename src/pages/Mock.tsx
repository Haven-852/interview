import { useEffect, useRef, useState } from 'react'
import { AnalysisView, CopyButton } from '../components/ui'
import { useApp } from '../lib/appContext'
import { DIFFICULTIES, PERSONAS, SCENARIOS, difficultyName, personaName, scenarioName } from '../lib/constants'
import { generateReady, generateReview, generateTurn } from '../lib/engine'
import { uid } from '../lib/format'
import { speak, stopSpeaking, useAnswerMic } from '../lib/speech'
import { load, upsertSession } from '../lib/storage'
import type { ChatMessage, ReadyBrief, Session } from '../lib/types'

function findMock(id?: string) {
  if (!id) return null
  return load().sessions.find((item) => item.id === id && item.type === 'mock') || null
}

export function MockPage() {
  const { pointer, envConfigured, touch, go } = useApp()
  const existing = findMock(pointer.page === 'mock' ? pointer.sessionId : undefined)
  const [scenario, setScenario] = useState(existing?.scenario || 'behavior')
  const [persona, setPersona] = useState(existing?.persona || 'lead')
  const [difficulty, setDifficulty] = useState(existing?.difficulty || 'mid')
  const [useReady, setUseReady] = useState(true)
  const [interviewKind, setInterviewKind] = useState<'业务面' | 'HR面'>(existing?.ready?.interviewType || (existing?.scenario === 'hr' || existing?.scenario === 'phone' ? 'HR面' : '业务面'))
  const [readyPlan, setReadyPlan] = useState<ReadyBrief | null>(existing?.ready || null)
  const [session, setSession] = useState<Session | null>(existing)
  const [phase, setPhase] = useState<'setup' | 'brief' | 'live' | 'review'>(existing?.analysis || existing?.endedAt ? 'review' : existing ? 'live' : 'setup')
  const [input, setInput] = useState('')
  const [showHint, setShowHint] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const profile = load().profile
  const mic = useAnswerMic(profile.language)
  const heard = useRef<string>('')
  const answerRef = useRef<(text?: string) => void>(() => {})
  const lastQuestion = [...(session?.messages || [])].reverse().find((item) => item.role === 'interviewer')

  useEffect(() => () => stopSpeaking(), [])

  useEffect(() => {
    if (phase !== 'live' || !lastQuestion || !load().settings.speakQuestions) return
    if (heard.current === lastQuestion.id) return
    heard.current = lastQuestion.id
    speak(lastQuestion.content, profile.language)
  }, [lastQuestion, phase, profile.language])

  function persist(next: Session) {
    setSession(next)
    upsertSession(next)
    touch()
  }

  function transcriptOf(current: Session) {
    return current.messages
      .filter((item): item is ChatMessage & { role: 'interviewer' | 'candidate' } => item.role === 'interviewer' || item.role === 'candidate')
      .map((item) => ({ role: item.role, content: item.content }))
  }

  async function begin(brief?: ReadyBrief) {
    setPending(true)
    setError('')
    try {
      const result = await generateTurn({
        profile,
        settings: load().settings,
        envConfigured,
        scenario,
        persona,
        difficulty,
        transcript: [],
        ready: brief,
      })
      const next: Session = {
        id: uid(),
        type: 'mock',
        title: `${scenarioName(scenario)} · ${profile.targetCompany || '未填写公司'}`,
        company: profile.targetCompany,
        role: profile.targetRole,
        scenario,
        persona,
        difficulty,
        language: profile.language,
        createdAt: Date.now(),
        ready: brief,
        messages: [{
          id: uid(),
          role: 'interviewer',
          content: result.turn.question,
          reaction: result.turn.reaction,
          hint: result.turn.hint,
          source: result.source,
          createdAt: Date.now(),
        }],
      }
      persist(next)
      setReadyPlan(brief || null)
      setPhase('live')
      setShowHint(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '没能开始面试')
    } finally {
      setPending(false)
    }
  }

  async function prepare() {
    if (!useReady) {
      await begin()
      return
    }
    const missing = [
      profile.targetCompany.trim() ? '' : '目标公司',
      profile.jobDescription.trim().length >= 20 ? '' : '岗位描述',
      profile.resume.trim().length >= 40 ? '' : '简历',
    ].filter(Boolean)
    if (missing.length) {
      setError(`使用面试准备前，请先在材料里补上：${missing.join('、')}`)
      return
    }
    setPending(true)
    setError('')
    try {
      const brief = await generateReady({
        profile,
        settings: load().settings,
        envConfigured,
        interviewType: interviewKind,
      })
      setReadyPlan(brief)
      setPhase('brief')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '面试准备没有生成')
    } finally {
      setPending(false)
    }
  }

  async function answer(spoken?: string) {
    const text = (spoken ?? input).trim()
    if (!session || !text || pending) return
    if (mic.listening) mic.cancel()
    setPending(true)
    setError('')
    const withAnswer: Session = {
      ...session,
      messages: [...session.messages, { id: uid(), role: 'candidate', content: text, createdAt: Date.now() }],
    }
    setInput(text)
    persist(withAnswer)
    try {
      const result = await generateTurn({
        profile,
        settings: load().settings,
        envConfigured,
        scenario: session.scenario || scenario,
        persona: session.persona || persona,
        difficulty: session.difficulty || difficulty,
        transcript: transcriptOf(withAnswer),
        ready: session.ready,
      })
      persist({
        ...withAnswer,
        messages: [...withAnswer.messages, {
          id: uid(),
          role: 'interviewer',
          content: result.turn.question,
          reaction: result.turn.reaction,
          hint: result.turn.hint,
          source: result.source,
          standard: result.turn.standard,
          createdAt: Date.now(),
        }],
      })
      setShowHint(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '下一问生成失败')
    } finally {
      setInput('')
      setPending(false)
    }
  }

  answerRef.current = (text?: string) => {
    void answer(text)
  }

  function toggleMic() {
    if (pending || mic.transcribing) return
    if (mic.listening) {
      void mic.finish()
      return
    }
    stopSpeaking()
    setError('')
    mic.start((text) => {
      setInput(text)
      answerRef.current(text)
    })
  }

  async function finish() {
    if (!session || pending) return
    setPending(true)
    setError('')
    stopSpeaking()
    mic.cancel()
    try {
      const analysis = await generateReview({ profile, settings: load().settings, envConfigured, session })
      persist({ ...session, endedAt: Date.now(), analysis })
      setPhase('review')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '复盘失败')
    } finally {
      setPending(false)
    }
  }

  if (phase === 'setup') {
    return (
      <div className="page">
        <p className="kicker">模拟面试</p>
        <h1>让面试官先问，你再开口。</h1>
        <p className="lede">选择场景、角色和难度。打开面试准备后，会先检索同公司同岗位的公开面经，再按简历和岗位描述排出这场的题。优先问题仍来自材料页。</p>
        {error ? <div className="banner banner-bad">{error}</div> : null}
        <section className="stack">
          <h2>场景</h2>
          <div className="chips">
            {SCENARIOS.map((item) => (
              <button className={scenario === item.id ? 'chip on' : 'chip'} type="button" key={item.id} onClick={() => {
                setScenario(item.id)
                setInterviewKind(item.id === 'hr' || item.id === 'phone' ? 'HR面' : '业务面')
              }}>
                <strong>{item.name}</strong>
                <span>{item.desc}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="stack">
          <h2>面试官</h2>
          <div className="chips">
            {PERSONAS.map((item) => (
              <button className={persona === item.id ? 'chip on' : 'chip'} type="button" key={item.id} onClick={() => setPersona(item.id)}>
                <strong>{item.name}</strong>
                <span>{item.desc}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="stack">
          <h2>难度</h2>
          <div className="chips">
            {DIFFICULTIES.map((item) => (
              <button className={difficulty === item.id ? 'chip on' : 'chip'} type="button" key={item.id} onClick={() => setDifficulty(item.id)}>
                <strong>{item.name}</strong>
                <span>{item.desc}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="card">
          <div className="spread wrap">
            <h2>插件 · interview-ready</h2>
            <button className={useReady ? 'chip on' : 'chip'} type="button" onClick={() => setUseReady((value) => !value)}>
              <strong>{useReady ? '本场使用' : '本场不用'}</strong>
            </button>
          </div>
          <p>先查这家公司和这个岗位的公开面经，再按简历、岗位描述排出自我介绍、业务题、简历深挖、行为题和 Gap。模拟时一次只问一题，不把参考答案提前念出来。做法参考 <a href="https://github.com/XiaqiuOO/interview-ready-skill" target="_blank" rel="noreferrer">interview-ready-skill</a>，这里只生成当场能问完的短题单。</p>
          {useReady ? (
            <div className="chips">
              {(['业务面', 'HR面'] as const).map((item) => (
                <button className={interviewKind === item ? 'chip on' : 'chip'} type="button" key={item} onClick={() => setInterviewKind(item)}>
                  <strong>{item}</strong>
                  <span>{item === '业务面' ? '专业深度和项目细节' : '动机、稳定性和协作'}</span>
                </button>
              ))}
            </div>
          ) : null}
        </section>
        <section className="card">
          <h2>会用到的材料</h2>
          <p>{profile.targetCompany || '未填写公司'} · {profile.targetRole || '未填写岗位'}</p>
          <p className="tiny">{profile.priorityQuestions.filter((item) => item.trim()).join(' / ') || '还没有优先问题'}</p>
          <button className="btn btn-ghost" type="button" onClick={() => go('materials')}>修改材料</button>
        </section>
        <button className="btn btn-primary" type="button" disabled={pending} onClick={() => void prepare()}>{pending ? '正在准备这场…' : useReady ? '先生成准备再开始' : '开始模拟'}</button>
      </div>
    )
  }

  if (phase === 'brief' && readyPlan) {
    return (
      <div className="page">
        <p className="kicker">{readyPlan.interviewType} · {readyPlan.source === 'model' ? '按材料生成' : '演示题单'}</p>
        <div className="spread wrap">
          <h1>先看这场准备，再开始问答</h1>
          <button className="btn" type="button" onClick={() => setPhase('setup')}>返回调整</button>
        </div>
        <p className="lede">{readyPlan.searchNote}</p>
        {readyPlan.companyLines.length ? (
          <section className="card">
            <h2>公司理解</h2>
            {readyPlan.companyLines.map((line) => <p key={line}>{line}</p>)}
          </section>
        ) : null}
        <section className="card">
          <div className="spread wrap">
            <h2>一分钟自我介绍</h2>
            <CopyButton text={readyPlan.intro} />
          </div>
          <p>{readyPlan.intro}</p>
        </section>
        <section className="card">
          <h2>题单</h2>
          {readyPlan.questions.map((item, index) => (
            <div key={`${index}-${item.question}`}>
              <p><strong>{index + 1}. {item.chapter}</strong> · {item.priority}</p>
              <p>{item.question}</p>
              <p className="tiny">考察：{item.intent}</p>
            </div>
          ))}
        </section>
        {readyPlan.gaps.length ? (
          <section className="card">
            <h2>材料里还没覆盖的点</h2>
            {readyPlan.gaps.map((item) => <p key={item}>{item}</p>)}
          </section>
        ) : null}
        <section className="card">
          <h2>轮到你问的时候</h2>
          {readyPlan.reverseQuestions.map((item) => <p key={item}>{item}</p>)}
          {readyPlan.sources.length ? (
            <p className="tiny">
              公开页面：
              {readyPlan.sources.map((item, index) => (
                <span key={item.url}>
                  {index ? ' · ' : ' '}
                  <a href={item.url} target="_blank" rel="noreferrer">{item.title || item.url}</a>
                </span>
              ))}
            </p>
          ) : null}
        </section>
        {error ? <div className="banner banner-bad">{error}</div> : null}
        <button className="btn btn-primary" type="button" disabled={pending} onClick={() => void begin(readyPlan)}>{pending ? '正在开场…' : '按这张题单开始'}</button>
      </div>
    )
  }

  if (!session) return null

  return (
    <div className="page">
      <p className="kicker">{scenarioName(session.scenario)} · {personaName(session.persona)} · {difficultyName(session.difficulty)}</p>
      <div className="spread wrap">
        <h1>{phase === 'review' ? '这场可以这样复盘' : '一次只回答眼前这一问'}</h1>
        {phase === 'live' ? <button className="btn" type="button" disabled={pending} onClick={() => void finish()}>{pending ? '复盘中…' : '结束并复盘'}</button> : <button className="btn" type="button" onClick={() => go('history', session.id)}>在历史里查看</button>}
      </div>
      {error ? <div className="banner banner-bad">{error}</div> : null}
      {phase === 'review' && session.analysis ? <AnalysisView analysis={session.analysis} /> : null}
      <div className="split">
        <div className="transcript">
          {session.messages.map((message) => (
            message.role === 'candidate' ? (
              <div className="bubble" key={message.id}><span className="tiny">你的回答</span><p>{message.content}</p></div>
            ) : (
              <div className="bubble bubble-q" key={message.id} aria-live="polite">
                {message.reaction ? <p className="reaction">{message.reaction}</p> : null}
                {message.standard ? (
                  <div className="standard">
                    <span className="tiny">参考答法</span>
                    <p>{message.standard}</p>
                  </div>
                ) : null}
                <p>{message.content}</p>
              </div>
            )
          ))}
        </div>
        <aside className="card">
          {phase === 'live' ? (
            <>
              <h2>当前问题</h2>
              {session.ready ? <p className="tiny">按 {session.ready.interviewType} 题单推进。答偏了会在下一问前面给出参考答法。</p> : null}
              <p>{lastQuestion?.content}</p>
              <button className="btn btn-ghost" type="button" onClick={() => setShowHint((value) => !value)}>{showHint ? '收起提示' : '看提示'}</button>
              {showHint && lastQuestion?.hint ? <p className="muted">{lastQuestion.hint}</p> : null}
              {mic.error ? <div className="banner banner-bad">{mic.error}</div> : null}
              {mic.note ? <div className={mic.listening ? 'banner banner-ok' : 'banner'}>{mic.note}</div> : null}
              {mic.listening ? (
                <div className="meter" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, Math.round(mic.level * 3500))}%` }} />
                </div>
              ) : null}
              <div className="composer">
                <button className={mic.listening ? 'mic on' : 'mic'} type="button" disabled={!mic.supported || pending || mic.transcribing} onClick={toggleMic}>
                  {mic.transcribing ? '转写' : mic.listening ? '说完' : '语音'}
                </button>
                <textarea
                  value={input}
                  placeholder="点语音说出回答，文字会出现在这里"
                  disabled={pending || mic.transcribing}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                      event.preventDefault()
                      void answer()
                    }
                  }}
                />
                <button className="btn btn-primary" type="button" disabled={pending || mic.transcribing || !input.trim()} onClick={() => void answer()}>{pending ? '发送中…' : '发送回答'}</button>
              </div>
              <p className="tiny">{mic.supported ? '点「语音」直接说。说完再点一次，或停顿一会儿，文字会放进对话并交给模型。答偏了会在下一问上方给出参考答法。' : '这个浏览器不能打开麦克风。'}</p>
            </>
          ) : (
            <>
              <h2>再练一场</h2>
              <p>保留刚才的记录，回到设置重新开始。</p>
              <button className="btn btn-primary" type="button" onClick={() => { setSession(null); setPhase('setup'); setError('') }}>回到设置</button>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
