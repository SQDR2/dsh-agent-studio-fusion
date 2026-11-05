import type { ContextFormed } from '@deepseek-ai/dsh-llm';
declare module '@deepseek-ai/dsh-llm' {
    interface MessageSourceMap {
        'plugin:dsh-fusion': {
            kind: 'plugin:dsh-fusion';
        } & ContextFormed;
        /**
         * The producer kind this plugin wrote before it was renamed from
         * `dsh-model-fusion`. Sessions that already exist still carry it in their
         * durable log, so it stays a readable alias; nothing new is written under
         * it and no migration rewrites history.
         */
        'plugin:dsh-model-fusion': {
            kind: 'plugin:dsh-model-fusion';
        } & ContextFormed;
    }
}
/** The kind every new Fusion message is written under. */
export declare const FUSION_SOURCE_KIND = "plugin:dsh-fusion";
/** Kinds a Fusion-produced message may already carry in an existing session. */
export declare const FUSION_SOURCE_KINDS: readonly ["plugin:dsh-fusion", "plugin:dsh-model-fusion"];
export type FusionSourceKind = (typeof FUSION_SOURCE_KINDS)[number];
/**
 * Whether a message source was produced by this plugin, under either name.
 *
 * Read-side call sites use this guard instead of comparing one literal, so a
 * session started before the rename keeps its context across the upgrade.
 */
export declare function isFusionSourceKind(kind: unknown): kind is FusionSourceKind;
