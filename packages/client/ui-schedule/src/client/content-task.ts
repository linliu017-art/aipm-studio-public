/** Conservative recognition of instructions requesting content rather than a reminder. */
export function requestsContent(prompt: string | undefined): boolean {
  if (prompt === undefined || prompt.trim() === '') return false
  const text = prompt.trim()
  if (/(?:不需要|不要|无需)(?:生成|输出|撰写|写)(?:任何|额外)?(?:内容|文件|报告|文档|文字|结果)/u.test(text)) return false
  const chinese = /(?:生成|撰写|写|创作|制作|绘制|翻译|总结|归纳|汇总|整理|分析|解释|解答|提取|对比|评估|调研|研究|输出|提供|列出|设计|拟定|编制)/u.exec(text)
  const english = /(?:create|generate|write|draft|summari[sz]e|analy[sz]e|translate|prepare|compile)/iu.exec(text)
  const action = chinese === null ? english : english === null || chinese.index <= english.index ? chinese : english
  if (action === null) return false
  const reminder = /(?:提醒(?:我|用户|自己|大家|他|她|你)?|remind\s+(?:me|us|the user))/iu.exec(text)
  if (reminder === null || action.index < reminder.index) return true
  // A reminder to do work later is not itself a request for the agent to produce it.
  const bridge = text.slice(reminder.index, action.index)
  if (/(?:并且|并|同时|然后|另外|随后|以及|and\s+(?:also\s+)?)/iu.test(bridge)) return true
  const later = text.slice(action.index + action[0].length)
  return /(?:并且|并|同时|然后|另外|随后|以及)\s*(?:请)?(?:生成|写|撰写|整理|汇总|输出|提供|分析|制作)/u.test(later)
    || /\band\s+(?:also\s+)?(?:generate|write|draft|summari[sz]e|analy[sz]e|prepare|create)\b/iu.test(later)
}

/** A direct refusal is not a produced text result. */
export function hasContentResult(text: string): boolean {
  const value = text.trim()
  if (value === '') return false
  return !/^(?:(?:抱歉|很抱歉|对不起)[，,：:\s]*)?(?:我)?(?:无法|不能|未能|没能)(?:完成|生成|提供|撰写|写出|输出)(?:这|该|你的|您|一份|一篇|任何)?/u.test(value)
}
