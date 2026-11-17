import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store';
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client';
export interface FusionPermissionProps {
    sessionId: string;
    directory: ObservableSnapshot<ModelDirectoryState>;
    load(): void;
}
/**
 * The role, model and permission of the work happening now.
 *
 * Additive: the composer's native permission control keeps its slot, its state and its own
 * meaning. That control follows the conversation (Lead) session, which Fusion confines to
 * read-only, and the confinement matches no configured preset — so it reads Custom while a
 * task runs. This chip names the role, its model and its mode, so the tool row never shows
 * an unexplained Custom alone.
 *
 * Visibility follows the durable task, never the composer's current selection. While a turn
 * runs, Fusion pins the pair's physical route as the recorded `model/selection`, so the
 * native selection is the Lead's route — reading it as "not Fusion" hid this chip for the
 * whole pinned turn, which is exactly when it is wanted. An explicit switch away from Fusion
 * clears the binding, and the chip goes with it.
 */
export declare function FusionPermission({ sessionId, directory, load }: FusionPermissionProps): import("react").JSX.Element | null;
