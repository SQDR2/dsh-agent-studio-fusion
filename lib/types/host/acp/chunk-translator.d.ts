/**
 * Translating ACP session updates into DSH stream chunks.
 *
 * Ported from deepseek-harness-acp (https://github.com/Fleey/deepseek-harness-acp),
 * MIT License, Copyright (c) 2026 Fleey. See docs/ATTRIBUTION-ACP.md.
 */
import type { SessionUpdate, Usage } from '@agentclientprotocol/sdk';
import type { StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm';
export declare class ChunkTranslator {
    private readonly showToolCalls;
    private open;
    private nextIndex;
    private readonly tools;
    constructor(showToolCalls: boolean);
    get emittedBlocks(): number;
    push(update: SessionUpdate): StreamChunk[];
    close(): StreamChunk[];
    private separator;
    private append;
}
export declare function usageDelta(current: Usage, previous: Usage | undefined): TokenUsage;
/**
 * Usage of one model call that an agent attaches to a `usage_update` as `_meta.usage`, in the
 * OpenAI shape (`prompt_tokens`, cache hits included) or the Anthropic one (`input_tokens`,
 * cache apart). CodeBuddy reports usage this way only: its prompt responses carry none.
 */
export declare function metaUsage(meta: unknown): TokenUsage | undefined;
/** Usage of a turn that ran several model calls. */
export declare function addUsage(total: TokenUsage | undefined, call: TokenUsage): TokenUsage;
