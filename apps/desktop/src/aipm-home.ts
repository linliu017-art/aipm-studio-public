/** AIPM Studio keeps its own Harness home so it never shares sessions or settings with an installed DeepSeek Harness. */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { DSH_HOME_ENV } from '@deepseek-ai/dsh-home-paths'

/** Default Harness home of AIPM Studio. */
export const AIPM_STUDIO_HOME = join(homedir(), '.aipm-studio')

// An explicit DSH_HOME still wins, which keeps tests and manual overrides working.
if (process.env[DSH_HOME_ENV] === undefined || process.env[DSH_HOME_ENV] === '') process.env[DSH_HOME_ENV] = AIPM_STUDIO_HOME
