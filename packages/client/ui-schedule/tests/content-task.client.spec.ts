import { describe, expect, it } from 'vitest'
import { hasContentResult, requestsContent } from '../src/client/content-task.ts'

describe('content-producing task recognition', () => {
  it.each([
    '整理本周 AI 产品领域的重要新闻，并生成一份简报',
    '请写一段 100 字以内的文字，介绍 AI 产品经理的主要工作。',
    '分析竞品并给出对比结论',
    '写首诗',
    '提醒我周一开会，同时生成一份会议议程',
    '提醒我写周报，并生成一份提纲',
    'Generate a weekly competitor report',
  ])('accepts a task requesting content: %s', (prompt) => { expect(requestsContent(prompt)).toBe(true) })
  it.each([
    '提醒用户：已经晚上 10 点了，该准备睡觉了。',
    '提醒用户：晚上 11 点了，该去洗漱了。',
    '明天提醒我写一份周报',
    'Remind me to write a report tomorrow',
    '违法未发生',
    '提醒我喝水，不需要生成任何内容',
  ])('rejects a reminder or unclear instruction: %s', (prompt) => { expect(requestsContent(prompt)).toBe(false) })
  it('does not infer historical intent from a missing prompt', () => { expect(requestsContent(undefined)).toBe(false) })
})


it('does not treat an explicit inability to generate content as a result', () => {
  expect(hasContentResult('抱歉，我无法生成这份报告。')).toBe(false)
  expect(hasContentResult('')).toBe(false)
  expect(hasContentResult('AI 产品经理主要负责需求、设计和验证。')).toBe(true)
})
