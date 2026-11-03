/** Apply the production Host setup during a keyless CLI request replay. */
import { workshopContext } from '../../../packages/api/session-controller/src/workshop-context.ts'

export const inject = ['skills']

export function apply(ctx) {
  const started = new WeakSet()
  ctx.on('agent/pre-step', async ({ agent, messages }, next) => {
    const decision = await next()
    if (decision.kind === 'reject' || started.has(agent) || !messages.some(message => message.source.kind === 'user')) return decision
    const context = await workshopContext(ctx, agent, { mode: 'materials', output: 'prd' })
    started.add(agent)
    return { ...decision, messages: [...decision.messages, context] }
  })
}
