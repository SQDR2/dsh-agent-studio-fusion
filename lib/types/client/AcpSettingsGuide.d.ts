export interface ConfiguredRouteItem {
    route: string;
    displayName: string;
    command: string;
    args: string[];
}
/**
 * Pure helper deriving sorted configured ACP routes from the current ConfigForm snapshot.
 * Merges resolved configuration with user overrides and falls back displayName to route id.
 */
export declare function configuredRoutesOf(snapshot?: {
    value?: unknown;
    user?: unknown;
} | null): ConfiguredRouteItem[];
export declare function AcpSettingsGuide(): import("react").JSX.Element;
