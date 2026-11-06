import type { PhysicalRoute } from '../contracts.js';
import type { PairChoice, SettingsCatalog } from '../host/settings.js';
/** One saved combo as the page shows it: its id, its label and its pair. */
export interface SavedPairView {
    id: string;
    name: string;
    pair: PairChoice;
    authorized: boolean;
    reason?: string;
}
export declare function ModelChoice({ role, route, catalog, onChange }: {
    role: 'Lead' | 'Sidekick' | 'compactor';
    route?: PhysicalRoute;
    catalog: SettingsCatalog;
    onChange(route: PhysicalRoute | undefined): void;
}): import("react").JSX.Element;
export declare function FusionSettings(): import("react").JSX.Element;
