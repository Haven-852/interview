import { useRef, useState } from 'react'
import { CopyButton } from '../components/ui'
import { useApp } from '../lib/appContext'
import { readScreenshot } from '../lib/api'
import { CODE_LANGUAGES } from '../lib/constants'
import { generateCoding } from '../lib/engine'
import { uid } from '../lib/format'
import { load, upsertSession } from '../lib/storage'
import type { CodingResult } from '../lib/types'

export function CodingPage() {
  const { envConfigured, touch } = useApp()
  const [problem, setProblem] = useState('两数之和：给定整数数组和目标值，返回和为目标值的两个下标。同一个元素不能使用两次。')
  const [language, setLanguage] = useState<(typeof CODE_LANGUAGES)[number]>('TypeScript')
  const [notes, setNotes] = useState('')
  const [result, setResult] = useState<CodingResult | null>(null)
  const [pending, setPending] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function explain(question: string) {
    setPending(true)
    setStatus('整理思路…')
    setError('')
    try {
      const coding = await generateCoding({
        settings: load().settings,
        envConfigured,
        problem: question,
        language,
        notes,
      })
      setResult(coding)
      const profile = load().profile
      upsertSession({
        id: uid(),
        type: 'coding',
        title: question.slice(0, 32),
        company: profile.targetCompany,
        role: profile.targetRole,
        language: profile.language,
        createdAt: Date.now(),
        endedAt: Date.now(),
        messages: [{ id: uid(), role: 'interviewer', content: question, createdAt: Date.now() }],
        coding,
      })
      touch()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '讲解失败')
    } finally {
      setPending(false)
      setStatus('')
    }
  }

  function run() {
    const question = problem.trim()
    if (!question || pending) return
    void explain(question)
  }

  async function recognize(files: File[]) {
    const images = files.filter((file) => file.type.startsWith('image/')).slice(0, 3)
    if (!images.length || pending) return
    if (images.some((file) => file.size > 8_000_000)) {
      setError('截图太大，请裁到题目区域再贴。')
      return
    }
    setPending(true)
    setError('')
    setStatus('正在识别截图…')
    try {
      const parts = []
      for (const file of images) parts.push(await readScreenshot(file))
      const text = parts.filter(Boolean).join('\n')
      if (!text.trim()) throw new Error('截图里没有识别出文字。')
      setProblem(text)
      await explain(text)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '截图识别失败')
      setPending(false)
      setStatus('')
    }
  }

  return (
    <div className="page">
      <p className="kicker">编程讲解</p>
      <h1>先讲为什么这样解，再把代码写出来。</h1>
      <p className="lede">把题目打在下面，或直接把截图粘贴、拖进题目框。截图会用本地文字模型读出题目，再给出思路和代码。语言可以选择 C 或 C++。</p>
      {error ? <div className="banner banner-bad">{error}</div> : null}
      {status ? <div className="banner">{status}</div> : null}
      <label className="field">
        <span>题目</span>
        <textarea
          value={problem}
          onChange={(event) => setProblem(event.target.value)}
          style={{ minHeight: 160 }}
          onPaste={(event) => {
            const images = [...event.clipboardData.files]
            if (!images.length) return
            event.preventDefault()
            void recognize(images)
          }}
          onDrop={(event) => {
            const images = [...event.dataTransfer.files]
            if (!images.some((file) => file.type.startsWith('image/'))) return
            event.preventDefault()
            void recognize(images)
          }}
          onDragOver={(event) => event.preventDefault()}
        />
      </label>
      <div className="grid-2">
        <label className="field">
          <span>语言</span>
          <select value={language} onChange={(event) => setLanguage(event.target.value as (typeof CODE_LANGUAGES)[number])}>
            {CODE_LANGUAGES.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label className="field">
          <span>补充约束</span>
          <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="例如：要返回下标，数据规模 10^5" />
        </label>
      </div>
      <div className="row wrap">
        <button className="btn btn-primary" type="button" disabled={pending || !problem.trim()} onClick={run}>{pending ? status || '整理思路…' : '生成讲解'}</button>
        <button className="btn" type="button" disabled={pending} onClick={() => fileRef.current?.click()}>上传截图</button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const files = [...(event.target.files || [])]
            event.target.value = ''
            void recognize(files)
          }}
        />
      </div>
      {result ? (
        <div className="stack">
          <section className="card">
            <div className="spread wrap">
              <h2>{result.pattern}</h2>
              <span className={result.source === 'model' ? 'tag model' : 'tag demo'}>{result.confident ? '可以对照代码' : '先练讲解框架'}</span>
            </div>
            <ol>{result.idea.map((item) => <li key={item}>{item}</li>)}</ol>
          </section>
          <section className="grid-2">
            <div className="card"><h2>时间</h2><p>{result.complexity.time}</p><p className="tiny">{result.complexity.why}</p></div>
            <div className="card"><h2>空间</h2><p>{result.complexity.space}</p></div>
          </section>
          {result.code ? (
            <section className="stack">
              <div className="spread"><h2>参考代码</h2><CopyButton text={result.code} /></div>
              <pre className="codebox"><code>{result.code}</code></pre>
            </section>
          ) : null}
          <section className="card">
            <h2>口述顺序</h2>
            <p>{result.narration}</p>
          </section>
          <section className="card">
            <h2>容易讲错的地方</h2>
            <ul>{result.pitfalls.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
        </div>
      ) : null}
    </div>
  )
}
