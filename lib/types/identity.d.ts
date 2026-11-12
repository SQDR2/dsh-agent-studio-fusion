/**
 * The identity this plugin registers under.
 *
 * Both halves import this module, so the provider route, the model entry and
 * the durable producers keep one spelling. It deliberately has no imports: the
 * browser bundle inlines it and must not pull a Host module in.
 */
/** The HTTP path the panel's own views and actions are served from. */
export declare const FUSION_API_PATH = "/api/fusion";
/**
 * The path this plugin served before the rename. The host keeps answering it
 * so a browser tab holding the previous client bundle keeps working until its
 * next reload; nothing in the current bundle requests it.
 */
export declare const LEGACY_FUSION_API_PATH = "/api/model-fusion";
/**
 * The npm package this project publishes under.
 *
 * Distinct from {@link PLUGIN_NAME}: the package name is the registry identity
 * and the module specifier a profile's patch resolves, while the plugin id is
 * the runtime identity that names the state directory, the bundle patch row and
 * the log marker. Keeping them apart is what lets the package move into a scope
 * without moving anyone's data.
 */
export declare const PACKAGE_NAME = "@sqdr2/dsh-agent-studio-fusion";
/** The plugin id this project registers under, and the name of its state directory. */
export declare const PLUGIN_NAME = "dsh-agent-studio-fusion";
/** The plugin ids this project used before the renames. */
export declare const LEGACY_PLUGIN_NAME = "dsh-fusion";
export declare const LEGACY_PLUGIN_NAMES: readonly ["dsh-fusion", "dsh-model-fusion", "dsh-agent-studio"];
/** Registered provider route for the Fusion model entries. */
export declare const FUSION_PROVIDER = "dsh-fusion";
/**
 * The model id of the combo every installation starts with.
 *
 * It is a pair id like any other; keeping this exact spelling for the first
 * combo means a durable `model/selection` written before combos existed still
 * names a combo that exists.
 */
export declare const FUSION_MODEL = "auto";
/** Whether a model id names a Fusion combo on this provider. */
export declare const isFusionModel: (model: string | undefined) => boolean;
/**
 * The provider route this plugin registered before it was renamed from
 * `dsh-model-fusion`. Sessions created then still name it in their durable
 * `model/selection` event, so reading it as Fusion is what keeps those
 * sessions working; writing it is never correct.
 */
export declare const LEGACY_FUSION_PROVIDER = "dsh-model-fusion";
/** Whether a provider route belongs to this plugin, under any historical name. */
export declare const isFusionProvider: (provider: string | undefined) => boolean;
/** Whether a route names a Fusion combo, under either provider spelling. */
export declare const isFusionSelection: (route: {
    provider?: string;
    model?: string;
} | undefined) => boolean;
/** Whether a switch-notice summary describes a Fusion combo as either side. */
export declare const isFusionSelectionLabel: (summary: string | undefined) => boolean;
/**
 * Whether a route already names a combo under its current provider spelling. A
 * durable intent that fails this is rewritten before the next request is
 * assembled; the legacy spelling is a read-side alias, not a dispatching route.
 */
export declare const isCurrentFusionSelection: (route: {
    provider?: string;
    model?: string;
} | undefined) => boolean;
/**
 * The provider route of the built-in Antigravity (agy CLI) side.
 *
 * Ported from dsh-agy-worker, MIT License, Copyright (c) 2026 dsh-agy-worker
 * contributors; see docs/ATTRIBUTION-AGY.md. The spelling is load-bearing:
 * durable `model/selection` events, `workerTools` ceilings and the route
 * transport table all name `antigravity` / `agy_tool`, so the port keeps it.
 */
export declare const AGY_PROVIDER = "antigravity";
/**
 * The HTTP prefix the Antigravity console polls. Unchanged from the standalone
 * plugin, so no route rename is involved and a tab still running the previous
 * bundle keeps answering until it reloads.
 */
export declare const AGY_API_PATH = "/plugins/agy-worker";
