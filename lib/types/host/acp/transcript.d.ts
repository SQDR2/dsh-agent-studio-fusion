/**
 * Projecting a DSH conversation into ACP prompt blocks.
 *
 * Ported from deepseek-harness-acp (https://github.com/Fleey/deepseek-harness-acp),
 * MIT License, Copyright (c) 2026 Fleey. See docs/ATTRIBUTION-ACP.md.
 */
import type { ContentBlock as AcpContentBlock } from '@agentclientprotocol/sdk';
import type { ContentBlock, GenerateOptions } from '@deepseek-ai/dsh-llm';
type ImageAttachmentRef = Extract<ContentBlock, {
    type: 'image';
}>['attachment'];
/** One image prepared for the agent: base64 request bytes plus the size its handle text names. */
export interface PromptImage {
    data: string;
    mimeType: string;
    width: number;
    height: number;
}
/**
 * Image bytes for the turn being sent. Building a prompt records every image it would
 * send in `wanted`; the caller reads those and builds again with them in `read`.
 */
export interface PromptImages {
    read: ReadonlyMap<string, PromptImage>;
    wanted: Map<string, ImageAttachmentRef>;
}
type Conversation = GenerateOptions['messages'];
export declare function systemText(options: GenerateOptions): string;
export declare function conversationOf(options: GenerateOptions): Conversation;
export declare function consumedIds(conversation: Conversation): string[];
export declare function incrementalPrompt(conversation: Conversation, consumed: readonly string[], route: string, images?: PromptImages): AcpContentBlock[] | undefined;
export declare function fullPrompt(conversation: Conversation, system: string | undefined, images?: PromptImages): AcpContentBlock[];
export {};
