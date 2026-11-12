/** Structural subset of ImageAttachmentRef (no package import needed). */
export interface ImageRefLike {
    attachmentId: string;
    mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
    bytes: number;
    width: number;
    height: number;
    name?: string;
}
/** Byte reader seam — index.ts injects ctx.attachments.readImage. */
export type ImageReader = (ref: ImageRefLike) => Promise<Uint8Array | null>;
export interface StagedImage {
    path: string;
    name: string;
    width: number;
    height: number;
    bytes: number;
    attachmentId: string;
}
export interface StageResult {
    /** Lines appended to the prompt (empty string when nothing staged). */
    promptSuffix: string;
    staged: StagedImage[];
    /** Attachment ids that were actually written (not skipped/unreadable). */
    stagedIds: string[];
    /** Number of images skipped (over cap, over size, unreadable). */
    skipped: number;
}
/**
 * Deterministic staged path keyed by the attachment id (not the call index):
 * the same picture always lands on the same file, so a continuation that
 * legitimately re-references it overwrites instead of accumulating copies.
 */
export declare function stagedPath(dir: string, key: string, attachmentId: string, mediaType: ImageRefLike['mediaType']): string;
/**
 * Stage up to `maxImages` images into `dir`, returning prompt lines that
 * reference them by absolute path. Deterministic names mean a retried or
 * replayed turn overwrites the same file instead of accumulating copies.
 */
export declare function stageImages(opts: {
    dir: string;
    key: string;
    images: readonly ImageRefLike[];
    readImage: ImageReader;
    maxImages: number;
    maxBytes: number;
}): Promise<StageResult>;
/**
 * Delete staged files older than `ttlMs`. Returns the removed count.
 * Never throws: a failed sweep logs nothing and retries on the next pass.
 */
export declare function sweepDir(dir: string, ttlMs: number, now?: number): Promise<number>;
/** Default media directory: <dsh home>/agy-worker/media. */
export declare function defaultMediaDir(stateDir: string): string;
