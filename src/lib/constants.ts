export const SCENARIOS = [
  { id: 'behavior', name: '行为面试', desc: '用一件真事讲清动作和结果' },
  { id: 'tech', name: '技术深挖', desc: '沿着简历里的系统往下追' },
  { id: 'system', name: '系统设计', desc: '澄清、估算、方案和取舍' },
  { id: 'coding', name: '编程讲解', desc: '先讲思路，再写代码' },
  { id: 'phone', name: '电话筛选', desc: '动机、匹配和期望' },
  { id: 'hr', name: 'HR 面', desc: '选择、合作和职业判断' },
] as const

export const PERSONAS = [
  { id: 'lead', name: '严谨技术负责人', desc: '追问个人贡献和细节' },
  { id: 'hr', name: '友善招聘官', desc: '关注动机和表达是否清楚' },
  { id: 'pressure', name: '压力面试官', desc: '质疑数字和事情归属' },
  { id: 'architect', name: '资深架构师', desc: '追问取舍和故障边界' },
] as const

export const DIFFICULTIES = [
  { id: 'easy', name: '入门', desc: '允许先把事情讲完整' },
  { id: 'mid', name: '中级', desc: '要求动作和结果具体' },
  { id: 'hard', name: '高级', desc: '追问取舍、失败和归属' },
] as const

export const CODE_LANGUAGES = ['TypeScript', 'Python', 'C', 'C++', 'Go', 'Java', 'SQL'] as const

export const TYPE_LABEL = {
  mock: '模拟面试',
  assistant: '回答辅导',
  coding: '编程讲解',
} as const

export function scenarioName(id?: string) {
  return SCENARIOS.find((item) => item.id === id)?.name || '模拟面试'
}

export function personaName(id?: string) {
  return PERSONAS.find((item) => item.id === id)?.name || '面试官'
}

export function difficultyName(id?: string) {
  return DIFFICULTIES.find((item) => item.id === id)?.name || '中级'
}
