import type { IconProps } from './icons/props.ts'

/** Native square view box used by the Nini Flow product mark. */
export const FISH_LOGO_VIEWBOX = { width: 48, height: 48 }

/** @deprecated The current product mark uses multiple stroked paths. */
export const FISH_LOGO_PATH = ''

/**
 * Render the Nini Flow sparkle on its warm translucent tile.
 * @param props.size - square mark size in px.
 * @param props.className - extra class for host layout and motion.
 * @returns the decorative product mark.
 */
export function FishLogo({ size = 48, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox={`0 0 ${FISH_LOGO_VIEWBOX.width} ${FISH_LOGO_VIEWBOX.height}`}
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="0.75"
        y="0.75"
        width="46.5"
        height="46.5"
        rx="13.25"
        fill="var(--dsw-nini-mark-fill)"
        stroke="var(--dsw-nini-mark-border)"
        strokeWidth="1.5"
      />
      <path
        d="M20 12.5C20 18.1667 22.8333 21 28.5 21C22.8333 21 20 23.8333 20 29.5C20 23.8333 17.1667 21 11.5 21C17.1667 21 20 18.1667 20 12.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M32 10.5C32 13.1667 33.3333 14.5 36 14.5C33.3333 14.5 32 15.8333 32 18.5C32 15.8333 30.6667 14.5 28 14.5C30.6667 14.5 32 13.1667 32 10.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
