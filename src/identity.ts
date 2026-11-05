/**
 * The identity this plugin registers under.
 *
 * Both halves import this module, so the provider route, the model entry and
 * the durable producers keep one spelling. It deliberately has no imports: the
 * browser bundle inlines it and must not pull a Host module in.
 */

/** The HTTP path the panel's own views and actions are served from. */
export const FUSION_API_PATH = '/api/fusion'

/**
 * The path this plugin served before the rename. The host keeps answering it
 * so a browser tab holding the previous client bundle keeps working until its
 * next reload; nothing in the current bundle requests it.
 */
export const LEGACY_FUSION_API_PATH = '/api/model-fusion'

/** The package and plugin id this project publishes under. */
export const PLUGIN_NAME = 'dsh-fusion'

/** The package name this project published under before the rename. */
export const LEGACY_PLUGIN_NAME = 'dsh-model-fusion'

/** Registered provider route for the Fusion model entry. */
export const FUSION_PROVIDER = 'dsh-fusion'

/** The single model id the Fusion entry advertises. */
export const FUSION_MODEL = 'auto'

/**
 * The provider route this plugin registered before it was renamed from
 * `dsh-model-fusion`. Sessions created then still name it in their durable
 * `model/selection` event, so reading it as Fusion is what keeps those
 * sessions working; writing it is never correct.
 */
export const LEGACY_FUSION_PROVIDER = 'dsh-model-fusion'

/** Whether a provider route belongs to this plugin, under either name. */
export const isFusionProvider = (provider: string | undefined): boolean =>
  provider === FUSION_PROVIDER || provider === LEGACY_FUSION_PROVIDER

/** Whether a route names the Fusion entry, under either name. */
export const isFusionSelection = (route: { provider?: string; model?: string } | undefined): boolean =>
  isFusionProvider(route?.provider) && route?.model === FUSION_MODEL

/**
 * How a native model-switch notice names this entry (`provider/model`).
 *
 * Both spellings are listed: a session that switched to Fusion before the
 * rename carries the old one in its durable log, and the notice is the same
 * non-change on every Fusion step either way.
 */
export const FUSION_SELECTION_LABELS = [
  `${FUSION_PROVIDER}/${FUSION_MODEL}`,
  `${LEGACY_FUSION_PROVIDER}/${FUSION_MODEL}`,
] as const

/**
 * Whether a route already names the entry under its current name. A durable
 * intent that fails this is rewritten before the next request is assembled;
 * the legacy spelling is a read-side alias, not a route that still dispatches.
 */
export const isCurrentFusionSelection = (route: { provider?: string; model?: string } | undefined): boolean =>
  route?.provider === FUSION_PROVIDER && route.model === FUSION_MODEL
