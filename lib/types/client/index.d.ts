import type { Context } from '@deepseek-ai/cordis';
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
    }
}
export declare const name = "dsh-fusion/client";
export declare const inject: string[];
export declare const FUSION_PANEL_ID = "fusion";
export { FusionPanelIcon } from './FusionPanelIcon.js';
export declare function apply(ctx: Context): void;
