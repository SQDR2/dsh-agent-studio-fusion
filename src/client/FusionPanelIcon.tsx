import type { ReactNode } from 'react'

export interface FusionPanelIconProps {
  /** Square size in pixels requested by the host sidebar (defaults to 16). */
  size?: number
  /** Whether the panel is currently active/selected in the main column. */
  active?: boolean
  className?: string
}

/**
 * Compact, accessible icon for the Fusion sidebar entry.
 * Renders a dual-node convergence (Lead + Sidekick models fusing into one) SVG glyph.
 */
export function FusionPanelIcon({ size = 16, active = false, className }: FusionPanelIconProps): ReactNode {
  return (
    <svg
      role="img"
      aria-label="Fusion"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 1.5 : 1.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="4" cy="4.5" r="2" />
      <circle cx="4" cy="11.5" r="2" />
      <circle cx="12" cy="8" r="2" />
      <path d="M6 4.5h1.5a3 3 0 0 1 2.7 1.7L10.5 6.8" />
      <path d="M6 11.5h1.5a3 3 0 0 0 2.7-1.7l.3-.6" />
    </svg>
  )
}
