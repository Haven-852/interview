export type ResponseLength = 'short' | 'medium' | 'long'
export type ResponseTiming = 'fast' | 'balanced' | 'deep'
export type FontScale = 'sm' | 'md' | 'lg'
export type SessionType = 'mock' | 'assistant' | 'coding'
export type CoachAction = 'answer' | 'followup' | 'translate' | 'shorter'
export type Source = 'demo' | 'model'

export type Profile = {
  name: string
  targetCompany: string
  targetRole: string
  objective: string
  language: 'zh' | 'en'
  resume: string
  jobDescription: string
  notes: string
  priorityQuestions: string[]
}

export type Settings = {
  apiBase: string
  apiKey: string
  model: string
  responseLength: ResponseLength
  responseTiming: ResponseTiming
  autoSkip: boolean
  fontScale: FontScale
  newestFirst: boolean
  speakQuestions: boolean
}

export type CoachSource = {
  title: string
  url: string
}

export type CoachCard = {
  talkingPoints: string[]
  structure: string
  script: string
  caveats: string[]
  followUps: string[]
  sources?: CoachSource[]
}

export type InterviewerTurn = {
  reaction: string
  question: string
  hint: string
  standard?: string
}

export type ReadyQuestion = {
  chapter: string
  question: string
  intent: string
  priority: string
}

export type ReadyBrief = {
  interviewType: '业务面' | 'HR面'
  searchNote: string
  companyLines: string[]
  intro: string
  questions: ReadyQuestion[]
  gaps: string[]
  reverseQuestions: string[]
  sources: CoachSource[]
  source: Source
}

export type Dimension = {
  name: string
  score: number
  comment: string
}

export type QuestionFeedback = {
  question: string
  answer: string
  score: number
  feedback: string
  better: string
}

export type Analysis = {
  overall: number
  summary: string
  dimensions: Dimension[]
  strengths: string[]
  improvements: string[]
  questions: QuestionFeedback[]
  nextPractice: string
  source: Source
}

export type CodingResult = {
  pattern: string
  idea: string[]
  complexity: { time: string; space: string; why: string }
  code: string
  narration: string
  pitfalls: string[]
  confident: boolean
  source: Source
}

export type GapReport = {
  covered: string[]
  missing: string[]
  suggestions: string[]
  source: Source
}

export type ChatMessage = {
  id: string
  role: 'interviewer' | 'candidate' | 'coach' | 'system'
  content: string
  createdAt: number
  reaction?: string
  hint?: string
  standard?: string
  card?: CoachCard
  coding?: CodingResult
  draft?: boolean
  source?: Source
}

export type Session = {
  id: string
  type: SessionType
  title: string
  company: string
  role: string
  scenario?: string
  persona?: string
  difficulty?: string
  language: 'zh' | 'en'
  createdAt: number
  endedAt?: number
  messages: ChatMessage[]
  analysis?: Analysis
  coding?: CodingResult
  ready?: ReadyBrief
}

export type Database = {
  profile: Profile
  settings: Settings
  sessions: Session[]
}

export type LlmMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}
