/** Host bootstrap for the Workspace start policy. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { type Config, START_CONFIG_GLOBAL } from './start-config.ts'

export { Config } from './start-config.ts'

/**
 * Publish the navigation policy before browser plugins activate.
 * @param ctx - Host page-bootstrap events.
 * @param config - validated public options.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'global', name: START_CONFIG_GLOBAL, value: { isolatedIdeas: config.isolatedIdeas } })
  })
}
