import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store';
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client';
export interface FusionPermissionProps {
    sessionId: string;
    directory: ObservableSnapshot<ModelDirectoryState>;
    load(): void;
}
/**
 * The permission of the model working now. The composer's native permission control
 * belongs to the conversation (Lead) session, which Fusion confines to read-only, and
 * that confinement matches no configured preset — so the control reads Custom while a
 * task runs. This additive chip names the role and its mode, so the tool row never
 * shows an unexplained Custom alone.
 */
export declare function FusionPermission({ sessionId, directory, load }: FusionPermissionProps): import("react").JSX.Element | null;
