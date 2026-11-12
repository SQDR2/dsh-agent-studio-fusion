export declare function isScrollActive(): boolean;
/**
 * Suspend every overlay scanner while a modal/overlay owns the screen.
 *
 * Opening the Antigravity console must freeze the conversation behind it: any
 * DOM the scanners inject while the panel composites on top becomes visible
 * flashing, and the modal's own periodic re-renders keep waking the global
 * observers. On resume we fire the settle listeners once so scanners catch up
 * on anything that changed while they were held back.
 */
export declare function setOverlaySuspended(active: boolean): void;
export declare function isOverlaySuspended(): boolean;
/**
 * The one predicate every overlay scanner should gate on: may I mutate the DOM
 * right now? False during an active scroll gesture AND while an overlay owns
 * the screen. Scanners must not act while this is true.
 */
export declare function isInteractionLocked(): boolean;
/** Set scroll active state explicitly (useful for testing or programmatic scrolls). */
export declare function setScrollActiveForTest(active: boolean): void;
/** Register a callback to run once scrolling has settled. Returns an unregister function. */
export declare function onScrollSettle(fn: () => void): () => void;
export declare function ensureScrollListener(): void;
export declare function disposeScrollListener(): void;
