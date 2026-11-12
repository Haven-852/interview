import type { Database, Profile, Session, Settings } from './types'

const KEY = 'mirror.v1'

export const defaultProfile = (): Profile => ({
  name: '',
  targetCompany: '',
  targetRole: '',
  objective: '',
  language: 'zh',
  resume: '',
  jobDescription: '',
  notes: '',
  priorityQuestions: [],
})

export const defaultSettings = (): Settings => ({
  apiBase: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  responseLength: 'medium',
  responseTiming: 'balanced',
  autoSkip: true,
  fontScale: 'md',
  newestFirst: false,
  speakQuestions: true,
})

const empty = (): Database => ({
  profile: defaultProfile(),
  settings: defaultSettings(),
  sessions: [],
})

export function load(): Database {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return empty()
    const data = JSON.parse(raw) as Partial<Database>
    return {
      profile: {
        ...defaultProfile(),
        ...data.profile,
        priorityQuestions: Array.isArray(data.profile?.priorityQuestions) ? data.profile.priorityQuestions : [],
      },
      settings: { ...defaultSettings(), ...data.settings },
      sessions: Array.isArray(data.sessions) ? data.sessions : [],
    }
  } catch {
    return empty()
  }
}

export function save(db: Database) {
  localStorage.setItem(KEY, JSON.stringify(db))
}

export function upsertSession(session: Session) {
  const db = load()
  const index = db.sessions.findIndex((item) => item.id === session.id)
  if (index >= 0) db.sessions[index] = session
  else db.sessions.unshift(session)
  db.sessions = db.sessions.slice(0, 100)
  save(db)
}

export function deleteSession(id: string) {
  const db = load()
  db.sessions = db.sessions.filter((item) => item.id !== id)
  save(db)
}
