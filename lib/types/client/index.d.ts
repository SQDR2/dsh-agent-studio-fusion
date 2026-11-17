import type { Context } from '@deepseek-ai/cordis';
import { type ComposerModelLabelOwner } from './FusionModelLabel.js';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        'main': {
            kind: 'keyed';
            scope: 'root';
        };
        'sidebar.panellist': {
            kind: 'list';
            scope: 'root';
            owner: {
                size: number;
                active: boolean;
            };
        };
        /**
         * The composer model seat's inline label: a single non-interactive contribution the seat
         * renders in place of the catalog name (trigger, root-menu value, option rows).
         *
         * The seat declares it, so this entry claims nothing at runtime — it only types the
         * registration below. It is declared here because the composer's own slot table lives in
         * the Host's conversation/model-selection entries, and this checkout compiles against
         * published types that predate the extension point.
         */
        'conversation.input.model.label': {
            kind: 'single';
            scope: 'session';
            owner: ComposerModelLabelOwner;
        };
    }
}
export declare const name = "dsh-agent-studio-fusion/client";
export declare const inject: string[];
export declare const FUSION_PANEL_ID = "fusion";
export { FusionPanelIcon } from './FusionPanelIcon.js';
export declare function apply(ctx: Context): void;
