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
export declare const PACKAGE_NAME = "@sqdr2/dsh-fusion";
/** The plugin id this project registers under, and the name of its state directory. */
export declare const PLUGIN_NAME = "dsh-fusion";
/** The plugin id and package name this project used before the rename. */
export declare const LEGACY_PLUGIN_NAME = "dsh-model-fusion";
/** Registered provider route for the Fusion model entry. */
export declare const FUSION_PROVIDER = "dsh-fusion";
/** The single model id the Fusion entry advertises. */
export declare const FUSION_MODEL = "auto";
/**
 * The provider route this plugin registered before it was renamed from
 * `dsh-model-fusion`. Sessions created then still name it in their durable
 * `model/selection` event, so reading it as Fusion is what keeps those
 * sessions working; writing it is never correct.
 */
export declare const LEGACY_FUSION_PROVIDER = "dsh-model-fusion";
/** Whether a provider route belongs to this plugin, under either name. */
export declare const isFusionProvider: (provider: string | undefined) => boolean;
/** Whether a route names the Fusion entry, under either name. */
export declare const isFusionSelection: (route: {
    provider?: string;
    model?: string;
} | undefined) => boolean;
/**
 * How a native model-switch notice names this entry (`provider/model`).
 *
 * Both spellings are listed: a session that switched to Fusion before the
 * rename carries the old one in its durable log, and the notice is the same
 * non-change on every Fusion step either way.
 */
export declare const FUSION_SELECTION_LABELS: readonly ["dsh-fusion/auto", "dsh-model-fusion/auto"];
/**
 * Whether a route already names the entry under its current name. A durable
 * intent that fails this is rewritten before the next request is assembled;
 * the legacy spelling is a read-side alias, not a route that still dispatches.
 */
export declare const isCurrentFusionSelection: (route: {
    provider?: string;
    model?: string;
} | undefined) => boolean;
