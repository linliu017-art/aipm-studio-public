/** Public Workspace start policy shared by Host and browser boot. */
import z from '@deepseek-ai/schemastery'

/** Navigation options after schema defaults. */
export interface Config {
  /** Start an independent idea instead of inheriting the default or recent Workspace. */
  isolatedIdeas: boolean
}

/** Validate the Host options and public browser bootstrap payload. */
export const Config: z<Partial<Config>, Config> = z.object({
  isolatedIdeas: z.boolean().default(false),
})

/** Public page-global carrying no project data or credentials. */
export const START_CONFIG_GLOBAL = '__DSH_WORKSPACE_START__'
