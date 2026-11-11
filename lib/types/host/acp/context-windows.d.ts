/**
 * Context-window sizes an ACP agent reported, remembered across restarts.
 *
 * Ported from deepseek-harness-acp (https://github.com/Fleey/deepseek-harness-acp),
 * MIT License, Copyright (c) 2026 Fleey. See docs/ATTRIBUTION-ACP.md.
 */
interface Logger {
    warn: (...args: unknown[]) => void;
}
/**
 * Window implied by a model's own id, name or description. ACP has no field for it before
 * a turn runs, but agents spell 1M-context variants with a distinct "1m" token
 * (`claude-fable-5-1[1m]`, `Opus 4.7 (1M context)`); `\b` keeps "10m" from matching.
 */
export declare function inferContextWindow(...texts: readonly (string | undefined)[]): number | undefined;
/**
 * Context window sizes agents reported through `usage_update`, keyed by route and model.
 * DSH resolves a model's window before each request, so a size learned only in memory
 * leaves the first turn after every restart on the configured default.
 */
export declare class ContextWindows {
    private readonly file?;
    private readonly logger?;
    private readonly sizes;
    private saving;
    constructor(file?: string | undefined, logger?: Logger | undefined);
    get(route: string, model: string): number | undefined;
    set(route: string, model: string, size: number): void;
    /** Settles once every size set so far is on disk. */
    flush(): Promise<void>;
}
export {};
