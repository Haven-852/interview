import { useMemo } from 'react'
import { useApp } from '../lib/appContext'
import { TYPE_LABEL } from '../lib/constants'
import { formatTime, readiness } from '../lib/format'
import { sampleProfile } from '../lib/sample'
import { load, save } from '../lib/storage'

export function HomePage() {
  const { go, revision, touch } = useApp()
  const db = useMemo(() => load(), [revision])
  const items = readiness(db.profile)
  const ready = items.filter((item) => item.ok).length
  const recent = db.sessions.slice(0, 4)
  const tip = db.sessions.find((session) => session.analysis)?.analysis?.nextPractice

  function loadSample() {
    if (db.profile.resume.trim().length >= 40 && !window.confirm('当前简历会被示例候选人替换。继续吗？')) return
    const next = load()
    next.profile = sampleProfile
    save(next)
    touch()
    go('mock')
  }

  return (
    <div className="page">
      <p className="kicker">准备 · 练习 · 复盘</p>
      <h1>把简历、岗位和追问放进同一场练习。</h1>
      <p className="lede">
        镜面对照公开的面试助手流程，在本地完成材料准备、模拟面试、回答提纲、编程讲解和历史复盘。回答只引用你写进材料的经历。真实面试请遵守用人单位和平台的规则。
      </p>
      <div className="grid-3">
        <button className="card card-link" type="button" onClick={() => go('mock')}>
          <h2>模拟面试</h2>
          <p>面试官一次问一题。你可以用语音回答，结束后看分数和逐题建议。</p>
        </button>
        <button className="card card-link" type="button" onClick={() => go('assistant')}>
          <h2>回答辅导</h2>
          <p>打开实时监听后，面试官一句话说完就会给出对应回答。听到或粘贴编程题时，会整理题目、思路和代码。</p>
        </button>
        <button className="card card-link" type="button" onClick={() => go('coding')}>
          <h2>编程讲解</h2>
          <p>粘贴题目，先看模式、复杂度和讲解顺序，再看代码。</p>
        </button>
      </div>
      <div className="grid-2">
        <section className="card">
          <div className="spread">
            <h2>材料完成度 {ready}/4</h2>
            <button className="btn btn-ghost" type="button" onClick={() => go('materials')}>去填写</button>
          </div>
          <div className="checks">
            {items.map((item) => (
              <div className="check" key={item.label}>
                <span className={item.ok ? 'dot on' : 'dot'} />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
          <button className="btn btn-primary" type="button" onClick={loadSample}>用示例候选人开始</button>
        </section>
        <section className="card">
          <h2>最近的练习</h2>
          {recent.length === 0 ? <p>还没有场次。可以从示例候选人开始一场行为面试。</p> : null}
          {recent.map((session) => (
            <button className="card-link" type="button" key={session.id} onClick={() => go('history', session.id)}>
              <strong>{session.title}</strong>
              <p className="tiny">{TYPE_LABEL[session.type]} · {formatTime(session.createdAt)}{session.analysis ? ` · ${session.analysis.overall} 分` : ''}</p>
            </button>
          ))}
          {tip ? <div className="banner banner-ok">{tip}</div> : null}
        </section>
      </div>
    </div>
  )
}
