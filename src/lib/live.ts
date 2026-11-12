import { dropNoise, isFiller } from './format'

export type HeardIntent = 'skip' | 'partial' | 'question' | 'coding'

const CODING = /leetcode|算法题|写代码|写一个函数|实现一个函数|编写一个|给定一个|给定整数|返回下标|时间复杂度|空间复杂度|示例\s*\d|输入[:：]/i

export function classifyHeard(text: string): HeardIntent {
  const value = dropNoise(text.replace(/\s+/g, ' ').trim())
  if (!value || isFiller(value)) return 'skip'
  if (value.length >= 12 && CODING.test(value)) return 'coding'
  if (value.length < 8) return 'partial'
  return 'question'
}
