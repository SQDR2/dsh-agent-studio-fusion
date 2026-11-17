import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client';
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store';
export interface FusionHintProps {
    sessionId: string;
    directory: ObservableSnapshot<ModelDirectoryState>;
    load(): void;
}
/**
 * Additive composer hint. The original selector and its selection state stay native.
 *
 * Whether this conversation is Fusion's is read from the durable task first and from the
 * native selection second. While a turn is pinned the native selection is the pair's
 * physical route, so the selection alone would call the session non-Fusion for the whole
 * turn and take the hint (and the attention status beside it) away exactly then.
 */
export declare function FusionHint({ sessionId, directory, load }: FusionHintProps): import("react").JSX.Element | null;
