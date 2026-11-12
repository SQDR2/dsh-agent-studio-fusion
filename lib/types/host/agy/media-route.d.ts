/**
 * Normalize and resolve a raw path or file:// URL into a system file path.
 * Converts WSL /mnt/X/ and /home/ paths on Windows where possible.
 */
export declare function resolveLocalMediaPath(rawPath: string, workspaceRoot?: string): string | null;
export interface HttpResponseLike {
    writeHead(status: number, headers: Record<string, string | number>): unknown;
    end(body?: unknown): unknown;
}
export interface HttpRequestLike {
    url?: string;
    method?: string;
}
/**
 * Handle GET /plugins/agy-worker/media?path=...
 */
export declare function handleMediaRequest(req: HttpRequestLike, res: HttpResponseLike, opts?: {
    workspaceRoot?: string;
}): void;
/**
 * Handle static assets under /plugins/agy-worker/assets/...
 */
export declare function handleAssetRequest(req: HttpRequestLike, res: HttpResponseLike, assetDir: string): void;
