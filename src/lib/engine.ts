import { chatComplete, searchPublic } from './api'
import { coachDemo, codingDemo, gapDemo, interviewerDemo, readyDemo, reviewDemo } from './demo'
import { asStrings, asText, clampScore, parseJsonBlock } from './json'
import { coachMaxTokens, coachMessages, codingMessages, gapMessages, interviewerMessages, readyMessages, reviewMessages, temperatureOf } from './prompts'
import type {
  Analysis,
  CoachAction,
  CoachCard,
  CodingResult,
  GapReport,
  InterviewerTurn,
  Profile,
  ReadyBrief,
  Session,
  Settings,
  Source,
} from './types'

function modelReady(settings: Settings, envConfigured: boolean) {
  return Boolean(settings.apiKey.trim() || envConfigured)
}

function normalizeCoach(value: Partial<CoachCard> | null, raw: string): CoachCard {
  if (!value) {
    return {
      talkingPoints: [],
      structure: '',
      script: raw.trim() || '模型没有返回可用内容。',
      caveats: ['模型没有返回结构化结果，下面是原文。'],
      followUps: [],
    }
  }
  return {
    talkingPoints: asStrings(value.talkingPoints),
    structure: asText(value.structure),
    script: asText(value.script, raw.trim()),
    caveats: asStrings(value.caveats),
    followUps: asStrings(value.followUps),
  }
}

export async function generateCoach(input: {
  profile: Profile
  settings: Settings
  envConfigured: boolean
  question: string
  action: CoachAction
  previousScript?: string
  forceModel?: boolean
  live?: boolean
}): Promise<{ card: CoachCard; source: Source }> {
  const ready = modelReady(input.settings, input.envConfigured)
  if (!input.forceModel || !ready) {
    if (!ready) {
      return {
        card: coachDemo({
          profile: input.profile,
          question: input.question,
          action: input.action,
          length: input.settings.responseLength,
          previousScript: input.previousScript,
        }),
        source: 'demo',
      }
    }
  }
  const references =
    input.action === 'answer' || input.action === 'followup'
      ? await searchPublic(input.question).catch(() => [])
      : undefined
  const text = await chatComplete({
    messages: coachMessages({
      profile: input.profile,
      settings: input.settings,
      question: input.question,
      action: input.action,
      previousScript: input.previousScript,
      references,
    }),
    settings: input.settings,
    temperature: input.live ? 0.2 : temperatureOf(input.settings.responseTiming),
    maxTokens: Math.max(coachMaxTokens(input.settings.responseLength), references?.length ? 1400 : 1000),
    thinking: input.live ? 'disabled' : undefined,
  })
  const card = normalizeCoach(parseJsonBlock<CoachCard>(text), text)
  if (references?.length) card.sources = references.map((item) => ({ title: item.title, url: item.url }))
  return { card, source: 'model' }
}

export async function generateTurn(input: {
  profile: Profile
  settings: Settings
  envConfigured: boolean
  scenario: string
  persona: string
  difficulty: string
  transcript: { role: 'interviewer' | 'candidate'; content: string }[]
  ready?: ReadyBrief
}): Promise<{ turn: InterviewerTurn; source: Source }> {
  const demo = () =>
    interviewerDemo({
      profile: input.profile,
      scenario: input.scenario,
      persona: input.persona,
      difficulty: input.difficulty,
      transcript: input.transcript,
      ready: input.ready,
    })
  if (!modelReady(input.settings, input.envConfigured)) return { turn: demo(), source: 'demo' }
  const text = await chatComplete({
    messages: interviewerMessages(input),
    settings: input.settings,
    temperature: 0.5,
    maxTokens: input.transcript.some((item) => item.role === 'candidate') ? 1100 : 500,
    thinking: 'disabled',
  })
  const parsed = parseJsonBlock<InterviewerTurn>(text)
  if (!parsed?.question) throw new Error('模型没有返回下一问。可以重试，或先清空密钥改用演示引擎。')
  return {
    turn: {
      reaction: asText(parsed.reaction),
      question: asText(parsed.question),
      hint: asText(parsed.hint),
      standard: input.transcript.some((item) => item.role === 'candidate') ? asText(parsed.standard) : '',
    },
    source: 'model',
  }
}

export async function generateReady(input: {
  profile: Profile
  settings: Settings
  envConfigured: boolean
  interviewType: '业务面' | 'HR面'
}): Promise<ReadyBrief> {
  const company = input.profile.targetCompany.trim()
  const role = input.profile.targetRole.trim()
  const references = company ? await searchPublic(`${company} ${role} 面经`.trim()).catch(() => []) : []
  const sources = references.map((item) => ({ title: item.title, url: item.url }))
  if (!modelReady(input.settings, input.envConfigured)) {
    return readyDemo({ profile: input.profile, interviewType: input.interviewType, references })
  }
  const text = await chatComplete({
    messages: readyMessages({
      profile: input.profile,
      interviewType: input.interviewType,
      references,
    }),
    settings: input.settings,
    temperature: 0.2,
    maxTokens: 1800,
    thinking: 'disabled',
  })
  const parsed = parseJsonBlock<Partial<ReadyBrief>>(text)
  const questions = Array.isArray(parsed?.questions)
    ? parsed.questions
        .map((item) => ({
          chapter: asText(item?.chapter, '业务能力'),
          question: asText(item?.question),
          intent: asText(item?.intent),
          priority: asText(item?.priority, '了解'),
        }))
        .filter((item) => item.question)
    : []
  if (!questions.length) return readyDemo({ profile: input.profile, interviewType: input.interviewType, references })
  return {
    interviewType: input.interviewType,
    searchNote: asText(parsed?.searchNote, references.length ? `检索到 ${references.length} 条公开页面，使用前请自行核对。` : '未检索到有效面经。'),
    companyLines: asStrings(parsed?.companyLines).slice(0, 4),
    intro: asText(parsed?.intro),
    questions: questions.slice(0, 6),
    gaps: asStrings(parsed?.gaps).slice(0, 3),
    reverseQuestions: asStrings(parsed?.reverseQuestions).slice(0, 4),
    sources,
    source: 'model',
  }
}

function normalizeAnalysis(value: Partial<Analysis> | null, raw: string): Analysis {
  if (!value) {
    return {
      overall: 0,
      summary: raw.trim() || '模型没有返回复盘。',
      dimensions: [],
      strengths: [],
      improvements: [],
      questions: [],
      nextPractice: '请重试生成复盘。',
      source: 'model',
    }
  }
  const dimensions = Array.isArray(value.dimensions)
    ? value.dimensions.map((item) => ({
        name: asText(item?.name, '维度'),
        score: clampScore(item?.score),
        comment: asText(item?.comment),
      }))
    : []
  const questions = Array.isArray(value.questions)
    ? value.questions.map((item) => ({
        question: asText(item?.question),
        answer: asText(item?.answer),
        score: clampScore(item?.score),
        feedback: asText(item?.feedback),
        better: asText(item?.better),
      }))
    : []
  const overall = value.overall === undefined && dimensions.length
    ? Math.round(dimensions.reduce((sum, item) => sum + item.score, 0) / dimensions.length)
    : clampScore(value.overall)
  return {
    overall,
    summary: asText(value.summary, '模型已返回复盘。'),
    dimensions,
    strengths: asStrings(value.strengths),
    improvements: asStrings(value.improvements),
    questions,
    nextPractice: asText(value.nextPractice, '挑选分数最低的一题，用同一段真实经历重说。'),
    source: 'model',
  }
}

export async function generateReview(input: {
  profile: Profile
  settings: Settings
  envConfigured: boolean
  session: Session
}): Promise<Analysis> {
  const prepared = input.session.type === 'assistant'
  if (!modelReady(input.settings, input.envConfigured)) {
    return reviewDemo({
      profile: input.profile,
      messages: input.session.messages.map((message) => ({ role: message.role, content: message.content })),
      prepared,
    })
  }
  const text = await chatComplete({
    messages: reviewMessages({
      profile: input.profile,
      title: input.session.title,
      transcript: input.session.messages.map((message) => ({ role: message.role, content: message.content })),
    }),
    settings: input.settings,
    temperature: 0.3,
    maxTokens: 1800,
  })
  return normalizeAnalysis(parseJsonBlock<Analysis>(text), text)
}

export async function generateCoding(input: {
  settings: Settings
  envConfigured: boolean
  problem: string
  language: string
  notes: string
  live?: boolean
}): Promise<CodingResult> {
  if (!modelReady(input.settings, input.envConfigured)) return codingDemo(input.problem, input.language)
  const text = await chatComplete({
    messages: codingMessages({ problem: input.problem, language: input.language, notes: input.notes }),
    settings: input.settings,
    temperature: 0.2,
    maxTokens: input.live ? 1200 : 1800,
    thinking: input.live ? 'disabled' : undefined,
  })
  const parsed = parseJsonBlock<Partial<CodingResult>>(text)
  if (!parsed) {
    return {
      pattern: '模型原文',
      idea: [],
      complexity: { time: '—', space: '—', why: '' },
      code: '',
      narration: text.trim(),
      pitfalls: ['模型没有返回结构化结果。'],
      confident: false,
      source: 'model',
    }
  }
  const complexity =
    parsed.complexity && typeof parsed.complexity === 'object'
      ? parsed.complexity
      : { time: '—', space: '—', why: '' }
  return {
    pattern: asText(parsed.pattern, '未标明模式'),
    idea: asStrings(parsed.idea),
    complexity: {
      time: asText(complexity.time, '—'),
      space: asText(complexity.space, '—'),
      why: asText(complexity.why),
    },
    code: asText(parsed.code),
    narration: asText(parsed.narration, text.trim()),
    pitfalls: asStrings(parsed.pitfalls),
    confident: Boolean(asText(parsed.code)),
    source: 'model',
  }
}

export async function generateGap(input: {
  profile: Profile
  settings: Settings
  envConfigured: boolean
}): Promise<GapReport> {
  if (!modelReady(input.settings, input.envConfigured)) return gapDemo(input.profile)
  const text = await chatComplete({
    messages: gapMessages(input.profile),
    settings: input.settings,
    temperature: 0.2,
    maxTokens: 900,
  })
  const parsed = parseJsonBlock<Partial<GapReport>>(text)
  if (!parsed) return { ...gapDemo(input.profile), suggestions: [text.trim(), ...gapDemo(input.profile).suggestions] }
  return {
    covered: asStrings(parsed.covered),
    missing: asStrings(parsed.missing),
    suggestions: asStrings(parsed.suggestions),
    source: 'model',
  }
}
