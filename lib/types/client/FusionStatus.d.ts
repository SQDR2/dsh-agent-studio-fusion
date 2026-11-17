import type { PlanReviewStatus } from '../status.js';
import { type Lang } from './i18n.js';
/** Visible-session polling reads the plugin ledger; it never sends a chat message. */
export declare function FusionStatus({ sessionId, attentionOnly }: {
    sessionId: string;
    attentionOnly?: boolean;
}): import("react").JSX.Element | null;
/** Money for the current task, with its coverage and what it is not. */
export declare function PlanReviewBlock({ lang, review }: {
    lang: Lang;
    review: PlanReviewStatus;
}): import("react").JSX.Element;
