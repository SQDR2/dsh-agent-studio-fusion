/**
 * Request-image geometry for ACP routes.
 *
 * Ported from deepseek-harness-acp (https://github.com/Fleey/deepseek-harness-acp),
 * MIT License, Copyright (c) 2026 Fleey. See docs/ATTRIBUTION-ACP.md.
 */
/** Pixel and byte ceilings one route accepts for a request image. */
export interface RequestImageBudget {
    maxPixels: number;
    maxBytes: number;
}
/**
 * What `attachments.readImageRequest` resizes to: exact dimensions, not a policy. The
 * attachment store keys its cached versions by these numbers, so a target built the way the
 * built-in routes build theirs reuses their encoded version instead of making another one.
 */
export interface RequestImageTarget {
    width: number;
    height: number;
    maxBytes: number;
}
/**
 * Aspect-preserving integer dimensions inside a total-pixel budget: rounded inward, never
 * enlarging. Same geometry `@deepseek-ai/dsh-attachment` applies, reproduced here because the
 * host supplies that package at runtime and this plugin bundles none of it.
 */
export declare function requestImageDimensions(width: number, height: number, maxPixels: number): {
    width: number;
    height: number;
};
/** The request target for one durable image reference, which carries the source dimensions. */
export declare function requestImageTarget(ref: unknown, budget: RequestImageBudget): RequestImageTarget;
