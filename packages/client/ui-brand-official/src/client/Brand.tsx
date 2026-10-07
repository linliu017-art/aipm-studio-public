import { FishLogo } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * Render the official mark with the presentation requested by its host surface.
 * @param props - Host-supplied mark presentation.
 * @returns the official whale mark.
 */
export function OfficialBrandMark({ size }: SidebarBrandMarkOwnerProps) {
  return <FishLogo size={size} />
}

/**
 * Render the product name without its independently slotted mark.
 * @returns the product name text.
 */
export function OfficialBrandName() {
  return <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: '0.01em' }}>AIPM Studio</span>
}
