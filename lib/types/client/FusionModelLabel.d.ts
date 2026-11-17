import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store';
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client';
import { type TagTone } from '@deepseek-ai/dsh-client-ui-primitives';
/** One literal, or translations keyed by lowercase language id with a required English entry. */
type Localized = string | {
    readonly en: string;
    readonly [locale: string]: string;
};
/**
 * One catalog entry as the model seat shows it: the fields the label reads.
 *
 * Structural rather than the Host's `ModelCatalogModel` so that both the badge-carrying
 * catalog and a catalog that declares none type-check here; the owner always passes the
 * full entry, and this type only names what a label may rely on.
 */
export interface ComposerModelLabelModel {
    readonly id: string;
    readonly name: string;
    readonly badge?: {
        readonly text: Localized;
        readonly tone?: TagTone;
    };
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
    readonly provider: {
        readonly id: string;
        readonly name: string;
    };
    /** The exact provider's model catalog entry. */
    readonly model: ComposerModelLabelModel;
    /** Trigger caption, root-menu current value, or selectable model row. */
    readonly placement: 'trigger' | 'menu' | 'option';
    /** Whether this provider/model pair is the current selection. */
    readonly selected: boolean;
}
export interface FusionModelLabelProps extends ComposerModelLabelOwner {
    sessionId: string;
    directory: ObservableSnapshot<ModelDirectoryState>;
    load(): void;
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
export declare function FusionModelLabel({ sessionId, directory, load, provider, model, placement, selected }: FusionModelLabelProps): import("react").JSX.Element;
export {};
