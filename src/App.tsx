import { useEffect, useState } from 'react'
import { Shell } from './components/Shell'
import { AppContext, type Page, type Pointer } from './lib/appContext'
import { fetchHealth } from './lib/api'
import { AssistantPage } from './pages/Assistant'
import { CodingPage } from './pages/Coding'
import { HistoryPage } from './pages/History'
import { HomePage } from './pages/Home'
import { LearnPage } from './pages/Learn'
import { MaterialsPage } from './pages/Materials'
import { MockPage } from './pages/Mock'
import { SettingsPage } from './pages/Settings'

const pages: Page[] = ['home', 'materials', 'assistant', 'mock', 'coding', 'history', 'learn', 'settings']
const titles: Record<Page, string> = {
  home: '总览',
  materials: '材料',
  assistant: '回答辅导',
  mock: '模拟面试',
  coding: '编程讲解',
  history: '历史复盘',
  learn: '学习',
  settings: '模型设置',
}

function initialPage(): Page {
  const saved = sessionStorage.getItem('mirror.page')
  return pages.includes(saved as Page) ? (saved as Page) : 'home'
}

export function App() {
  const [page, setPage] = useState<Page>(initialPage)
  const [pointer, setPointer] = useState<Pointer>({ page: 'home' })
  const [revision, setRevision] = useState(0)
  const [health, setHealth] = useState({ envConfigured: false, envModel: '' })

  useEffect(() => {
    void fetchHealth().then(setHealth).catch(() => setHealth({ envConfigured: false, envModel: '' }))
  }, [])

  useEffect(() => {
    document.title = `${titles[page]} · 镜面`
    sessionStorage.setItem('mirror.page', page)
  }, [page])

  const go = (next: Page, sessionId?: string) => {
    setPage(next)
    setPointer({ page: next, sessionId })
  }

  return (
    <AppContext.Provider
      value={{
        page,
        pointer,
        go,
        envConfigured: health.envConfigured,
        envModel: health.envModel,
        revision,
        touch: () => setRevision((value) => value + 1),
      }}
    >
      <Shell>
        {page === 'home' && <HomePage />}
        {page === 'materials' && <MaterialsPage />}
        {page === 'assistant' && <AssistantPage />}
        {page === 'mock' && <MockPage />}
        {page === 'coding' && <CodingPage />}
        {page === 'history' && <HistoryPage />}
        {page === 'learn' && <LearnPage />}
        {page === 'settings' && <SettingsPage />}
      </Shell>
    </AppContext.Provider>
  )
}
