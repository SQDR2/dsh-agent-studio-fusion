import type { PluginConfig } from './types.js';
import type { ModelCatalog } from './models.js';
import type { SessionStore } from './sessions.js';
export interface DoctorDeps {
    cfg: () => PluginConfig;
    bin: () => string | null;
    version: () => string | null;
    catalog: () => ModelCatalog;
    store: () => SessionStore;
    recentLines: () => readonly string[];
}
/**
 * Redact user:pass credentials from a proxy URL for display in command output
 * and reports. The full URL (with embedded credentials) stays in config only.
 */
export declare function redactProxyUrl(url: string): string;
/** Redact auth URLs, long tokens, and authorization codes. */
export declare function redactLine(line: string): string;
export declare function writeDoctorReport(deps: DoctorDeps): string;
