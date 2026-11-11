/**
 * Runtime detection for the DSH subagent seam.
 * 0.2.1 renamed continuable start/drain and removed `ctx.subagents.start`; the supported
 * baseline is `>=0.2.1-rc.5 <0.3.0-0`. The older names remain as a feature-detection
 * fallback only — callers branch on the function that is actually present, never on a
 * version string.
 */
export declare const supportedDshVersions = ">=0.2.1-rc.5 <0.3.0-0";
export declare function hasStartActivation(subagents: object): boolean;
/** Prefer `primary` (the 0.2.1 name) when both exist. */
export declare function requireSubagentMethod(subagents: object, primary: string, fallback: string): string;
