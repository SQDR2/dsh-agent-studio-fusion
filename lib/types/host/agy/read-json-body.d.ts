/** Default cap: plugin payloads are tiny config JSON; 1 MiB is already generous. */
export declare const DEFAULT_JSON_BODY_MAX_BYTES: number;
export interface ReadJsonBodyOptions {
    /** Max buffered bytes. Bodies larger than this resolve with `tooLarge: true`. */
    maxBytes?: number;
}
export interface ReadJsonBodyResult {
    /** Parsed object (never an array/primitive), or {} when invalid / too large. */
    value: Record<string, unknown>;
    /** True when the body exceeded `maxBytes` and was discarded. */
    tooLarge: boolean;
    /** True when the body was absent or not a JSON object. */
    invalid: boolean;
}
export declare function readJsonBody(req: unknown, opts?: ReadJsonBodyOptions): Promise<ReadJsonBodyResult>;
