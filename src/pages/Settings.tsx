import { useState } from 'react'
import { Field } from '../components/ui'
import { chatComplete } from '../lib/api'
import { useApp } from '../lib/appContext'
import { load, save } from '../lib/storage'
import type { Settings } from '../lib/types'

export function SettingsPage() {
  const { envConfigured, envModel, touch } = useApp()
  const [settings, setSettings] = useState<Settings>(() => load().settings)
  const [showKey, setShowKey] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [ok, setOk] = useState(false)

  function update(partial: Partial<Settings>) {
    const next = { ...settings, ...partial }
    setSettings(next)
    const db = load()
    db.settings = next
    save(db)
    touch()
  }

  async function test() {
    setPending(true)
    setMessage('')
    try {
      const text = await chatComplete({
        messages: [{ role: 'user', content: '只回复这四个字：连接成功' }],
        settings,
        temperature: 0,
        maxTokens: 200,
      })
      setOk(true)
      setMessage(text.trim() || '模型有返回。')
    } catch (reason) {
      setOk(false)
      setMessage(reason instanceof Error ? reason.message : '连接失败')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="page">
      <p className="kicker">模型</p>
      <h1>演示引擎可以直接练，模型用来贴合你的材料。</h1>
      <p className="lede">
        地址需要兼容 OpenAI 的对话接口，并以 /v1 结尾。密钥保存在这台浏览器的本地存储里，请求只发到你填写的地址。
        {envConfigured ? ` 检测到本机环境变量已配置密钥${envModel ? `，默认模型 ${envModel}` : ''}。页面密钥留空时会使用它。` : ''}
      </p>
      <div className="card stack">
        <Field label="接口地址" hint="Ollama 示例：http://127.0.0.1:11434/v1 ，密钥可填 ollama。">
          <input value={settings.apiBase} onChange={(event) => update({ apiBase: event.target.value })} spellCheck={false} />
        </Field>
        <Field label="模型名称" hint="DeepSeek 填 deepseek-flash 或 deepseek-v4-pro。">
          <input value={settings.model} onChange={(event) => update({ model: event.target.value })} spellCheck={false} />
        </Field>
        <Field label="密钥">
          <input
            type={showKey ? 'text' : 'password'}
            value={settings.apiKey}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => update({ apiKey: event.target.value })}
          />
        </Field>
        <div className="row wrap">
          <button className="btn" type="button" onClick={() => setShowKey((value) => !value)}>{showKey ? '隐藏密钥' : '显示密钥'}</button>
          <button className="btn btn-ghost" type="button" onClick={() => update({ apiKey: '' })}>清除密钥</button>
          <button className="btn btn-primary" type="button" disabled={pending || (!settings.apiKey.trim() && !envConfigured)} onClick={() => void test()}>
            {pending ? '测试中…' : '测试连接'}
          </button>
        </div>
        {message ? <div className={ok ? 'banner banner-ok' : 'banner banner-bad'}>{message}</div> : null}
      </div>
      <section className="card">
        <h2>练习时的默认行为</h2>
        <div className="row wrap">
          <button className={settings.speakQuestions ? 'chip on' : 'chip'} type="button" onClick={() => update({ speakQuestions: !settings.speakQuestions })}>
            <strong>{settings.speakQuestions ? '朗读面试官问题' : '不朗读问题'}</strong>
          </button>
          <button className={settings.autoSkip ? 'chip on' : 'chip'} type="button" onClick={() => update({ autoSkip: !settings.autoSkip })}>
            <strong>{settings.autoSkip ? '跳过寒暄' : '保留寒暄'}</strong>
          </button>
        </div>
      </section>
    </div>
  )
}
