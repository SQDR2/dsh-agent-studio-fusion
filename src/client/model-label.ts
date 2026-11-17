import type { ModelCatalogModel, ModelProviderGroup } from '@deepseek-ai/dsh-api-session-controller/types'

/** A route as the durable records spell it: a provider id and one of its model ids. */
export interface CatalogRoute { provider: string; model: string }

/**
 * The catalog entry one route names, when this client has loaded that provider's group.
 *
 * Only the already-loaded catalog is consulted — no load is triggered and no state is
 * changed: a label is a rendering of facts the composer already has.
 * @param groups - the session directory's catalog groups.
 * @param route - provider and model id, or undefined.
 * @returns the entry, or undefined when that route is not in the loaded catalog.
 */
export function catalogModel(
  groups: readonly ModelProviderGroup[], route: CatalogRoute | undefined,
): ModelCatalogModel | undefined {
  if (route === undefined) return undefined
  return groups.find(group => group.id === route.provider)?.models.find(model => model.id === route.model)
}

/**
 * The catalog display name of one route.
 * @param groups - the session directory's catalog groups.
 * @param route - provider and model id, or undefined.
 * @returns the entry's name, or undefined when the route is not in the loaded catalog.
 */
export function catalogModelName(
  groups: readonly ModelProviderGroup[], route: CatalogRoute | undefined,
): string | undefined {
  return catalogModel(groups, route)?.name
}
