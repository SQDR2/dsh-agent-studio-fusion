/**
 * Native tool-card toolviews for the built-in Antigravity route.
 *
 * Ported from dsh-agy-worker (`src/client/toolview.ts`), MIT License,
 * Copyright (c) 2026 dsh-agy-worker contributors; dsh-agy-worker is a fork of
 * dsh-agy-link (https://github.com/amlyczz/dsh-agy-link). See
 * docs/ATTRIBUTION-AGY.md.
 *
 * Two keyed `tool.call.toolview` views, exactly as upstream registered them:
 *   - `agy_tool`   — the mirror step a bridge route reports under its transport;
 *   - `run_code`   — Code Mode's wrapper. A keyed entry REPLACES the Host's
 *                    generic code row, so the wrapper case is recognized with the
 *                    same strict parser Fusion uses for its own activity
 *                    (`mirrorStepInvocation`) and everything else renders as an
 *                    ordinary code card through {@link AgyCodeToolView}.
 * Every other registration the standalone plugin made is absent: Fusion keeps
 * its own `main` / `sidebar.panellist` entries and its own activity cards.
 *
 * Presentation matches the official DSH tool row and card:
 * - Collapsed state: clean, borderless 24px row with official tool SVG icon,
 *   tool title, separator dot, and summary/preview.
 * - Mouse hover on small icon: smoothly transitions to the chevron down arrow.
 * - Expanded state: leading icon is the chevron down arrow.
 * - Expanded card: rounded 12px card with header (prompt/cwd/path + Copy button)
 *   and scrollable content (max-height with custom scrollbars) for long outputs.
 */
import * as React from 'react';
export declare function makeToggle(setValue: (next: boolean | ((prev: boolean) => boolean)) => void): () => void;
export declare function clearExpandedToolBlockKeysForTest(): void;
export declare function useToggle(initial?: boolean, key?: string): [boolean, () => void];
export declare function IconChevronDownOutline14(size?: number, className?: string): unknown;
export declare function IconApiOutline14(size?: number, className?: string): unknown;
export declare function IconEditOutline16(size?: number, className?: string): unknown;
export declare function IconBrowseOutline16(size?: number, className?: string): unknown;
export declare function IconSearchOutline16(size?: number, className?: string): unknown;
export declare function IconCodeOutline16(size?: number, className?: string): unknown;
export declare function IconInspectOutline12(size?: number, className?: string): unknown;
export declare function IconCopyOutline16(size?: number, className?: string): unknown;
export declare function IconCheckOutline14(size?: number, className?: string): unknown;
export declare function IconQuestionOutline16(size?: number, className?: string): unknown;
export declare function IconImageOutline16(size?: number, className?: string): unknown;
type ToolResultBlock = {
    call: {
        name: string;
        argsRaw: string;
    } | null;
    content: readonly {
        type?: string;
        text?: string;
    }[];
    isError: boolean;
    error?: {
        name?: string;
        code?: string;
    };
    parentCallId?: string;
    subCalls?: readonly unknown[];
};
type RunningCallBlock = {
    name: string;
    argsRaw: string;
    parentCallId?: string;
    subCalls?: readonly unknown[];
    call?: {
        name: string;
        argsRaw: string;
    };
};
export type ToolBlock = (ToolResultBlock | RunningCallBlock) & {
    kind?: string;
};
export interface AgyToolViewProps {
    callId: string;
    toolName: string;
    block: ToolBlock;
    cwd?: string;
    home?: string;
    openFile?: (path: string, opts?: unknown) => void;
    inspect?: () => void;
    loadImage?: unknown;
    /** Standard locale seat, supplied when the registration declares a namespace. */
    t?: (key: string, params?: Record<string, unknown>) => string;
}
export type CardKind = 'terminal' | 'diff' | 'read' | 'search' | 'list' | 'delete' | 'question' | 'image' | 'generic';
export interface MirrorCardModel {
    kind: CardKind;
    tool?: string;
    server?: string;
    title: string;
    command?: string;
    cwd?: string;
    output?: string;
    path?: string;
    oldText?: string | null;
    newText?: string;
    location?: {
        path: string;
        line?: number;
    };
    raw?: string;
    questions?: Array<{
        question?: string;
        options?: string[];
        is_multi_select?: boolean;
    }>;
    prompt?: string;
    imageName?: string;
    aspectRatio?: string;
    isImage?: boolean;
    imagePath?: string;
}
export declare function mirrorCardModel(block: ToolBlock, cwd?: string, home?: string): MirrorCardModel;
export declare function trimTrailingBlankLines(s: string): string;
export declare function previewLine(model: MirrorCardModel, cwd?: string, home?: string): string | undefined;
export declare function AgyMirrorToolView(props: AgyToolViewProps): unknown;
/**
 * Extract the agy mirror cursor (and tool name) from a run_code program.
 *
 * Only the wrapper this bridge actually generates counts: `mirrorStepInvocation`
 * (src/activity.ts) requires the exact two-line shape — one comment naming the
 * recorded step and one `tools['agy_tool']({run, step})` call — and rejects any
 * other program. Anything it rejects is ordinary Code Mode and renders as code.
 */
export declare function parseAgyMirrorFromCode(argsRaw: string): {
    run: string;
    step: number;
    tool?: string;
} | null;
/** Project a run_code program into the fields the code card renders. */
export declare function runCodeModel(block?: ToolBlock): {
    code: string;
    title: string;
};
/**
 * Ordinary run_code toolview.
 *
 * The keyed `tool.call.toolview` registration for `run_code` REPLACES the
 * host's built-in code row rather than adding to it, so this branch owns the
 * icon, title, summary and expandable body for every non-mirror program. It
 * reuses the same styled vocabulary as the mirror card (`agy-tv-row` and
 * friends) so an ordinary Code Mode call reads exactly like a native tool row.
 */
export declare function AgyCodeToolView(props?: AgyToolViewProps): unknown;
/**
 * run_code toolview: when the program is an agy mirror wrapper, render the
 * native Antigravity card instead of a raw code row; every other run_code
 * program renders through {@link AgyCodeToolView}.
 */
export declare function AgyRunCodeToolView(props?: unknown): unknown;
/**
 * The two keyed views this integration contributes, in registration order.
 *
 * Fusion's own client entry performs the registration (it owns the single
 * `slots` dependency); this module only names what to register.
 */
export declare const AGY_TOOL_VIEWS: ReadonlyArray<{
    key: string;
    label: string;
    component: (props?: unknown) => React.ReactNode;
}>;
/**
 * Install the tool-card stylesheet once and hand back its remover.
 *
 * Upstream injected it at module load; a Fusion client entry must be able to
 * unwind what it added, so the work moved behind this function. The style id is
 * namespaced to this plugin.
 */
export declare function installAgyToolViewStyles(): () => void;
export {};
