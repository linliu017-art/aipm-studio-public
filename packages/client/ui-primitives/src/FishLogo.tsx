import type { IconProps } from './icons/props.ts'

/** Native viewBox of {@link FISH_LOGO_PATH} (width and height in user units). */
export const FISH_LOGO_VIEWBOX = { width: 24, height: 24 }

/** The AIPM Studio mark path data, exported for consumers that compose their own svg (entrance effects, masks) around the same geometry. */
export const FISH_LOGO_PATH = 'M7 2H17A5 5 0 0 1 22 7V17A5 5 0 0 1 17 22H7A5 5 0 0 1 2 17V7A5 5 0 0 1 7 2ZM7 4A3 3 0 0 0 4 7V17A3 3 0 0 0 7 20H17A3 3 0 0 0 20 17V7A3 3 0 0 0 17 4ZM7 13H9V17H7ZM11 10H13V17H11ZM15 7H17V17H15Z'

/**
 * Render the fish logo.
 * @param props.size - width in px (default 24; square).
 * @param props.className - extra class for layout placement.
 * @returns the logo svg (aria-hidden; pair with the wordmark for accessibility).
 */
export function FishLogo({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={(size * FISH_LOGO_VIEWBOX.height) / FISH_LOGO_VIEWBOX.width}
      className={className}
      viewBox={`0 0 ${FISH_LOGO_VIEWBOX.width} ${FISH_LOGO_VIEWBOX.height}`}
      fill="none"
      aria-hidden="true"
    >
      <path d={FISH_LOGO_PATH} fill="currentColor" />
    </svg>
  )
}
