/** Build media URL from path */
export declare function buildMediaUrl(rawPath: string): string;
/**
 * Open fullscreen Lightbox modal
 */
export declare function openLightbox(src: string, title?: string, rawPath?: string): void;
/** Check if a URL or path is an image */
export declare function isImageFile(pathOrUrl: string): boolean;
/**
 * Scan DOM for imageAlt spans and enhance them with live rendered images
 */
export declare function scanAndEnhanceImages(): void;
export declare function installImageEnhancer(): () => void;
