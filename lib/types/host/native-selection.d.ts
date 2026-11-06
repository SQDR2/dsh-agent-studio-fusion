import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, LlmModelInfo, LlmResolvedModelInfo, ModelModality, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { PhysicalRoute } from '../contracts.js';
import { FUSION_MODEL, FUSION_PROVIDER, isFusionSelection } from '../identity.js';
import type { ResolvedProfile } from '../profile/resolve.js';
import type { FusionCoordinator } from './coordinator.js';
export { FUSION_MODEL, FUSION_PROVIDER, isFusionSelection };
/** One combo as the native menu needs it: its id, its label and its Lead's modalities. */
export interface FusionModelEntry {
    readonly id: string;
    readonly name: string;
    readonly description?: string;
    readonly inputModalities: readonly ModelModality[];
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
    listModels(provider: string): Promise<readonly LlmModelInfo[]>;
    resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo>;
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
