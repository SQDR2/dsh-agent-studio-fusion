import { useEffect, useSyncExternalStore } from 'react'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { Tag, type TagTone } from '@deepseek-ai/dsh-client-ui-primitives'
import { useLang, type Lang } from './i18n.js'
import { useFusionStatus } from './status-polling.js'
import { catalogModel } from './model-label.js'
import type { FusionStatus } from '../status.js'

/** One literal, or translations keyed by lowercase language id with a required English entry. */
type Localized = string | { readonly en: string; readonly [locale: string]: string }

/**
 * One catalog entry as the model seat shows it: the fields the label reads.
 *
 * Structural rather than the Host's `ModelCatalogModel` so that both the badge-carrying
 * catalog and a catalog that declares none type-check here; the owner always passes the
 * full entry, and this type only names what a label may rely on.
 */
export interface ComposerModelLabelModel {
  readonly id: string
  readonly name: string
  readonly badge?: { readonly text: Localized; readonly tone?: TagTone }
}

/**
 * The composer model seat's inline label owner: one catalog entry in one placement.
 *
 * Mirrors the Host's own `conversation.input.model.label` owner props (provider/model/
 * placement/selected) without importing that package's type, which this checkout's published
 * dependency does not export yet.
 */
export interface ComposerModelLabelOwner {
  /** Provider identity and display name; contains no connection configuration. */
  readonly provider: { readonly id: string; readonly name: string }
  /** The exact provider's model catalog entry. */
  readonly model: ComposerModelLabelModel
  /** Trigger caption, root-menu current value, or selectable model row. */
  readonly placement: 'trigger' | 'menu' | 'option'
  /** Whether this provider/model pair is the current selection. */
  readonly selected: boolean
}

export interface FusionModelLabelProps extends ComposerModelLabelOwner {
  sessionId: string
  directory: ObservableSnapshot<ModelDirectoryState>
  load(): void
}

/** The badge's one literal, or the translation for this UI's language. */
const badgeText = (lang: Lang, text: Localized): string => typeof text === 'string' ? text : text[lang] ?? text.en

/** Whether one owner route is the physical route this task's Lead or Sidekick answers on. */
function isTaskRoute(task: FusionStatus['task'], provider: string, model: string): boolean {
  if (task === undefined) return false
  return [task.models.lead, task.models.worker].some(route => route.provider === provider && route.model === model)
}

/**
 * The composer's inline model label, with the combo back while a Fusion turn is pinned.
 *
 * On a 0.2.2 Host the physical route has to be the recorded `model/selection` before a step
 * is prepared, so a running Fusion turn makes the Lead's own model the composer's current
 * value: session-7f326880 opened on the combo "6.1 --> Gemini 3.8" and the trigger read
 * `gz/gpt-5.6-sol` for the whole task (requirement: 模型变成了 gpt 6.1-sol).
 *
 * Two gates keep that honest. The virtual caption is shown only when the owner is rendering
 * the *current value* (never a selectable row), only when the combo is not already the
 * selection (compared by provider *and* id), and only when the owner's provider/model really
 * is one of the routes this task's Lead or Sidekick answers on. A user switch to any other
 * model is therefore shown at once, even while the status poll still reports the previous
 * bound task; a switch onto one of the pair's own routes can read as the pinned combo until
 * the next poll (2s while the stage runs, 15s when it waits), which is the one bounded delay
 * this projection cannot avoid without the Host telling the client it was a user choice.
 *
 * Everything not overridden is the catalog's own label, in the owner's own order: the badge
 * before the name on the trigger, after it in the menu and in option rows, and never a badge
 * that the entry does not carry. No directory state is touched, so the physical route stays
 * the Host's business and the backend still dispatches the pair's model.
 */
export function FusionModelLabel({ sessionId, directory, load, provider, model, placement, selected }: FusionModelLabelProps) {
  const lang = useLang()
  const state = useSyncExternalStore(directory.subscribe, directory.getSnapshot)
  useEffect(() => { load() }, [load])
  const snapshot = useFusionStatus(sessionId, undefined, false, true)
  const status = snapshot?.status
  const bound = status !== undefined && status.selected
  const combo = status !== undefined && status.selected ? status.selection : undefined
  const virtual = combo === undefined || placement === 'option' || !selected
    || (combo.provider === provider.id && combo.model === model.id)
    || !isTaskRoute(status !== undefined && status.selected ? status.task : undefined, provider.id, model.id)
    ? undefined
    : catalogModel(state.groups, combo)
  if (virtual !== undefined) {
    return <span className="fusion-model-label" data-fusion-combo={virtual.id} title={virtual.name}>{virtual.name}</span>
  }
  // The owner's own caption, unchanged: plain name, or the entry's badge and name in the
  // order this placement uses (native ModelSelect renders the trigger badge first).
  if (model.badge === undefined) return <>{model.name}</>
  const badge = <Tag tone={model.badge.tone}>{badgeText(lang, model.badge.text)}</Tag>
  return placement === 'trigger'
    ? <>{badge}{' '}{model.name}</>
    : <>{model.name}{' '}{badge}</>
}
