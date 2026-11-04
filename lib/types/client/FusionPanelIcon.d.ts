import type { ReactNode } from 'react';
export interface FusionPanelIconProps {
    /** Square size in pixels requested by the host sidebar (defaults to 16). */
    size?: number;
    /** Whether the panel is currently active/selected in the main column. */
    active?: boolean;
    className?: string;
}
/**
 * Compact, accessible icon for the Fusion sidebar entry.
 * Renders a dual-node convergence (Lead + Sidekick models fusing into one) SVG glyph.
 */
export declare function FusionPanelIcon({ size, active, className }: FusionPanelIconProps): ReactNode;
