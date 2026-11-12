import { scenarioName } from './constants'
import { questionsOf } from './format'
import type { Analysis, CoachAction, CoachCard, CodingResult, GapReport, InterviewerTurn, Profile, ReadyBrief, ResponseLength } from './types'

const BANKS: Record<string, string[]> = {
  behavior: [
    '请用两分钟介绍你现在的工作和你为什么看这个岗位。',
    '讲一件你亲自推动、结果超出原来预期的事。目标、动作和结果分别是什么？',
    '讲一次你和同事或上级意见不一致的经历。你怎么处理的？',
    '讲一次失败、返工或线上问题。你的责任是什么，后来改了什么？',
    '讲一个你放弃过的方案。当时为什么放弃，代价是什么？',
    '如果入职后的 90 天要证明你适合这个岗位，你会拿哪件已有经历来对？',
  ],
  tech: [
    '从你简历里最复杂的一条链路讲起：请求从哪里进来，数据落到哪里？',
    '这条链路最慢或最容易出错的地方在哪？你当时怎么定位？',
    '如果流量变成现在的十倍，你会先改哪一层？依据是什么？',
    '一致性、可用性和延迟里面，你实际做过哪一次取舍？',
    '讲一次发布、回滚或值班。你个人做了什么，不是团队做了什么？',
    '你坚持过哪条工程做法，它曾经让协作变慢吗？',
  ],
  system: [
    '我们先做一道设计题。请先说出你会向我确认的三个需求，先不要画全套架构。',
    '按你刚刚的假设，估算读写量、存储和瓶颈。把假设说出来。',
    '讲核心读写路径。只保留你认为第一版必须有的组件。',
    '热点、失败重试和数据不一致，你会先处理哪一个？为什么？',
    '如果要做多机房或多活，哪些部分你认为现在不该做？',
    '用三句话向非技术负责人解释这个方案的风险。',
  ],
  coding: [
    '接下来按编程题练习。请先复述输入、输出和约束，先不要写代码。',
    '给出一个确定正确的暴力做法，并说明它慢在哪里。',
    '你打算换成哪种模式？为什么不是另一种看起来也行的模式？',
    '时间和空间复杂度是多少？有没有用额外空间换简单实现的版本？',
    '空输入、重复、边界和无解，你的代码会怎样？',
    '如果面试官让你边写边讲，你会按什么顺序写？',
  ],
  phone: [
    '请用一分钟介绍你现在的职责。',
    '你为什么现在看机会？',
    '你为什么看我们这个岗位，而不是一个相近的岗位？',
    '用一件事说明你和岗位要求是匹配的。',
    '你期望的工作内容和可以到岗的时间是什么？',
    '你有什么想问我的？请问一个能帮你判断日常工作的问题。',
  ],
  hr: [
    '你认为自己和这个岗位最对齐的一点是什么？还在补的一点是什么？',
    '遇到需求不清的时候，你通常第一步做什么？举一个真实例子。',
    '讲一次你收到很难听的反馈。你后来改了什么？',
    '未来两到三年，你希望工作内容发生什么变化？',
    '你离开或想离开当前团队的原因是什么？',
    '你怎么判断一个团队值不值得加入？',
  ],
}

const HINTS: Record<string, string> = {
  behavior: '用一件真事讲完背景、你的动作、结果和反思。',
  tech: '从路径讲到数据和故障，标明哪些决定是你做的。',
  system: '先澄清，再估算，再讲你拒绝的复杂度。',
  coding: '先讲正确性，再讲复杂度和边界。',
  phone: '用一句匹配岗位的话，加上一个材料里已有的证据。',
  hr: '给出真实原因和一次具体处理，避免空泛表态。',
}

const STRUCTURES: Record<string, string> = {
  intro: '现在的角色 → 一件最相关的事 → 为什么看这个岗位',
  conflict: '分歧是什么 → 我做了什么 → 结果 → 关系后来怎样',
  failure: '发生了什么 → 我的责任 → 怎么止损 → 机制改了什么',
  project: '目标 → 我的关键动作 → 材料里已有的结果 → 取舍',
  design: '澄清 → 估算 → 第一版方案 → 权衡 → 故障',
  coding: '复述题目 → 暴力解 → 优化模式 → 复杂度 → 边界',
  motivation: '真实原因 → 和岗位对得上的证据 → 还没覆盖的部分',
  general: '结论 → 材料中的证据 → 这件事的边界',
}

function kindOf(question: string) {
  if (/自我介绍|介绍一下|为什么看|为什么选择|为什么是/.test(question)) return 'intro'
  if (/冲突|分歧|意见不|说服|跨团队/.test(question)) return 'conflict'
  if (/失败|事故|故障|超卖|线上|复盘/.test(question)) return 'failure'
  if (/设计|架构|一致性|十倍|容量/.test(question)) return 'design'
  if (/算法|复杂度|代码|编程|题/.test(question)) return 'coding'
  if (/离职|规划|优势|缺点|加班|职业/.test(question)) return 'motivation'
  if (/项目|延迟|优化|负责|经历/.test(question)) return 'project'
  return 'general'
}

function linesOf(resume: string) {
  return resume
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 6)
}

function relevantLines(question: string, resume: string) {
  const tokens = question
    .split(/[^\u4e00-\u9fa5a-zA-Z0-9]+/)
    .filter((token) => token.length >= 2)
    .slice(0, 12)
  const ranked = linesOf(resume)
    .map((line) => ({
      line,
      score: tokens.reduce((sum, token) => sum + (line.toLowerCase().includes(token.toLowerCase()) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score)
  const matched = ranked.filter((item) => item.score > 0).slice(0, 3)
  return (matched.length ? matched : ranked.slice(0, 2)).map((item) => item.line)
}

function emptyCoach(): CoachCard {
  return {
    talkingPoints: ['先把真实项目写进材料，再生成口述稿。'],
    structure: '没有简历时不生成经历叙述',
    script: '我还不能替你回答。材料里没有可引用的经历，请先写下你真正做过的事。',
    caveats: ['没有材料时不要编造项目、职级或指标。'],
    followUps: [],
  }
}

export function coachDemo(input: {
  profile: Profile
  question: string
  action: CoachAction
  length: ResponseLength
  previousScript?: string
}): CoachCard {
  if (input.profile.resume.trim().length < 40) return emptyCoach()
  const lines = relevantLines(input.question, input.profile.resume)
  const kind = kindOf(input.question)
  const caveats = [
    '只讲述材料里已经写明的事实。',
    input.profile.language === 'en' ? '演示引擎这版使用中文。需要英文口述时，请配置模型。' : '',
  ].filter(Boolean)
  if (input.action === 'translate') {
    return {
      talkingPoints: ['用英文保持同样的事实顺序', '数字只填材料里出现过的', '没写过的结果就不要译出一个新数字'],
      structure: 'Role → what I personally did → result already written in the resume → tradeoff',
      script: `I worked on ___, which is already described in my resume. I personally owned ___. The result I can cite is: "${lines[0] || 'a result written in the resume'}". I would not add a metric that is not in my materials.`,
      caveats: ['这是英文框架。下划线处只填简历原话，演示引擎不整段翻译，避免把经历译错。'],
      followUps: ['Which part did you personally decide?', 'What did you choose not to do?'],
    }
  }
  if (input.action === 'shorter') {
    const base = input.previousScript?.trim() || lines[0] || ''
    return {
      talkingPoints: ['先说结论', '只留一个动作和一个结果', '反思留到被追问时再说'],
      structure: '结论 → 一个动作 → 一个已有结果',
      script: `我先说结论：这题我用简历里的这段经历回答。${base.slice(0, 90)}细节等你追问再展开。`,
      caveats,
      followUps: ['你亲自做的决定是哪一个？', '如果重来，你会改哪一步？'],
    }
  }
  if (input.action === 'followup') {
    return {
      talkingPoints: ['先承认上一答缺的那一层', '补个人动作', '结果只重复材料里有的'],
      structure: '上一答缺什么 → 补一个具体镜头 → 停下来等追问',
      script: `上一版如果还停留在团队层面，下一句就改成我本人做的动作。可以接：${lines[0] || '用材料里的一句原话作为证据。'}然后停住，把复盘留给面试官追问。`,
      caveats,
      followUps: ['这件事里哪个决定是你做的？', '有没有你反对但最后没被采纳的方案？', '结果里的数字，口径是什么？'],
    }
  }
  const limit = input.length === 'short' ? 1 : input.length === 'long' ? 3 : 2
  const evidence = lines.slice(0, limit).join(' ')
  const role = input.profile.targetRole || '这个岗位'
  const script =
    kind === 'intro'
      ? `我现在的工作可以先用材料里的这句话说明：${lines[0] || '（材料里还没有一句职责描述）'}看${role}，是因为${input.profile.objective || '我想把已有经历和岗位要求对齐'}。我今天会重点讲一件我亲自处理过的事，而不是把团队成果说成我的。`
      : `针对这个问题，我用材料里已经写过的经历来答。${evidence}我会把“我做的决定”和“团队一起做的部分”分开说。材料里没有的指标，这题我就不报。`
  return {
    talkingPoints: lines.length ? lines : ['材料里没有和这题直接重合的句子，先讲最接近的一段职责。'],
    structure: STRUCTURES[kind],
    script,
    caveats,
    followUps: ['哪个动作是你亲自做的？', '如果拿掉材料里的那个结果，你还能怎么说明影响？'],
  }
}

function thresholdOf(difficulty: string) {
  if (difficulty === 'hard') return 80
  if (difficulty === 'easy') return 28
  return 48
}

function reactionOf(persona: string, weak: boolean) {
  const table: Record<string, [string, string]> = {
    pressure: ['这版我听不出是你做的。', '先别急着下结论，我想听你放弃过的方案。'],
    hr: ['我听懂你的态度了，还缺一件具体的事。', '这部分清楚。我们再要一个别人能核对的结果。'],
    architect: ['约束和取舍都还没出现。', '方案听到了。我想知道你拒绝了什么。'],
    lead: ['先不要概括团队，讲你自己的动作。', '职责我听到了。下一个问题看细节。'],
  }
  const pair = table[persona] || table.lead
  return weak ? pair[0] : pair[1]
}

export function readyDemo(input: {
  profile: Profile
  interviewType: '业务面' | 'HR面'
  references: { title: string; snippet: string; url: string }[]
}): ReadyBrief {
  const name = input.profile.name || '我'
  const role = input.profile.targetRole || '这个岗位'
  const resumeLine = input.profile.resume.split('\n').map((item) => item.trim()).find((item) => item.length > 12) || ''
  const priority = questionsOf(input.profile)
  const business = input.interviewType === 'HR面'
    ? [{ chapter: '业务能力', question: `你怎么理解${role}在团队里要解决的问题？`, intent: '看候选人是否读过岗位描述', priority: '必背' }]
    : [
        { chapter: '业务能力', question: `如果让你做${role}，你会先确认哪三个成功标准？`, intent: '看是否能把岗位描述说成可执行的标准', priority: '必背' },
        { chapter: '业务能力', question: '这个岗位最容易做错的取舍是什么？你的依据是岗位描述里的哪一句？', intent: '看是否只复述关键词', priority: '了解' },
      ]
  const resumeQuestion = resumeLine
    ? { chapter: '简历深挖', question: `请展开简历里的这件事：${resumeLine.slice(0, 48)}。你本人做了什么？`, intent: '只追问简历里写过的事实', priority: '必背' }
    : { chapter: '简历深挖', question: '请选一段简历里你亲手做过的项目，讲清约束、动作和结果。', intent: '确认经历真实存在', priority: '必背' }
  const behavior = input.interviewType === 'HR面'
    ? [
        { chapter: '行为面试', question: '你为什么现在看这个机会？请只用已经发生的事实。', intent: '看动机是否具体', priority: '必背' },
        { chapter: '行为面试', question: '讲一次你和同事意见不一致的经历。你做了什么，后来怎样？', intent: '看协作，不展开技术方案', priority: '了解' },
      ]
    : [{ chapter: '行为面试', question: '讲一次返工或线上问题。你的责任是什么，后来改了什么？', intent: '看是否把团队的事说成自己的', priority: '了解' }]
  const gap = { chapter: 'Gap', question: '岗位描述里有哪一条，是你简历没有直接写过的？你准备怎么说明？', intent: '只承认真实差距，不补造经历', priority: '必背' }
  const priorityQuestion = priority[0]
    ? { chapter: '简历深挖', question: /[？?]$/.test(priority[0]) ? priority[0] : `${priority[0]}？`, intent: '这是材料里的优先问题', priority: '必背' }
    : null
  const behaviorKept = priorityQuestion && input.interviewType === 'HR面' ? behavior.slice(0, 1) : behavior
  const questions = [...business, resumeQuestion, ...(priorityQuestion ? [priorityQuestion] : []), ...behaviorKept, gap].slice(0, input.interviewType === 'HR面' ? 5 : 6)
  return {
    interviewType: input.interviewType,
    searchNote: input.references.length
      ? `检索到 ${input.references.length} 条公开页面。演示引擎不会把这些页面改写成你的经历。`
      : '未检索到有效面经，题目只根据简历和岗位描述。',
    companyLines: [],
    intro: `我是${name}，正在准备${role}。${resumeLine ? `我准备展开的是简历里的这一段：${resumeLine.slice(0, 80)}。` : '简历还比较短，我会只讲已经写下来的内容。'}没有写进简历的数字，我不会在面试里临时补充。`,
    questions,
    gaps: ['对照岗位描述，把简历里没有的要求当成尚未覆盖的部分。'],
    reverseQuestions: ['团队怎样判断一个项目做完了？', '新人前三个月最常被纠正的判断是什么？'],
    sources: input.references.map((item) => ({ title: item.title, url: item.url })),
    source: 'demo',
  }
}

function standardAnswer(profile: Profile, question: string) {
  const resume = profile.resume.replace(/\s+/g, '')
  if (/延迟|接口|性能|P99/.test(question) && resume.includes('480ms')) {
    return '我负责订单创建链路。核心接口 P99 从 480ms 降到 190ms。我把同步库存校验改成缓存预检加异步确认，热点 SKU 用本地缓存和单飞，慢 SQL 从 12 条降到 2 条。这些都写在简历里，没有写过的数字我不补充。'
  }
  const line = profile.resume.split('\n').map((item) => item.trim()).find((item) => item.length > 16) || ''
  if (line) return `这题要讲清场景、我本人的动作和结果。按简历可以这样说：${line.slice(0, 90)}。没有写进材料的项目和数字，不要补成已经做过。`
  return '先说当时的约束，再说你亲手做的一个动作，最后只讲材料里写过的结果。材料里没有的项目，就说明这是思路，不要说成做过。'
}

export function interviewerDemo(input: {
  profile: Profile
  scenario: string
  persona: string
  difficulty: string
  transcript: { role: 'interviewer' | 'candidate'; content: string }[]
  ready?: { questions: { question: string; intent: string }[]; reverseQuestions: string[] }
}): InterviewerTurn {
  const bank = input.ready?.questions.map((item) => item.question).filter(Boolean) || BANKS[input.scenario] || BANKS.behavior
  const questions = input.transcript.filter((item) => item.role === 'interviewer')
  const answers = input.transcript.filter((item) => item.role === 'candidate')
  const lastAnswer = answers.at(-1)?.content || ''
  const lastQuestion = questions.at(-1)?.content || ''
  const planned = input.ready?.questions.find((item) => item.question === lastQuestion)
  const hint = planned?.intent || HINTS[input.scenario] || HINTS.behavior
  if (!lastAnswer) {
    const who = input.profile.name ? `${input.profile.name}，` : ''
    const target = input.profile.targetRole ? `目标岗位是${input.profile.targetRole}。` : ''
    return {
      reaction: `${who}这场是${scenarioName(input.scenario)}。${target}一次只问一个问题，请只讲你真正做过的事。`,
      question: bank[0],
      hint,
    }
  }
  const weak = lastAnswer.trim().length < thresholdOf(input.difficulty)
  if (weak && !lastQuestion.includes('具体场景')) {
    return {
      reaction: reactionOf(input.persona, true),
      question: '请补充一个具体场景：当时的约束是什么，你本人做了什么，结果如何？',
      hint: '结果只使用材料里写过的内容。没有数字就讲前后变化，不要临时造一个指标。',
      standard: standardAnswer(input.profile, lastQuestion),
    }
  }
  if (lastQuestion.includes('想问我的') || lastQuestion.includes('再练一题')) {
    return {
      reaction: '可以在这里结束。复盘会按你刚才的原话给建议。',
      question: '如果你还想再练一题，就讲一个岗位最看重、但你还没展开的经历。',
      hint: '没有新的真实经历就结束。不要为了把场次填满而编项目。',
    }
  }
  const progress = questions.filter((item) => !item.content.includes('具体场景')).length
  if (progress >= bank.length) {
    const ask = input.ready?.reverseQuestions[0]
    return {
      reaction: input.ready ? '准备里的题已经问完。' : '主要问题已经过了一轮。',
      question: ask
        ? `换你来问。可以用自己的话，沿着这个方向：${ask}`
        : '你有什么想问我的？请结合这个岗位，问一个能帮你判断团队工作方式的问题。',
      hint: '反问用来了解团队怎么做事。薪资留到后面。',
    }
  }
  const asked = questions.map((item) => item.content).join('\n')
  const priority = questionsOf(input.profile).find((item) => !asked.includes(item))
  if (!input.ready && progress === 2 && priority) {
    const question = /[？?]$/.test(priority) ? priority : `${priority}？`
    return {
      reaction: `${reactionOf(input.persona, false)}这题和你准备的岗位更相关。`,
      question,
      hint,
    }
  }
  return {
    reaction: reactionOf(input.persona, false),
    question: bank[Math.min(progress, bank.length - 1)],
    hint,
  }
}

function numbersOutsideResume(answer: string, resume: string) {
  const nums = answer.match(/\d+(?:\.\d+)?/g) || []
  return [...new Set(nums.filter((item) => item.length > 1 && !resume.includes(item)))]
}

function scoreAnswer(answer: string, resume: string) {
  const text = answer.trim()
  let score = 58
  const notes: string[] = []
  if (text.length >= 80) score += 8
  if (text.length >= 160) score += 4
  if (text.length < 40) {
    score -= 18
    notes.push('太短，听不出场景。')
  }
  if (/\d/.test(text)) notes.push('出现了数字，请确认它写在材料里。')
  else notes.push('没有量化结果。只补充材料里已经有的数字。')
  if (/我(负责|推动|决定|设计|排查|修复|主导|把)/.test(text)) score += 8
  else notes.push('个人动作不够清楚，少用“我们”概括。')
  if (/(结果|最终|因此|之后|降到|没有再)/.test(text)) score += 6
  const invented = numbersOutsideResume(text, resume)
  if (invented.length) {
    score -= 14
    notes.push(`这些数字材料里没有：${invented.slice(0, 3).join('、')}。面试时不要使用。`)
  } else if (/\d/.test(text)) score += 6
  return {
    score: Math.max(32, Math.min(96, score)),
    feedback: notes.join(''),
    better: invented.length
      ? '删掉材料之外的数字，按背景一句、我的动作两句、结果一句重说。'
      : '把最有区分度的动作放到第二句，结果紧跟在后面。',
  }
}

export function reviewDemo(input: {
  profile: Profile
  messages: { role: string; content: string }[]
  prepared?: boolean
}): Analysis {
  const pairs: { question: string; answer: string }[] = []
  for (let i = 0; i < input.messages.length; i += 1) {
    const message = input.messages[i]
    if (message.role !== 'interviewer') continue
    const answer = input.messages.slice(i + 1).find((item) => item.role === 'candidate' || (input.prepared && item.role === 'coach'))
    if (answer) pairs.push({ question: message.content, answer: answer.content })
  }
  if (!pairs.length) {
    return {
      overall: 0,
      summary: '还没有足够的一问一答，暂时不能评分。',
      dimensions: [],
      strengths: [],
      improvements: ['先完成至少一题，再生成复盘。'],
      questions: [],
      nextPractice: '用语音完整回答一个问题，再回来看复盘。',
      source: 'demo',
    }
  }
  const resume = input.profile.resume
  const jd = `${input.profile.jobDescription} ${input.profile.targetRole}`
  const scored = pairs.map((pair) => ({ ...pair, ...scoreAnswer(pair.answer, resume) }))
  const avg = Math.round(scored.reduce((sum, item) => sum + item.score, 0) / scored.length)
  const personal = scored.filter((item) => /我(负责|推动|决定|设计|排查|修复|主导|把)/.test(item.answer)).length / scored.length
  const evidence = scored.filter((item) => /\d/.test(item.answer) && numbersOutsideResume(item.answer, resume).length === 0).length / scored.length
  const structure = scored.filter((item) => item.answer.trim().length >= 70).length / scored.length
  const roleTokens = jd
    .split(/[^\u4e00-\u9fa5a-zA-Z0-9]+/)
    .filter((token) => token.length >= 2)
    .slice(0, 12)
  const relevant = roleTokens.length
    ? scored.filter((item) => roleTokens.some((token) => item.answer.toLowerCase().includes(token.toLowerCase()))).length / scored.length
    : 0.6
  const depth = scored.filter((item) => /(取舍|放弃|如果重来|复盘|边界)/.test(item.answer)).length / scored.length
  const efficiency = scored.filter((item) => item.answer.trim().length >= 50 && item.answer.trim().length <= 360).length / scored.length
  const dimensions = [
    { name: '结构清晰度', score: Math.round(40 + structure * 55), comment: structure > 0.5 ? '多数回答有足够长度展开一件事。' : '好几题还没把一件事讲完。' },
    { name: '岗位相关性', score: Math.round(45 + Math.min(1, relevant) * 45), comment: '对照岗位用词，看回答有没有落到要求上。' },
    { name: '证据与量化', score: Math.round(35 + evidence * 60), comment: evidence > 0.4 ? '使用了材料里能找到的数字。' : '结果缺少材料中已有的证据。' },
    { name: '个人贡献', score: Math.round(35 + personal * 60), comment: personal > 0.4 ? '能听到你本人的动作。' : '团队词太多，归属还不清楚。' },
    { name: '深度与权衡', score: Math.round(40 + depth * 50), comment: depth > 0.3 ? '提到了取舍或复盘。' : '还少讲你放弃了什么。' },
    { name: '表达效率', score: Math.round(45 + efficiency * 45), comment: '合适的长度大约是一分钟，太短或太长都会失分。' },
  ]
  const strengths = dimensions.filter((item) => item.score >= 75).map((item) => `${item.name}：${item.comment}`)
  const improvements = dimensions.filter((item) => item.score < 70).map((item) => `${item.name}：${item.comment}`)
  const weakest = [...dimensions].sort((a, b) => a.score - b.score)[0]
  return {
    overall: avg,
    summary: input.prepared
      ? `这是对准备稿的规则评分，平均 ${avg} 分。它还不是你开口之后的表现。`
      : `按回答的具体程度、个人动作和材料内证据，这场平均 ${avg} 分。`,
    dimensions,
    strengths: strengths.length ? strengths : ['已经开始用完整句子回答，可以继续把结果提前。'],
    improvements: improvements.length ? improvements : ['维持现在的具体程度，并主动补一句取舍。'],
    questions: scored,
    nextPractice: `下一次只练「${weakest.name}」。用同一段真实经历重说一题，不要换一个新故事。`,
    source: 'demo',
  }
}

const CLASSICS: {
  re: RegExp
  pattern: string
  idea: string[]
  time: string
  space: string
  why: string
  narration: string
  pitfalls: string[]
  ts: string
  py: string
  c: string
  cpp: string
}[] = [
  {
    re: /两数之和|two\s*sum|和为目标值的两个/i,
    pattern: '哈希表',
    idea: ['遍历数组时，用目标值减去当前值得到需要的另一个数。', '用哈希表保存已经看过的值和下标。', '命中则立刻返回两个下标，否则把当前值放进表。'],
    time: 'O(n)',
    space: 'O(n)',
    why: '每个元素最多进表一次，查找期望是常数时间。',
    narration: '我先说暴力是两层循环。优化是一遍扫描加哈希表，用空间换第二次查找。返回的是下标，不是数值本身。',
    pitfalls: ['题目要的是下标时，表里存值到下标。', '同一个元素不能用两次，所以先查再放入。'],
    ts: `function twoSum(nums: number[], target: number): number[] {
  const seen = new Map<number, number>()
  for (let i = 0; i < nums.length; i += 1) {
    const need = target - nums[i]
    if (seen.has(need)) return [seen.get(need) as number, i]
    seen.set(nums[i], i)
  }
  return []
}`,
    py: `def two_sum(nums: list[int], target: int) -> list[int]:
    seen = {}
    for i, num in enumerate(nums):
        need = target - num
        if need in seen:
            return [seen[need], i]
        seen[num] = i
    return []`,
    c: `#include <stdlib.h>

typedef struct { int key; int idx; int used; } Entry;

static int slot_for(int key, int cap) {
    unsigned int mixed = (unsigned int)key * 2654435761u;
    return (int)(mixed % (unsigned int)cap);
}

int *twoSum(const int *nums, int n, int target, int *returnSize) {
    int cap = n * 2 + 1;
    Entry *table = calloc((size_t)cap, sizeof(Entry));
    int *ans = malloc(2 * sizeof(int));
    *returnSize = 0;
    if (!table || !ans) {
        free(table);
        free(ans);
        return NULL;
    }
    for (int i = 0; i < n; ++i) {
        int need = target - nums[i];
        for (int k = slot_for(need, cap); table[k].used; k = (k + 1) % cap) {
            if (table[k].key == need) {
                ans[0] = table[k].idx;
                ans[1] = i;
                *returnSize = 2;
                free(table);
                return ans;
            }
        }
        int slot = slot_for(nums[i], cap);
        while (table[slot].used) slot = (slot + 1) % cap;
        table[slot].used = 1;
        table[slot].key = nums[i];
        table[slot].idx = i;
    }
    free(table);
    free(ans);
    return NULL;
}`,
    cpp: `#include <unordered_map>
#include <vector>
using namespace std;

vector<int> twoSum(vector<int>& nums, int target) {
    unordered_map<int, int> seen;
    for (int i = 0; i < (int)nums.size(); ++i) {
        int need = target - nums[i];
        auto it = seen.find(need);
        if (it != seen.end()) return {it->second, i};
        seen[nums[i]] = i;
    }
    return {};
}`,
  },
  {
    re: /有效的括号|有效括号|valid parentheses/i,
    pattern: '栈',
    idea: ['左括号入栈。', '遇到右括号时，栈顶必须是对应的左括号。', '扫描结束时栈必须为空。'],
    time: 'O(n)',
    space: 'O(n)',
    why: '每个括号最多入栈出栈一次。',
    narration: '这题用栈保存还没闭合的左括号。右括号如果对不上，立刻失败。最后栈空才是整段有效。',
    pitfalls: ['空字符串按题目约定通常是有效的。', '只判断数量相等不够，顺序也必须正确。'],
    ts: `function isValid(s: string): boolean {
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' }
  const stack: string[] = []
  for (const ch of s) {
    if (ch === '(' || ch === '[' || ch === '{') stack.push(ch)
    else if (stack.pop() !== pairs[ch]) return false
  }
  return stack.length === 0
}`,
    py: `def is_valid(s: str) -> bool:
    pairs = {')': '(', ']': '[', '}': '{'}
    stack = []
    for ch in s:
        if ch in '([{':
            stack.append(ch)
        elif not stack or stack.pop() != pairs.get(ch):
            return False
    return not stack`,
    c: `#include <stdbool.h>

bool isValid(const char *s) {
    char stack[10001];
    int top = 0;
    for (int i = 0; s[i]; ++i) {
        char ch = s[i];
        if (ch == '(' || ch == '[' || ch == '{') {
            stack[top++] = ch;
            continue;
        }
        if (top == 0) return false;
        char open = stack[--top];
        if ((ch == ')' && open != '(') || (ch == ']' && open != '[') || (ch == '}' && open != '{')) return false;
    }
    return top == 0;
}`,
    cpp: `#include <stack>
#include <string>
#include <unordered_map>
using namespace std;

bool isValid(string s) {
    unordered_map<char, char> pairs = {{')', '('}, {']', '['}, {'}', '{'}};
    stack<char> open;
    for (char ch : s) {
        if (ch == '(' || ch == '[' || ch == '{') open.push(ch);
        else if (open.empty() || open.top() != pairs[ch]) return false;
        else open.pop();
    }
    return open.empty();
}`,
  },
  {
    re: /无重复字符的最长子串|longest substring without repeating/i,
    pattern: '滑动窗口',
    idea: ['左右指针维护一个没有重复字符的窗口。', '用哈希表记录字符最近一次出现的位置。', '重复时把左指针移到上次位置的下一位，过程中更新最大长度。'],
    time: 'O(n)',
    space: 'O(k)',
    why: '左右指针都只向前，k 是字符集大小。',
    narration: '我不会为每个起点重新扫描。窗口右端一直扩展，左端只在出现重复时向前跳。',
    pitfalls: ['左指针不能回退。', '更新下标要在计算长度之后还是之前，要和实现保持一致。'],
    ts: `function lengthOfLongestSubstring(s: string): number {
  const last = new Map<string, number>()
  let left = 0
  let best = 0
  for (let right = 0; right < s.length; right += 1) {
    const prev = last.get(s[right])
    if (prev !== undefined && prev >= left) left = prev + 1
    last.set(s[right], right)
    best = Math.max(best, right - left + 1)
  }
  return best
}`,
    py: `def length_of_longest_substring(s: str) -> int:
    last = {}
    left = best = 0
    for right, ch in enumerate(s):
        if ch in last and last[ch] >= left:
            left = last[ch] + 1
        last[ch] = right
        best = max(best, right - left + 1)
    return best`,
    c: `int lengthOfLongestSubstring(const char *s) {
    int last[256];
    for (int i = 0; i < 256; ++i) last[i] = -1;
    int left = 0, best = 0;
    for (int right = 0; s[right]; ++right) {
        unsigned char ch = (unsigned char)s[right];
        if (last[ch] >= left) left = last[ch] + 1;
        last[ch] = right;
        int len = right - left + 1;
        if (len > best) best = len;
    }
    return best;
}`,
    cpp: `#include <algorithm>
#include <string>
#include <unordered_map>
using namespace std;

int lengthOfLongestSubstring(string s) {
    unordered_map<char, int> last;
    int left = 0, best = 0;
    for (int right = 0; right < (int)s.size(); ++right) {
        auto it = last.find(s[right]);
        if (it != last.end() && it->second >= left) left = it->second + 1;
        last[s[right]] = right;
        best = max(best, right - left + 1);
    }
    return best;
}`,
  },
  {
    re: /反转链表|reverse linked list/i,
    pattern: '迭代三指针',
    idea: ['保存下一个节点，避免改写 next 后丢失后半段。', '把当前节点的 next 指向前一个节点。', '前驱和当前一起前进，最后返回新的头节点。'],
    time: 'O(n)',
    space: 'O(1)',
    why: '每个节点只改一次指针，只使用常数额外空间。',
    narration: '我会先讲空链表和单节点不用特殊分支也能工作。然后强调改 next 之前必须记住原来的下一个节点。',
    pitfalls: ['先断开 next 会丢失后面的节点。', '返回的是原来的尾节点，不是原头节点。'],
    ts: `type ListNode = { val: number; next: ListNode | null } | null

function reverseList(head: ListNode): ListNode {
  let prev: ListNode = null
  let current = head
  while (current) {
    const next = current.next
    current.next = prev
    prev = current
    current = next
  }
  return prev
}`,
    py: `def reverse_list(head):
    prev = None
    current = head
    while current:
        nxt = current.next
        current.next = prev
        prev = current
        current = nxt
    return prev`,
    c: `struct ListNode {
    int val;
    struct ListNode *next;
};

struct ListNode *reverseList(struct ListNode *head) {
    struct ListNode *prev = 0;
    struct ListNode *current = head;
    while (current) {
        struct ListNode *next = current->next;
        current->next = prev;
        prev = current;
        current = next;
    }
    return prev;
}`,
    cpp: `struct ListNode {
    int val;
    ListNode *next;
};

ListNode *reverseList(ListNode *head) {
    ListNode *prev = nullptr;
    ListNode *current = head;
    while (current) {
        ListNode *next = current->next;
        current->next = prev;
        prev = current;
        current = next;
    }
    return prev;
}`,
  },
  {
    re: /二分查找|binary search/i,
    pattern: '二分查找',
    idea: ['只适用于有序序列。', '用左右闭区间，取中点后比较目标。', '每次丢掉不可能的一半，直到区间为空。'],
    time: 'O(log n)',
    space: 'O(1)',
    why: '每次搜索范围减半。',
    narration: '我先确认数组有序。然后说明循环不变式：如果目标存在，它一定还在左右闭区间里。',
    pitfalls: ['中点用 left + (right - left) / 2，避免溢出。', '要事先说清找不到时返回什么。'],
    ts: `function binarySearch(nums: number[], target: number): number {
  let left = 0
  let right = nums.length - 1
  while (left <= right) {
    const mid = left + Math.floor((right - left) / 2)
    if (nums[mid] === target) return mid
    if (nums[mid] < target) left = mid + 1
    else right = mid - 1
  }
  return -1
}`,
    py: `def binary_search(nums: list[int], target: int) -> int:
    left, right = 0, len(nums) - 1
    while left <= right:
        mid = left + (right - left) // 2
        if nums[mid] == target:
            return mid
        if nums[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1`,
    c: `int binarySearch(const int *nums, int n, int target) {
    int left = 0;
    int right = n - 1;
    while (left <= right) {
        int mid = left + (right - left) / 2;
        if (nums[mid] == target) return mid;
        if (nums[mid] < target) left = mid + 1;
        else right = mid - 1;
    }
    return -1;
}`,
    cpp: `#include <vector>
using namespace std;

int binarySearch(const vector<int>& nums, int target) {
    int left = 0;
    int right = (int)nums.size() - 1;
    while (left <= right) {
        int mid = left + (right - left) / 2;
        if (nums[mid] == target) return mid;
        if (nums[mid] < target) left = mid + 1;
        else right = mid - 1;
    }
    return -1;
}`,
  },
]

export function codingDemo(problem: string, language: string): CodingResult {
  const found = CLASSICS.find((item) => item.re.test(problem))
  if (!found) {
    return {
      pattern: '先识别模式，再写代码',
      idea: [
        '用自己的话复述输入、输出和约束。',
        '先给一个确定正确的暴力解，并说明它为什么对。',
        '指出瓶颈，再选择哈希、双指针、滑动窗口、栈、二分、搜索或动态规划。',
        '核对空输入、重复、无解和规模上限。',
        '最后讲复杂度，并用一个三行以内的例子演算。',
      ],
      complexity: {
        time: '先不确定',
        space: '先不确定',
        why: '演示引擎不会为没有内置的题目编造复杂度和代码。',
      },
      code: '',
      narration: '配置模型后，可以按这道题生成具体思路和代码。现在先把上面五步讲顺。',
      pitfalls: ['题目信息不完整时先问约束。', '不要背一个和题目无关的模板。'],
      confident: false,
      source: 'demo',
    }
  }
  const code =
    language === 'Python' ? found.py : language === 'C' ? found.c : language === 'C++' ? found.cpp : language === 'TypeScript' ? found.ts : ''
  return {
    pattern: found.pattern,
    idea: found.idea,
    complexity: { time: found.time, space: found.space, why: found.why },
    code,
    narration: found.narration,
    pitfalls: code ? found.pitfalls : [`演示引擎没有内置 ${language} 代码，避免给出编译不过的实现。思路仍然是${found.pattern}。`, ...found.pitfalls],
    confident: Boolean(code),
    source: 'demo',
  }
}

const TERMS = [
  'Java',
  'Go',
  'Python',
  'MySQL',
  'Redis',
  'Kafka',
  'Kubernetes',
  '高并发',
  '分布式',
  '微服务',
  '缓存',
  '消息队列',
  '稳定性',
  '库存',
  '一致性',
  '容量',
  '降级',
  '监控',
  '排障',
  '跨团队',
  '大促',
]

export function gapDemo(profile: Profile): GapReport {
  const jd = profile.jobDescription.toLowerCase()
  const resume = profile.resume.toLowerCase()
  const present = TERMS.filter((term) => jd.includes(term.toLowerCase()))
  const covered = present.filter((term) => resume.includes(term.toLowerCase()))
  const missing = present.filter((term) => !resume.includes(term.toLowerCase()))
  const suggestions = missing.map(
    (term) => `岗位写了「${term}」。先看简历里有没有同一件事的另一种说法；没有就把它当作尚未覆盖的部分，不要补一句没做过的经历。`,
  )
  if (missing.includes('消息队列') && /kafka/i.test(profile.resume)) {
    suggestions.unshift('简历里的 Kafka 可以对应岗位里的消息队列。口述时把两者说成一件事，不必再编一个新组件。')
  }
  if (missing.includes('跨团队') && /三个组|协作|对齐/.test(profile.resume)) {
    suggestions.unshift('简历里已经有跨组协作的句子。面试时直接把它对应到“跨团队”，不要另找一个故事。')
  }
  if (!present.length) {
    suggestions.push('岗位描述里没有识别出内置技能词。把要求写成具体技术或能力后，对照会更有用。配置模型后可以按句子判断。')
  }
  return { covered, missing, suggestions, source: 'demo' }
}
