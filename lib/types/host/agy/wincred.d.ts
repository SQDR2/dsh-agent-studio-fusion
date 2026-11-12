export declare function invalidateWindowsCredentialCache(): void;
/** Read raw UTF-8 credential blob from Windows Credential Manager (with short-lived in-memory caching). */
export declare function readWindowsCredentialRaw(target?: string, maxAgeMs?: number): string | null;
/** Write UTF-8 credential blob into Windows Credential Manager. */
export declare function writeWindowsCredentialRaw(secret: string, target?: string, userName?: string): boolean;
/** Delete a credential from Windows Credential Manager. */
export declare function deleteWindowsCredentialRaw(target?: string): boolean;
/** Parse Windows WinINet ProxyServer string (supports single or multi-protocol format). */
export declare function parseWindowsProxyServer(raw: string): string;
/**
 * Parse macOS `scutil --proxy` dictionary output.
 * Keys of interest:
 *   HTTPEnable : 1
 *   HTTPPort : 7890
 *   HTTPProxy : 127.0.0.1
 *   HTTPSEnable : 1
 *   HTTPSPort : 7890
 *   HTTPSProxy : 127.0.0.1
 *   SOCKSEnable : 1
 *   SOCKSPort : 7890
 *   SOCKSProxy : 127.0.0.1
 */
export declare function parseMacScutilProxy(raw: string): string | undefined;
/** Invalidate cached proxy detection (useful in tests). */
export declare function invalidateProxyCache(): void;
/**
 * Detect system proxy configuration across Windows, macOS, and Linux.
 * Priority:
 * 1. Standard environment variables (HTTPS_PROXY, HTTP_PROXY, ALL_PROXY, and lowercase)
 * 2. Windows Registry (HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings)
 * 3. macOS scutil (--proxy)
 * 4. Linux desktop system proxy (GNOME gsettings)
 * Results are cached for 5 minutes (300s) to minimize subprocess and registry queries.
 */
export declare function detectSystemProxy(platform?: NodeJS.Platform): string | undefined;
