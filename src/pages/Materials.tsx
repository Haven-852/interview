import { useMemo, useState } from 'react'
import { Field } from '../components/ui'
import { useApp } from '../lib/appContext'
import { generateGap } from '../lib/engine'
import type { GapReport, Profile } from '../lib/types'
import { load, save } from '../lib/storage'
import { sampleProfile } from '../lib/sample'
import { pdfReadError, readPdfResume } from '../lib/pdfResume'

export function MaterialsPage() {
  const { touch, envConfigured } = useApp()
  const [profile, setProfile] = useState<Profile>(() => load().profile)
  const [gap, setGap] = useState<GapReport | null>(null)
  const [pending, setPending] = useState(false)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState('')
  const settings = useMemo(() => load().settings, [profile])

  function update(partial: Partial<Profile>) {
    const next = { ...profile, ...partial }
    setProfile(next)
    const db = load()
    db.profile = next
    save(db)
    touch()
  }

  async function compare() {
    setPending(true)
    setError('')
    try {
      setGap(await generateGap({ profile, settings: load().settings, envConfigured }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '对照失败')
    } finally {
      setPending(false)
    }
  }

  async function onFile(file: File | undefined) {
    if (!file || reading) return
    const pdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    const limit = pdf ? 8 * 1024 * 1024 : 1024 * 1024
    if (file.size > limit) {
      setError(pdf ? 'PDF 超过 8MB。请导出文字版，或把正文粘贴进来。' : '文件超过 1MB。请粘贴正文。')
      return
    }
    if (profile.resume.trim() && !window.confirm('用文件里的内容替换当前简历？')) return
    setReading(true)
    setError('')
    try {
      const resume = pdf ? await readPdfResume(await file.arrayBuffer()) : await file.text()
      if (pdf && resume.trim().length < 20) {
        setError('这份 PDF 里几乎没有可复制的文字，可能是扫描图片。请换文字版 PDF，或直接粘贴正文。')
        return
      }
      update({ resume })
    } catch (reason) {
      const quota = reason instanceof DOMException && reason.name === 'QuotaExceededError'
      setError(quota ? '解析出的文字太长，这台浏览器存不下。' : pdf ? pdfReadError(reason) : '没有读出文件内容。')
    } finally {
      setReading(false)
    }
  }

  return (
    <div className="page">
      <p className="kicker">材料</p>
      <h1>先给练习一个真实的上下文。</h1>
      <p className="lede">简历、岗位描述、笔记和优先问题会在模拟面试和回答辅导里被引用。可以上传 txt、md 或 PDF。PDF 在这台浏览器里解析成文字，只保存文字，不保存原文件。</p>
      {error ? <div className="banner banner-bad">{error}</div> : null}
      {reading ? <div className="banner">正在从 PDF 读取文字…</div> : null}
      <div className="grid-2">
        <Field label="姓名">
          <input value={profile.name} onChange={(event) => update({ name: event.target.value })} />
        </Field>
        <Field label="回答语言">
          <select value={profile.language} onChange={(event) => update({ language: event.target.value as Profile['language'] })}>
            <option value="zh">简体中文</option>
            <option value="en">English（演示引擎仍以中文为主）</option>
          </select>
        </Field>
        <Field label="目标公司">
          <input value={profile.targetCompany} onChange={(event) => update({ targetCompany: event.target.value })} />
        </Field>
        <Field label="目标岗位">
          <input value={profile.targetRole} onChange={(event) => update({ targetRole: event.target.value })} />
        </Field>
      </div>
      <Field label="这次面试想证明什么">
        <input value={profile.objective} onChange={(event) => update({ objective: event.target.value })} />
      </Field>
      <Field label="简历" hint="可以粘贴，也可以上传 PDF。只保留能在追问里展开的经历和数字。">
        <textarea value={profile.resume} onChange={(event) => update({ resume: event.target.value })} style={{ minHeight: 220 }} />
      </Field>
      <div className="row wrap">
        <label className="btn">
          {reading ? '正在解析…' : '上传 txt / md / pdf'}
          <input
            hidden
            type="file"
            accept=".txt,.md,.markdown,.pdf,text/plain,application/pdf"
            disabled={reading}
            onChange={(event) => {
              void onFile(event.target.files?.[0])
              event.target.value = ''
            }}
          />
        </label>
        <button
          className="btn btn-ghost"
          type="button"
          onClick={() => {
            if (profile.resume.trim() && !window.confirm('用示例简历替换当前内容？')) return
            const next = sampleProfile
            setProfile(next)
            const db = load()
            db.profile = next
            save(db)
            touch()
          }}
        >
          载入示例候选人
        </button>
      </div>
      <Field label="岗位描述">
        <textarea value={profile.jobDescription} onChange={(event) => update({ jobDescription: event.target.value })} />
      </Field>
      <Field label="笔记">
        <textarea value={profile.notes} onChange={(event) => update({ notes: event.target.value })} />
      </Field>
      <Field label="优先问题" hint="每行一条。模拟面试会在中段自然问到，而不是开场照读。">
        <textarea
          value={profile.priorityQuestions.join('\n')}
          onChange={(event) => update({ priorityQuestions: event.target.value.split('\n') })}
        />
      </Field>
      <div className="row">
        <button className="btn btn-primary" type="button" disabled={pending} onClick={() => void compare()}>
          {pending ? '对照中…' : '对照岗位'}
        </button>
        <span className="tiny">{settings.apiKey || envConfigured ? '将使用模型对照' : '当前使用词表对照'}</span>
      </div>
      {gap ? (
        <div className="grid-2">
          <section className="card">
            <h2>简历里已经能对上</h2>
            {gap.covered.length ? <ul>{gap.covered.map((item) => <li key={item}>{item}</li>)}</ul> : <p>没有直接对上的技能词。</p>}
          </section>
          <section className="card">
            <h2>岗位提到、简历没写</h2>
            {gap.missing.length ? <ul>{gap.missing.map((item) => <li key={item}>{item}</li>)}</ul> : <p>没有发现明显缺口。</p>}
          </section>
          <section className="card" style={{ gridColumn: '1 / -1' }}>
            <h2>怎么用这些缺口</h2>
            <ul>{gap.suggestions.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
        </div>
      ) : null}
    </div>
  )
}
