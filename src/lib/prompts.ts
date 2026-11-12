import { difficultyName, personaName, scenarioName } from './constants'
import { clip, questionsOf } from './format'
import type { CoachAction, LlmMessage, Profile, ResponseLength, ResponseTiming, Settings } from './types'

const languageLine = (profile: Profile) =>
  profile.language === 'en' ? 'Write every user-visible string in English.' : '所有给候选人看的文字使用简体中文。'

function lengthLine(length: ResponseLength) {
  if (length === 'short') return '口述稿控制在 80 到 140 个汉字，大约 30 秒。'
  if (length === 'long') return '口述稿控制在 320 到 480 个汉字，大约两分钟。'
  return '口述稿控制在 160 到 280 个汉字，大约一分钟。'
}

function timingLine(timing: ResponseTiming) {
  if (timing === 'fast') return '先给可以开口的第一句，少铺垫。'
  if (timing === 'deep') return '指出这题真正考察的能力，并说明回答里缺的证据。'
  return '保持结构和证据平衡。'
}

function contextBlock(profile: Profile) {
  return [
    `候选人：${profile.name || '未填写姓名'}`,
    `目标公司：${profile.targetCompany || '未填写'}`,
    `目标岗位：${profile.targetRole || '未填写'}`,
    `目标：${profile.objective || '未填写'}`,
    `简历：\n${clip(profile.resume) || '（空）'}`,
    `岗位描述：\n${clip(profile.jobDescription) || '（空）'}`,
    `笔记：\n${clip(profile.notes, 2000) || '（空）'}`,
    `优先问题：\n${questionsOf(profile).join('\n') || '（无）'}`,
  ].join('\n')
}

function referenceBlock(references?: { title: string; url: string; snippet: string; extract?: string }[]) {
  if (!references) return '这一次沿用上一版口述。压缩或翻译时保留其中的主流做法，不要改成只复述简历。'
  if (!references.length) {
    return '公开资料：（这次没有检索到可用页面。做法、原理、方案选型按公认的工程方法说明，并在 caveats 写明这不是候选人的个人经历。）'
  }
  const lines = references.map((item, index) => {
    const parts = [`${index + 1}. ${item.title}`, item.snippet ? `摘要：${item.snippet}` : '', item.extract ? `正文摘录：${item.extract}` : '', `来源：${item.url}`]
    return parts.filter(Boolean).join('\n')
  })
  return `公开资料（检索到的页面，用来补充简历里没写的做法）：\n${lines.join('\n\n')}`
}

export function coachMessages(input: {
  profile: Profile
  settings: Settings
  question: string
  action: CoachAction
  previousScript?: string
  references?: { title: string; url: string; snippet: string; extract?: string }[]
}): LlmMessage[] {
  return [
    {
      role: 'system',
      content: [
        '你是面试辅导教练。先把面试官问的做法答清楚，再看简历能不能接上。',
        languageLine(input.profile),
        lengthLine(input.settings.responseLength),
        timingLine(input.settings.responseTiming),
        '写法：',
        '1. 题目如果问的是做法、原理、方案选型或自由问答，必须先把主流怎么做讲完。有「公开资料」就依据资料；没有检索到页面时，按公认的工程方法写完整，并在 caveats 写明这不是候选人的个人经历。',
        '2. 口述稿先说「常见做法是……」，把题目问到的机制讲完。简历里确实对得上的经历，再用一两句接上。对不上的项目不要硬塞进来充字数。',
        '3. 项目名、职级、指标和个人动作只能来自简历、岗位描述和笔记。材料里没有的，禁止说成候选人做过。公开资料里的方法只能说成业界或主流做法。',
        '4. talkingPoints 写回答要点。每条用「主流做法：」或「简历经历：」开头。',
        '5. caveats 只写会被追问拆穿的风险，例如某个数字材料里没有。不要用「简历未提及」代替回答，也不要罗列简历没写到的清单。',
        '6. 不要编造公开资料里没有的具体性能数字、产品名或论文结论。',
        '输出一个 JSON 对象，不要 Markdown。字段：talkingPoints 字符串数组，structure 字符串，script 字符串，caveats 字符串数组，followUps 字符串数组。',
        input.action === 'followup' ? '这一次 script 写如何接追问。做法仍按公开资料讲，个人经历仍只能来自材料。followUps 写面试官可能继续问的三个问题。' : '',
        input.action === 'translate' ? 'script 写成英文口述。主流做法可以翻译，个人事实仍只能来自材料。' : '',
        input.action === 'shorter' ? '把上一版口述压短。保留主流做法和已经对上的个人经历，删掉无关项目背景。' : '',
      ]
        .filter(Boolean)
        .join('\n'),
    },
    {
      role: 'user',
      content: `${contextBlock(input.profile)}\n\n${referenceBlock(input.references)}\n\n面试官问题：${input.question}\n\n上一版口述：\n${input.previousScript || '（无）'}`,
    },
  ]
}

export function interviewerMessages(input: {
  profile: Profile
  scenario: string
  persona: string
  difficulty: string
  transcript: { role: 'interviewer' | 'candidate'; content: string }[]
  ready?: { interviewType: string; questions: { chapter: string; question: string; intent: string }[]; reverseQuestions: string[] }
}): LlmMessage[] {
  const dialogue = input.transcript
    .map((item) => `${item.role === 'interviewer' ? '面试官' : '候选人'}：${item.content}`)
    .join('\n')
  const plan = input.ready
    ? [
        `这场使用面试准备题单，类型是${input.ready.interviewType}。`,
        '按题单顺序提问。上一答太空泛时，先追问具体场景、个人动作和结果，不要跳到下一题。',
        '题单里的经历只能来自简历。公开资料里的公司信息不要说成候选人做过的事。',
        'hint 只写回答结构。standard 只在上一答不成立时写参考答法，不要提前写在 hint 里。',
        `题单：\n${input.ready.questions.map((item, index) => `${index + 1}. [${item.chapter}] ${item.question}（意图：${item.intent}）`).join('\n')}`,
        `题单问完后，请候选人反问。可以给的方向：${input.ready.reverseQuestions.join('；') || '问一个能了解团队工作方式的问题'}`,
      ].join('\n')
    : '优先问题要自然嵌进对话，不要说“现在开始优先问题清单”。'
  return [
    {
      role: 'system',
      content: [
        `你是${personaName(input.persona)}，正在进行一场${scenarioName(input.scenario)}，难度${difficultyName(input.difficulty)}。`,
        languageLine(input.profile),
        '一次只问一个问题。reaction 用一两句回应上一答；第一问时 reaction 只做简短开场。question 是下一个问题。hint 写好回答应包含的结构。',
        plan,
        '候选人回答空泛、偏题、答非所问，或把材料里没有的事说成做过时：standard 写一段可以直接说出口的参考答法，大约 120 到 220 字。个人经历和数字只能来自材料；材料对不上时，就讲这道题的主流做法，并写明这是公开做法，不要编成候选人做过。',
        '上一答已经说清场景、本人动作和结果，且没有编造材料外的事实时，standard 为空字符串。',
        '第一问还没有回答时，standard 必须为空字符串。',
        '输出 JSON，不要 Markdown。字段：reaction、question、hint、standard，都是字符串。',
      ].join('\n'),
    },
    { role: 'user', content: `${contextBlock(input.profile)}\n\n已有对话：\n${dialogue || '（尚未开始）'}` },
  ]
}

export function readyMessages(input: {
  profile: Profile
  interviewType: '业务面' | 'HR面'
  references: { title: string; url: string; snippet: string }[]
}): LlmMessage[] {
  const refs = input.references.length
    ? input.references.map((item, index) => `${index + 1}. ${item.title}\n${item.snippet}\n${item.url}`).join('\n\n')
    : '（没有检索到可用页面。不要编造面经或公司数据，searchNote 写明未检索到有效面经。）'
  const mix = input.interviewType === 'HR面'
    ? '题目正好 5 道：1 道业务理解、1 道简历深挖、2 道行为、1 道 Gap。'
    : '题目正好 6 道：2 道业务能力、2 道简历深挖、1 道行为、1 道 Gap。'
  return [
    {
      role: 'system',
      content: [
        '你在为一场模拟面试整理 interview-ready 题单。这是精简版，供当场问答，不是一万五千字的阅读文档。',
        languageLine(input.profile),
        `面试类型：${input.interviewType}。${mix}`,
        '规则：',
        '1. 简历里没有的项目、数字和个人动作，禁止写进题目或自我介绍。',
        '2. 公司产品、融资、用户规模只能源自下面的公开资料。资料里没有就不要写，并在 searchNote 说明未检索到。',
        '3. 只有检索结果里能对上的题目才可以当成面经。单一来源不要写成高频。不要写薪资和面试官隐私。',
        '4. 同一考点只出现一次。业务题不要复述简历项目，简历深挖必须指向简历里的具体经历。',
        '5. intro 是第一人称、大约一分钟、可直接朗读的自我介绍。',
        '6. companyLines 最多 4 句，每句是候选人能直接说出口的公司理解。没有依据就留空数组。',
        '7. 不要输出完整参考答案。intent 只写这题在考察什么。',
        '输出 JSON，不要 Markdown。字段：searchNote 字符串，companyLines 字符串数组，intro 字符串，questions 数组（chapter、question、intent、priority），gaps 字符串数组，reverseQuestions 字符串数组。',
        'chapter 只能是：业务能力、简历深挖、行为面试、Gap。priority 只能是：必背 或 了解。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `${contextBlock(input.profile)}\n\n公开检索：\n${refs}`,
    },
  ]
}

export function reviewMessages(input: {
  profile: Profile
  title: string
  transcript: { role: string; content: string }[]
}): LlmMessage[] {
  const dialogue = input.transcript.map((item) => `${item.role}：${item.content}`).join('\n\n')
  return [
    {
      role: 'system',
      content: [
        '你是面试复盘教练。根据对话给出可执行的评价。',
        languageLine(input.profile),
        '分数是 0 到 100 的整数。评价必须引用候选人原话或指出缺了什么。',
        '如果回答里的数字或项目不在材料中，要明确标成不能在面试中使用。',
        '输出 JSON，不要 Markdown。字段：overall 数字，summary 字符串，dimensions 数组（name、score、comment），strengths 字符串数组，improvements 字符串数组，questions 数组（question、answer、score、feedback、better），nextPractice 字符串。',
        'dimensions 固定六项：结构清晰度、岗位相关性、证据与量化、个人贡献、深度与权衡、表达效率。',
      ].join('\n'),
    },
    { role: 'user', content: `场次：${input.title}\n\n${contextBlock(input.profile)}\n\n对话：\n${dialogue || '（空）'}` },
  ]
}

export function codingMessages(input: { problem: string; language: string; notes: string }): LlmMessage[] {
  return [
    {
      role: 'system',
      content: [
        '你是编程面试教练。先讲清思路，再给代码。',
        '使用简体中文讲解。代码使用候选人指定的语言。C 和 C++ 都要能直接编译；链表题用 struct ListNode，C++ 可以使用标准库。',
        '如果题目来自截图识别，先修正明显的空格和错字，再按修正后的题意讲解。',
        '输出 JSON，不要 Markdown。字段：pattern 字符串，idea 字符串数组，complexity 对象（time、space、why），code 字符串，narration 字符串，pitfalls 字符串数组。',
      ].join('\n'),
    },
    { role: 'user', content: `语言：${input.language}\n备注：${input.notes || '无'}\n\n题目：\n${input.problem}` },
  ]
}

export function gapMessages(profile: Profile): LlmMessage[] {
  return [
    {
      role: 'system',
      content: [
        '对比岗位描述和简历，找出已经能对上的要求，以及简历没有写出的要求。',
        '不要建议候选人编造经历。缺口的建议应是：用已有经历改写对应，或明确这是尚未做过的部分。',
        '输出 JSON，不要 Markdown。字段：covered 字符串数组，missing 字符串数组，suggestions 字符串数组。',
      ].join('\n'),
    },
    { role: 'user', content: contextBlock(profile) },
  ]
}

export function temperatureOf(timing: ResponseTiming) {
  if (timing === 'fast') return 0.2
  if (timing === 'deep') return 0.3
  return 0.4
}

export function coachMaxTokens(length: ResponseLength) {
  if (length === 'short') return 700
  if (length === 'long') return 1400
  return 1000
}
