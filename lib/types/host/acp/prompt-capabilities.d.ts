/**
 * The prompt content one ACP agent accepts, learned in its `initialize` handshake.
 *
 * Ported from deepseek-harness-acp (https://github.com/Fleey/deepseek-harness-acp),
 * MIT License, Copyright (c) 2026 Fleey. See docs/ATTRIBUTION-ACP.md.
 */
import type { PromptCapabilities } from '@agentclientprotocol/sdk';
/** The content types an agent declared it accepts in one prompt. */
export interface AcpPromptCapabilities {
    image: boolean;
    audio: boolean;
    embeddedContext: boolean;
}
/** Read an `initialize` answer's prompt capabilities; every absent flag is a negative. */
export declare function promptCapabilitiesOf(capabilities: PromptCapabilities | null | undefined): AcpPromptCapabilities;
interface Logger {
    warn: (...args: unknown[]) => void;
}
/**
 * Prompt capabilities agents answered with during `initialize`, keyed by route. The answer is
 * remembered against the spawn facts that produced it: a route repointed at another command
 * answers for another agent, so its stored answer is ignored until the new one speaks.
 */
export declare class PromptCapabilitiesCache {
    private readonly file?;
    private readonly logger?;
    private readonly entries;
    private saving;
    constructor(file?: string | undefined, logger?: Logger | undefined);
    get(route: string, facts: string): AcpPromptCapabilities | undefined;
    set(route: string, facts: string, capabilities: AcpPromptCapabilities): void;
    /** Settles once every answer stored so far is on disk. */
    flush(): Promise<void>;
}
export {};
