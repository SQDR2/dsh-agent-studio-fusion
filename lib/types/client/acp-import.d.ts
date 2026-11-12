import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client';
export type JsonValue = string | number | boolean | null | JsonValue[] | {
    [key: string]: JsonValue;
};
export type JsonObject = Record<string, JsonValue>;
/** Fields an import owns; anything else on an existing route (permission, models, …) is kept. */
export declare const IMPORTED_KEYS: readonly ["displayName", "command", "args", "env"];
export declare const LIST_KEYS: readonly ["agent_servers", "agentServers", "agents"];
export declare const ROUTE_PATTERN: RegExp;
export interface AgentImportEntry {
    /** Name as written in the source configuration. */
    name: string;
    route: string;
    /** Whether a configured route of the same id is overwritten (its other fields are kept). */
    replaces: boolean;
    profile: JsonObject;
}
export interface AgentImportIssue {
    name: string;
    reason: 'importMissingCommand' | 'importBadArgs' | 'importBadEnv';
}
export type AgentImport = {
    ok: true;
    entries: AgentImportEntry[];
    skipped: AgentImportIssue[];
} | {
    ok: false;
    error: string;
};
export type SettingsPathOpView = {
    op: 'set';
    path: string[];
    value: JsonValue;
} | {
    op: 'unset';
    path: string[];
};
/** Turn a client-side display name into a route id; empty for names with no ASCII letters or digits. */
export declare function routeOf(name: string): string;
export interface ExistingAgentInfo {
    raw?: Record<string, unknown>;
    resolved?: Record<string, unknown>;
}
export declare function existingRoutesOf(existing?: readonly {
    route: string;
    user?: unknown;
    profile?: unknown;
}[] | Record<string, unknown> | ReadonlyMap<string, unknown> | {
    value?: unknown;
    user?: unknown;
}): Map<string, ExistingAgentInfo>;
/**
 * Parse pasted JSON into importable agents. Routes are derived from the entry names and
 * de-duplicated within the import; a route that already exists is marked as a replacement.
 */
export declare function parseAgentImport(text: string, existingInput?: readonly {
    route: string;
    user?: unknown;
    profile?: unknown;
}[] | Record<string, unknown> | ReadonlyMap<string, unknown> | {
    value?: unknown;
    user?: unknown;
}): AgentImport;
/** One atomic write storing every imported agent under `acp.agents`. */
export declare function importOpsOf(entries: readonly AgentImportEntry[]): SettingsPathOpView[];
export interface AcpFormSnapshot<T = any> {
    status: 'loading' | 'ready' | 'unavailable';
    value: T | undefined;
    base: unknown;
    user: unknown;
    revision: number | undefined;
    writable: boolean;
    mode?: 'host' | 'memory';
}
/** Bind the dsh-fusion ConfigForm instance to an external store readable by React. */
export declare function bindAcpConfigForm(form: ConfigForm<any>): () => void;
export declare function subscribeAcpConfigForm(listener: () => void): () => void;
export declare function getAcpConfigFormSnapshot(): AcpFormSnapshot;
export declare function getAcpConfigForm(): ConfigForm<any> | undefined;
export declare function useAcpConfigForm(): AcpFormSnapshot & {
    form: ConfigForm<any> | undefined;
};
