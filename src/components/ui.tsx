import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Analysis, CoachCard, CodingResult } from '../lib/types'

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  )
}

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  if (!text.trim()) return null
  return (
    <button
      type="button"
      className="btn btn-ghost"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true)
          window.setTimeout(() => setDone(false), 1200)
        })
      }}
    >
      {done ? '已复制' : '复制'}
    </button>
  )
}

export function toneOf(score: number) {
  if (score >= 85) return 'good'
  if (score >= 70) return 'mid'
  return 'low'
}

export function ScoreRing({ score }: { score: number }) {
  const radius = 42
  const length = 2 * Math.PI * radius
  const offset = length - (Math.max(0, Math.min(100, score)) / 100) * length
  return (
    <svg className="ring" viewBox="0 0 100 100" role="img" aria-label={`总分 ${score}`}>
      <circle className="ring-bg" cx="50" cy="50" r={radius} />
      <circle className="ring-fg" cx="50" cy="50" r={radius} strokeDasharray={length} strokeDashoffset={offset} />
      <text x="50" y="56" textAnchor="middle">
        {score}
      </text>
    </svg>
  )
}

export function CoachView({ card, draft, source }: { card: CoachCard; draft?: boolean; source?: string }) {
  return (
    <article className="coach">
      <div className="spread wrap">
        <strong>回答提纲</strong>
        <span className={source === 'model' ? 'tag model' : 'tag demo'}>{draft ? '草稿' : source === 'model' ? '模型' : '演示引擎'}</span>
      </div>
      {card.structure ? <p>{card.structure}</p> : null}
      {card.talkingPoints.length ? (
        <div>
          <h3>回答要点</h3>
          <ul>
            {card.talkingPoints.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="spread">
        <h3>口述稿</h3>
        <CopyButton text={card.script} />
      </div>
      <p>{card.script}</p>
      {card.caveats.length ? (
        <div className="banner banner-warn">
          {card.caveats.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
      ) : null}
      {card.sources?.length ? (
        <div>
          <h3>公开资料</h3>
          <ul>
            {card.sources.map((item) => (
              <li key={item.url}>
                <a href={item.url} target="_blank" rel="noreferrer">
                  {item.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {card.followUps.length ? (
        <div>
          <h3>可能的追问</h3>
          <ul>
            {card.followUps.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  )
}

export function CodingCard({ result }: { result: CodingResult }) {
  return (
    <article className="coach">
      <div className="spread wrap">
        <strong>编程题 · {result.pattern}</strong>
        <span className={result.source === 'model' ? 'tag model' : 'tag demo'}>{result.confident ? '题目和参考代码' : '先整理题目'}</span>
      </div>
      <p>{result.narration}</p>
      {result.idea.length ? (
        <ol>
          {result.idea.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      ) : null}
      <p>
        时间 {result.complexity.time} · 空间 {result.complexity.space}
      </p>
      {result.complexity.why ? <p className="tiny">{result.complexity.why}</p> : null}
      {result.code ? (
        <>
          <div className="spread">
            <h3>参考代码</h3>
            <CopyButton text={result.code} />
          </div>
          <pre className="codebox">
            <code>{result.code}</code>
          </pre>
        </>
      ) : null}
      {result.pitfalls.length ? (
        <ul>
          {result.pitfalls.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </article>
  )
}

export function AnalysisView({ analysis }: { analysis: Analysis }) {
  return (
    <div className="stack">
      <div className="card review-head">
        <ScoreRing score={analysis.overall} />
        <div className="stack">
          <span className={analysis.source === 'model' ? 'tag model' : 'tag demo'}>
            {analysis.source === 'model' ? '模型复盘' : '规则复盘'}
          </span>
          <p>{analysis.summary}</p>
        </div>
      </div>
      {analysis.dimensions.length ? (
        <div className="card">
          <h2>能力维度</h2>
          {analysis.dimensions.map((item) => (
            <div key={item.name} className="stack">
              <div className="spread">
                <strong>{item.name}</strong>
                <span>{item.score}</span>
              </div>
              <div className={`bar ${toneOf(item.score)}`}>
                <span style={{ width: `${item.score}%` }} />
              </div>
              <p className="tiny">{item.comment}</p>
            </div>
          ))}
        </div>
      ) : null}
      <div className="grid-2">
        <div className="card">
          <h2>做得好的地方</h2>
          <ul>
            {analysis.strengths.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h2>下次改这一点</h2>
          <ul>
            {analysis.improvements.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
      {analysis.questions.map((item) => (
        <article className="card" key={`${item.question}-${item.answer.slice(0, 24)}`}>
          <div className="spread">
            <h2>逐题</h2>
            <strong>{item.score}</strong>
          </div>
          <p><strong>问：</strong>{item.question}</p>
          <p><strong>答：</strong>{item.answer}</p>
          <p>{item.feedback}</p>
          <p className="muted">可以改成：{item.better}</p>
        </article>
      ))}
      <div className="banner banner-ok">{analysis.nextPractice}</div>
    </div>
  )
}
