import { useMemo, useState } from 'react'
import { AnalysisView, CoachView } from '../components/ui'
import { useApp } from '../lib/appContext'
import { coachDemo, interviewerDemo, reviewDemo } from '../lib/demo'
import { sampleProfile } from '../lib/sample'

const lessons = [
  {
    no: '01',
    title: '快速开始',
    body: '先在材料页写下简历和岗位。没有材料时，用示例候选人走完一轮，熟悉提问、回答和复盘的位置。',
  },
  {
    no: '02',
    title: '模型设置',
    body: '不填密钥时使用演示引擎，适合检查流程。要针对你的简历生成口述稿时，在模型设置里填写兼容 OpenAI 的地址、密钥和模型名。密钥只留在这台浏览器。',
  },
  {
    no: '03',
    title: '模拟面试',
    body: '选择行为、技术、系统设计、编程讲解、电话筛选或 HR 面。可以打开面试准备：先查同公司同岗位的公开面经，再按简历排出题单。回答太短时，面试官会先追问具体场景。',
  },
  {
    no: '04',
    title: '回答辅导',
    body: '打开实时监听，麦克风持续听面试官。一句话落下后自动给出回答；内容像编程题时，会整理题目、思路和代码。也可以把题目粘贴进来。寒暄会被跳过。',
  },
  {
    no: '05',
    title: '历史复盘',
    body: '每场练习都会留下概览、对话和复盘。可以搜索、继续未结束的场次、重新评分或导出 JSON。记录最多保留最近 100 场。',
  },
  {
    no: '06',
    title: '题目分析',
    body: '编程题可以把文字粘贴到编程讲解，也可以直接贴截图。截图会先识别成题目，再给思路和代码。经典题会给可核对的代码；没内置的题目只给讲解步骤。岗位和简历的差距在材料页用“对照岗位”查看。',
  },
]

const weakAnswer = '我们团队一起把订单系统优化了一下，效果还可以，主要是大家协作完成的。'
const strongAnswer = '订单创建链路当时 P99 是 480ms。我负责把同步库存校验改成缓存预检加异步确认，热点 SKU 用本地缓存和单飞。结果 P99 降到 190ms，慢 SQL 从 12 条降到 2 条。如果重来，我会更早说明扣库存和创建订单为什么不能分开。'

export function LearnPage() {
  const { go } = useApp()
  const [step, setStep] = useState(0)
  const demo = useMemo(() => {
    const opening = interviewerDemo({ profile: sampleProfile, scenario: 'tech', persona: 'lead', difficulty: 'mid', transcript: [] })
    const card = coachDemo({ profile: sampleProfile, question: opening.question, action: 'answer', length: 'medium' })
    const weak = reviewDemo({
      profile: sampleProfile,
      messages: [
        { role: 'interviewer', content: opening.question },
        { role: 'candidate', content: weakAnswer },
      ],
    })
    const strong = reviewDemo({
      profile: sampleProfile,
      messages: [
        { role: 'interviewer', content: opening.question },
        { role: 'candidate', content: strongAnswer },
      ],
    })
    return { opening, card, weak, strong }
  }, [])

  return (
    <div className="page">
      <p className="kicker">学习</p>
      <h1>五分钟看清一场练习怎么走。</h1>
      <p className="lede">
        这里对照的是公开产品里的学习路径：快速开始、模型设置、练习方式、历史记录、题目分析和一段可以点击的演示。参考了
        {' '}<a href="https://acedly.ai/zh-CN/help">Acedly 帮助中心</a> 里描述的准备、会话和复盘流程。
      </p>
      <div className="stack">
        {lessons.map((lesson) => (
          <article className="card lesson" key={lesson.no}>
            <div className="step-no">{lesson.no}</div>
            <div>
              <h2>{lesson.title}</h2>
              <p>{lesson.body}</p>
            </div>
          </article>
        ))}
      </div>
      <section className="card stack">
        <div className="spread wrap">
          <h2>互动演示</h2>
          <span className="tiny">第 {step + 1} / 4 步 · 使用示例候选人林可</span>
        </div>
        {step === 0 ? (
          <>
            <p>材料已经限定在林可的订单链路：P99 从 480ms 到 190ms，以及一次超卖。面试官不会得到简历之外的数字。</p>
            <div className="bubble bubble-q"><p className="reaction">{demo.opening.reaction}</p><p>{demo.opening.question}</p></div>
          </>
        ) : null}
        {step === 1 ? (
          <>
            <p>先看一个空泛回答。规则复盘会指出它没有个人动作，也没有材料里的结果。</p>
            <div className="bubble"><p>{weakAnswer}</p></div>
            <AnalysisView analysis={demo.weak} />
          </>
        ) : null}
        {step === 2 ? (
          <>
            <p>同一题换成材料里的事实。分数应该上来，因为动作、结果和反思都能对上简历。</p>
            <div className="bubble"><p>{strongAnswer}</p></div>
            <AnalysisView analysis={demo.strong} />
          </>
        ) : null}
        {step === 3 ? (
          <>
            <p>回答辅导会把简历原句排成可以开口的顺序，并提醒不要追加新指标。</p>
            <CoachView card={demo.card} source="demo" />
          </>
        ) : null}
        <div className="row wrap">
          <button className="btn" type="button" disabled={step === 0} onClick={() => setStep((value) => value - 1)}>上一步</button>
          <button className="btn btn-primary" type="button" onClick={() => setStep((value) => (value === 3 ? 0 : value + 1))}>
            {step === 3 ? '重看' : '下一步'}
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => go('mock')}>用我的材料开一场</button>
        </div>
      </section>
    </div>
  )
}
