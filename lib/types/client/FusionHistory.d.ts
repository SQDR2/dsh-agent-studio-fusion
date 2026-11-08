import type { HistoryTotals } from '../host/history.js';
import { type Lang } from './i18n.js';
export declare function formatCompact(tokens: number): string;
export declare function outputTokens(lang: Lang, usage: HistoryTotals, calls: number): string;
/** A dollar figure, or a dash when it could not be computed. */
export declare const money: (value: string | null) => string;
export declare function FusionHistory(): import("react").JSX.Element;
