import { useMemo, useState } from 'react'
import { AnalysisView, CoachView, CodingCard } from '../components/ui'
import { useApp } from '../lib/appContext'
import { TYPE_LABEL, difficultyName, personaName, scenarioName } from '../lib/constants'
import { generateReview } from '../lib/engine'
import { formatDuration, formatTime } from '../lib/format'
import { deleteSession, load, upsertSession } from '../lib/storage'
import type { Session, SessionType } from '../lib/types'

export function HistoryPage() {
  const { pointer, go, envConfigured, touch } = useApp()
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<'all' | SessionType>('all')
  const [tab, setTab] = useState<'overview' | 'transcript' | 'analysis'>('overview')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const sessions = useMemo(() => load().sessions, [version, pointer.sessionId])
  const visible = sessions.filter((session) => {
    if (kind !== 'all' && session.type !== kind) return false
    const haystack = `${session.title} ${session.company} ${session.role} ${session.messages.map((item) => item.content).join(' ')}`.toLowerCase()
    return haystack.includes(query.trim().toLowerCase())
  })
  const selected = sessions.find((session) => session.id === pointer.sessionId) || visible[0] || null

  function choose(session: Session) {
    go('history', session.id)
    setTab('overview')
  }

  async function rebuild(session: Session) {
    setPending(true)
    setError('')
    try {
      const analysis = await generateReview({
        profile: load().profile,
        settings: load().settings,
        envConfigured,
        session,
      })
      upsertSession({ ...session, analysis, endedAt: session.endedAt || Date.now() })
      touch()
      setVersion((value) => value + 1)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '复盘失败')
    } finally {
      setPending(false)
    }
  }

  function remove(session: Session) {
    if (!window.confirm('删除这场记录？')) return
    deleteSession(session.id)
    touch()
    setVersion((value) => value + 1)
    go('history')
  }

  function download(session: Session) {
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${session.title || 'session'}.json`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  return (
    <div className="page">
      <p className="kicker">历史</p>
      <h1>一场练习要留下来，才知道下次练什么。</h1>
      <div className="row wrap">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索公司、岗位或原话" />
        {(['all', 'mock', 'assistant', 'coding'] as const).map((item) => (
          <button key={item} className={kind === item ? 'chip on' : 'chip'} type="button" onClick={() => setKind(item)}>
            <strong>{item === 'all' ? '全部' : TYPE_LABEL[item]}</strong>
          </button>
        ))}
      </div>
      {error ? <div className="banner banner-bad">{error}</div> : null}
      <div className="split">
        <div className="session-list">
          {visible.length === 0 ? <div className="card"><p>没有匹配的记录。</p></div> : null}
          {visible.map((session) => (
            <button className={selected?.id === session.id ? 'card session-item on' : 'card session-item'} type="button" key={session.id} onClick={() => choose(session)}>
              <strong>{session.title}</strong>
              <p className="tiny">{TYPE_LABEL[session.type]} · {formatTime(session.createdAt)} · {session.endedAt ? '已结束' : '进行中'}{session.analysis ? ` · ${session.analysis.overall} 分` : ''}</p>
            </button>
          ))}
        </div>
        {selected ? (
          <section className="stack">
            <div className="tabs">
              {([['overview', '概览'], ['transcript', '对话'], ['analysis', '复盘']] as const).map(([id, label]) => (
                <button key={id} className={tab === id ? 'tab on' : 'tab'} type="button" onClick={() => setTab(id)}>{label}</button>
              ))}
            </div>
            {tab === 'overview' ? (
              <div className="card">
                <h2>{selected.title}</h2>
                <p>{selected.company || '未填写公司'} · {selected.role || '未填写岗位'}</p>
                <p className="tiny">
                  {formatTime(selected.createdAt)}
                  {selected.endedAt ? ` · ${formatDuration(selected.endedAt - selected.createdAt)}` : ' · 进行中'}
                  {selected.scenario ? ` · ${scenarioName(selected.scenario)} · ${personaName(selected.persona)} · ${difficultyName(selected.difficulty)}` : ''}
                </p>
                <div className="row wrap">
                  {!selected.endedAt && selected.type !== 'coding' ? <button className="btn btn-primary" type="button" onClick={() => go(selected.type, selected.id)}>继续练习</button> : null}
                  {selected.type !== 'coding' ? <button className="btn" type="button" disabled={pending} onClick={() => void rebuild(selected)}>{pending ? '生成中…' : selected.analysis ? '重新复盘' : '生成复盘'}</button> : null}
                  <button className="btn" type="button" onClick={() => download(selected)}>导出 JSON</button>
                  <button className="btn btn-danger" type="button" onClick={() => remove(selected)}>删除</button>
                </div>
              </div>
            ) : null}
            {tab === 'transcript' ? (
              <div className="transcript">
                {selected.coding ? (
                  <div className="card">
                    <h2>{selected.coding.pattern}</h2>
                    <p>{selected.coding.narration}</p>
                    {selected.coding.code ? <pre className="codebox"><code>{selected.coding.code}</code></pre> : null}
                  </div>
                ) : null}
                {selected.messages.map((message) => (
                  message.coding ? <CodingCard key={message.id} result={message.coding} /> : message.card ? <CoachView key={message.id} card={message.card} draft={message.draft} source={message.source} /> : (
                    <div className={message.role === 'interviewer' ? 'bubble bubble-q' : message.role === 'system' ? 'bubble bubble-sys' : 'bubble'} key={message.id}>
                      <span className="tiny">{message.role === 'interviewer' ? '问题' : message.role === 'candidate' ? '回答' : '记录'}</span>
                      {message.reaction ? <p className="reaction">{message.reaction}</p> : null}
                      <p>{message.content}</p>
                    </div>
                  )
                ))}
              </div>
            ) : null}
            {tab === 'analysis' ? (
              selected.analysis ? <AnalysisView analysis={selected.analysis} /> : <div className="card"><p>还没有复盘。可以在概览里生成。</p></div>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  )
}
