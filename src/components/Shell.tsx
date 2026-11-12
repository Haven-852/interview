import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { useApp, type Page } from '../lib/appContext'
import { load } from '../lib/storage'

const groups: { label: string; items: { id: Page; name: string }[] }[] = [
  {
    label: '准备',
    items: [
      { id: 'home', name: '总览' },
      { id: 'materials', name: '材料' },
      { id: 'learn', name: '学习' },
    ],
  },
  {
    label: '练习',
    items: [
      { id: 'mock', name: '模拟面试' },
      { id: 'assistant', name: '回答辅导' },
      { id: 'coding', name: '编程讲解' },
    ],
  },
  {
    label: '记录',
    items: [
      { id: 'history', name: '历史复盘' },
      { id: 'settings', name: '模型设置' },
    ],
  },
]

export function Shell({ children }: { children: ReactNode }) {
  const { page, go, envConfigured, revision } = useApp()
  const snapshot = useMemo(() => load(), [revision])
  const modelOn = Boolean(snapshot.settings.apiKey.trim() || envConfigured)
  const role = snapshot.profile.targetRole || '还没写目标岗位'
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="mark" aria-hidden="true" />
          <div>
            <strong>镜面</strong>
            <em>本地面试智能体</em>
          </div>
        </div>
        <div className="nav-scroll">
          {groups.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-label">{group.label}</div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="nav-btn"
                  aria-current={page === item.id ? 'page' : undefined}
                  onClick={() => go(item.id)}
                >
                  {item.name}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="aside-foot">
          <strong>{modelOn ? `模型 · ${snapshot.settings.model}` : '演示引擎'}</strong>
          <span>{role}</span>
          <span>材料保存在这台浏览器里</span>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  )
}
