/**
 * Answering an ACP agent's permission requests through DSH's own approval policy.
 *
 * Ported from deepseek-harness-acp (https://github.com/Fleey/deepseek-harness-acp),
 * MIT License, Copyright (c) 2026 Fleey. See docs/ATTRIBUTION-ACP.md.
 */
import type { RequestPermissionRequest, RequestPermissionResponse, SessionUpdate, ToolKind } from '@agentclientprotocol/sdk';
import type { AcpHost } from './host.js';
import type { PermissionPolicy } from './types.js';
/** What an agent said about one tool call while announcing it. */
export interface ToolFacts {
    title?: string;
    kind?: ToolKind;
}
export interface PermissionTurn {
    dshSessionId: string | undefined;
    signal: AbortSignal | undefined;
    /**
     * Tool calls this turn announced, by id. Agents may ask about a call by id alone and leave
     * its title and kind to the earlier `tool_call`.
     */
    tools: Map<string, ToolFacts>;
    /** The first tool call this turn refused, so a turn the agent ends over it can say why. */
    denied?: string;
}
/** Remember the latest title and kind an agent states for each tool call of a turn. */
export declare function noteToolCall(tools: Map<string, ToolFacts>, update: SessionUpdate): void;
export declare function decidePermission(host: AcpHost, route: string, policy: PermissionPolicy, turn: PermissionTurn | undefined, request: RequestPermissionRequest): Promise<RequestPermissionResponse>;
