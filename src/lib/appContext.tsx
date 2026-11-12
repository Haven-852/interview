import { createContext, useContext } from 'react'

export type Page = 'home' | 'materials' | 'assistant' | 'mock' | 'coding' | 'history' | 'learn' | 'settings'

export type Pointer = { page: Page; sessionId?: string }

type AppContextValue = {
  page: Page
  pointer: Pointer
  go: (page: Page, sessionId?: string) => void
  envConfigured: boolean
  envModel: string
  revision: number
  touch: () => void
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useApp() {
  const value = useContext(AppContext)
  if (!value) throw new Error('页面上下文不存在')
  return value
}
