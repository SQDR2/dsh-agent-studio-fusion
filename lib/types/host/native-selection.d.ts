import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, LlmModelContext, LlmModelInfo, LlmResolvedModelInfo, ModelModality, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { PhysicalRoute } from '../contracts.js';
import { FUSION_MODEL, FUSION_PROVIDER, isFusionSelection } from '../identity.js';
import type { ResolvedProfile } from '../profile/resolve.js';
import type { FusionCoordinator } from './coordinator.js';
export { FUSION_MODEL, FUSION_PROVIDER, isFusionSelection };
/**
 * One combo as the native menu needs it: its id, its label, its Lead's modalities and the
 * Lead's capacity.
 *
 * The capacity is not decoration. The menu route is virtual — no adapter can answer it — and
 * a Host that prices a *route* rather than a step asks the catalog for it: automatic
 * compaction on a model switch read `dsh-fusion/pair-…` after a combo change and failed the
 * turn with `no context capacity … configure contextWindow on that adapter model`
 * (session-7f326880, turn 2). Answering with the Lead's window is the truthful answer: that
 * window is where the pair's requests actually land.
 */
export interface FusionModelEntry {
    readonly id: string;
    readonly name: string;
    readonly description?: string;
    readonly inputModalities: readonly ModelModality[];
    /** The Lead's provider-owned context capacity, when its adapter declares one. */
    readonly context?: LlmModelContext;
    /** The Lead's adapter default output cap, when its adapter declares one. */
    readonly defaultMaxTokens?: number;
}
/** Read every combo this Host currently advertises; empty means unconfigured. */
export type FusionModels = () => Promise<readonly FusionModelEntry[]>;
/** Catalog-only local adapter; the native request is physically routed before dispatch. */
export declare class FusionCatalogAdapter extends LlmAdapter {
    private readonly models?;
    constructor(models?: FusionModels | undefined);
    providerInfo(provider: string): {
        id: string;
        name: string;
    };
    /**
     * The combos to advertise: the declared list, or the historical entry an installation
     * with nothing configured still offers, so the menu can explain what to configure
     * instead of hiding Fusion entirely.
     */
    private declared;
    listModels(provider: string): Promise<readonly LlmModelInfo[]>;
    resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo>;
    private static describe;
    stream(_options: GenerateOptions): AsyncIterable<StreamChunk>;
}
/** Public native lifecycle integration. No model-menu replacement or Host patch. */
export declare function installNativeFusionSelection(ctx: Context, input: {
    coordinator(): FusionCoordinator | undefined;
    /** The frozen profile of one combo, or undefined when it cannot be used yet. */
    profile(model: string): ResolvedProfile | undefined;
    /** Why one combo cannot run, for the message a blocked session shows. */
    reason?(model: string): string | undefined;
    selection(agent: Agent): PhysicalRoute | undefined;
}): () => void;
