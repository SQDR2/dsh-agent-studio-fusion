/** Unique temp path beside `file` (same directory, so rename stays atomic). */
export declare function atomicTmpPath(file: string): string;
/** Write `data` to `file` atomically; on any failure remove the temp file. */
export declare function writeFileAtomicSync(file: string, data: string): void;
