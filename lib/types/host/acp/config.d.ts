/**
 * Configuration schema for the ACP agent routes.
 *
 * Ported from deepseek-harness-acp (https://github.com/Fleey/deepseek-harness-acp),
 * MIT License, Copyright (c) 2026 Fleey. See docs/ATTRIBUTION-ACP.md.
 */
import z from '@deepseek-ai/schemastery';
import type { AcpAgentProfile, AcpConfig } from './types.js';
export declare const DEFAULT_MODEL_ID = "default";
export declare const DEFAULT_CONTEXT_WINDOW = 200000;
/** One configured ACP agent route. */
export declare const AcpAgentProfileSchema: z<AcpAgentProfile>;
/** The `acp` block: `acp.agents` maps a provider route id to its profile. */
export declare const AcpConfigSchema: z<AcpConfig>;
/** Read the configured profiles; an absent block is an empty map, never an error. */
export declare function agentsOf(config: {
    acp?: {
        agents?: Record<string, AcpAgentProfile>;
    };
} | undefined): ReadonlyMap<string, AcpAgentProfile>;
export declare function spawnFacts(profile: AcpAgentProfile): string;
