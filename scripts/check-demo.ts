import { assembleOcr } from '../server/ocr.mjs'
import { parseJsonBlock } from '../src/lib/json.ts'
import { sampleProfile } from '../src/lib/sample.ts'
import { isFiller } from '../src/lib/format.ts'
import { classifyHeard } from '../src/lib/live.ts'
import { textFromPieces } from '../src/lib/pdfText.ts'
import { coachDemo, codingDemo, gapDemo, interviewerDemo, readyDemo, reviewDemo } from '../src/lib/demo.ts'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

const latency = coachDemo({
  profile: sampleProfile,
  question: '讲一次你把核心接口延迟降下来的经历',
  action: 'answer',
  length: 'medium',
})
assert(/480ms|190ms/.test(latency.script), '延迟回答应引用简历中的耗时')
assert(!latency.script.includes('999'), '演示回答不应出现材料外的数字')

const english = coachDemo({
  profile: { ...sampleProfile, language: 'en' },
  question: 'Tell me about latency',
  action: 'translate',
  length: 'short',
})
assert(english.caveats.some((item) => item.includes('英文框架')), '英文模式应说明这是框架而不是编造翻译')

const opening = interviewerDemo({
  profile: sampleProfile,
  scenario: 'behavior',
  persona: 'lead',
  difficulty: 'mid',
  transcript: [],
})
assert(opening.question.includes('两分钟'), '开场应提出行为面试第一问')

const follow = interviewerDemo({
  profile: sampleProfile,
  scenario: 'behavior',
  persona: 'pressure',
  difficulty: 'hard',
  transcript: [
    { role: 'interviewer', content: opening.question },
    { role: 'candidate', content: '我们团队一起优化过，效果还可以。' },
  ],
})
assert(follow.question.includes('具体场景'), '空泛回答应先追问具体场景')
assert(Boolean(follow.standard && follow.standard.includes('林可')), '空泛回答应给出材料范围内的参考答法')
assert(!opening.standard, '开场还没有回答，不应给参考答法')

const weak = reviewDemo({
  profile: sampleProfile,
  messages: [
    { role: 'interviewer', content: '讲一次延迟优化' },
    { role: 'candidate', content: '我们优化了一下，效果还可以。' },
  ],
})
const strong = reviewDemo({
  profile: sampleProfile,
  messages: [
    { role: 'interviewer', content: '讲一次延迟优化' },
    {
      role: 'candidate',
      content:
        '订单创建链路当时 P99 是 480ms。我负责把同步库存校验改成缓存预检加异步确认。结果 P99 降到 190ms。如果重来，我会更早把扣库存和创建订单的边界讲清楚。',
    },
  ],
})
assert(strong.overall > weak.overall, '具体且引用材料的回答应高于空泛回答')

const invented = reviewDemo({
  profile: sampleProfile,
  messages: [
    { role: 'interviewer', content: '结果是什么？' },
    { role: 'candidate', content: '我把接口优化到了 999ms，并且额外节省了 888 万。' },
  ],
})
assert(invented.questions[0]?.feedback.includes('999'), '材料外数字应被标出')

const twoSum = codingDemo('leetcode 1. 两数之和，返回下标', 'TypeScript')
assert(twoSum.confident && twoSum.code.includes('Map'), '两数之和应给出哈希表实现')
const cppSum = codingDemo('leetcode 1. 两数之和，返回下标', 'C++')
assert(cppSum.confident && cppSum.code.includes('unordered_map'), 'C++ 两数之和应给出哈希表')
const cSum = codingDemo('leetcode 1. 两数之和，返回下标', 'C')
assert(cSum.confident && cSum.code.includes('twoSum'), 'C 两数之和应给出实现')
const spokenSum = codingDemo('给定一个整数数组和目标值，返回和为目标值的两个下标', 'TypeScript')
assert(spokenSum.pattern === '哈希表', '口头描述的两数之和也应识别')
const unknown = codingDemo('设计一个支持并发撤回的编辑器操作变换算法', 'Go')
assert(!unknown.confident && unknown.code === '', '未内置题目不应编造代码')

const gap = gapDemo(sampleProfile)
assert(gap.covered.includes('缓存'), '简历和岗位都写了缓存')
assert(gap.missing.includes('降级'), '岗位中的降级不应被算作已覆盖')

assert(isFiller('嗯嗯'), '寒暄应跳过')
assert(!isFiller('为什么离职？'), '短问题不能当成寒暄')
assert(classifyHeard('嗯嗯') === 'skip', '监听时应跳过寒暄')
assert(classifyHeard('讲一次你把核心接口延迟降下来的经历') === 'question', '完整问题应直接作答')
assert(classifyHeard('我当时负责订单创建链路') === 'question', '停顿后的完整一句应直接作答')
assert(classifyHeard('给定一个整数数组和目标值，返回和为目标值的两个下标') === 'coding', '编程题应整理题目和代码')
assert(classifyHeard('请不吝点赞 订阅 转发 打赏支持明镜与点点栏目') === 'skip', '模型幻觉出来的片尾应忽略')
assert(classifyHeard('分发层如何做工具选择。请不吝点赞订阅转发打赏支持明镜与点点栏目') === 'question', '真实问题应保留，片尾幻觉应去掉')
assert(classifyHeard('然后') === 'partial', '没说完的短句应继续听')
assert(assembleOcr('两\t16\t27\n数\t44\t27\n之\t71\t27\n和\t98\t26\n：\t130\t4\nn\t156\t13\nu\t173\t13\nms\t190\t35\ntarget\t235\t76\n') === '两数之和：nums target', '截图文字应拼回中文和英文单词')

const resumeLine = textFromPieces([
  { str: '订单', x: 40, y: 700, width: 24, height: 12 },
  { str: '系统', x: 64, y: 701, width: 24, height: 12 },
  { str: '林可', x: 40, y: 740, width: 24, height: 12 },
  { str: '后端', x: 120, y: 740, width: 24, height: 12 },
])
assert(resumeLine === '林可 后端\n订单系统', 'PDF 文字应按行序拼回')

const parsed = parseJsonBlock<{ ok: boolean }>('说明\n```json\n{"ok":true}\n```')
assert(parsed?.ok === true, '应能从代码块里解析 JSON')

const ready = readyDemo({ profile: sampleProfile, interviewType: '业务面', references: [] })
assert(ready.questions.length === 6, '业务面题单应有 6 题')
assert(ready.questions.some((item) => item.chapter === 'Gap'), '题单应保留 Gap')
assert(ready.companyLines.length === 0, '没有检索结果时不应编造公司事实')
assert(!ready.intro.includes('999'), '自我介绍不应出现材料外的数字')

console.log('demo checks passed')
