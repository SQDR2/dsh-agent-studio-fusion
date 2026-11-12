// Scroll-activity coordinator shared by the Antigravity helpers.
//
// Ported from dsh-agy-worker (`src/client/scroll-guard.ts`), MIT License,
// Copyright (c) 2026 dsh-agy-worker contributors; dsh-agy-worker is a fork of
// dsh-agy-link (https://github.com/amlyczz/dsh-agy-link). See
// docs/ATTRIBUTION-AGY.md.
//
// Fusion keeps the coordinator as a shared primitive (the console suspends the
// overlay scanners while it composites), not as a page-wide listener installed by
// a client entry: `ensureScrollListener` is called only from the helpers that
// actually need it.

let isScrolling = false;
let scrollTimer: ReturnType<typeof setTimeout> | null = null;
let listenerAttached = false;
const settleListeners = new Set<() => void>();

// An overlay (the Antigravity console) can own the screen without the page
// scrolling. While it is open we must ALSO stop the overlay scanners from
// mutating the conversation behind it: every injected node changes layout, and
// with a full-screen compositing layer on top that turns into visible flashing.
// This flag is the single source of truth for "an overlay owns the screen".
let overlaySuspended = false;

function onScrollActivity(): void {
	isScrolling = true;
	if (scrollTimer !== null) clearTimeout(scrollTimer);
	scrollTimer = setTimeout(() => {
		isScrolling = false;
		scrollTimer = null;
		for (const fn of settleListeners) {
			try { fn(); } catch { /* ignore listener errors */ }
		}
	}, 150);
}

export function isScrollActive(): boolean {
	return isScrolling;
}

/**
 * Suspend every overlay scanner while a modal/overlay owns the screen.
 *
 * Opening the Antigravity console must freeze the conversation behind it: any
 * DOM the scanners inject while the panel composites on top becomes visible
 * flashing, and the modal's own periodic re-renders keep waking the global
 * observers. On resume we fire the settle listeners once so scanners catch up
 * on anything that changed while they were held back.
 */
export function setOverlaySuspended(active: boolean): void {
	if (overlaySuspended === active) return;
	overlaySuspended = active;
	if (!active) {
		for (const fn of settleListeners) {
			try { fn(); } catch { /* ignore listener errors */ }
		}
	}
}

export function isOverlaySuspended(): boolean {
	return overlaySuspended;
}

/**
 * The one predicate every overlay scanner should gate on: may I mutate the DOM
 * right now? False during an active scroll gesture AND while an overlay owns
 * the screen. Scanners must not act while this is true.
 */
export function isInteractionLocked(): boolean {
	return isScrolling || overlaySuspended;
}

/** Set scroll active state explicitly (useful for testing or programmatic scrolls). */
export function setScrollActiveForTest(active: boolean): void {
	isScrolling = active;
}

/** Register a callback to run once scrolling has settled. Returns an unregister function. */
export function onScrollSettle(fn: () => void): () => void {
	ensureScrollListener();
	settleListeners.add(fn);
	return () => {
		settleListeners.delete(fn);
	};
}

export function ensureScrollListener(): void {
	if (typeof window === 'undefined' || typeof window.addEventListener !== 'function' || listenerAttached) return;
	listenerAttached = true;
	window.addEventListener('scroll', onScrollActivity, { passive: true, capture: true });
	window.addEventListener('wheel', onScrollActivity, { passive: true, capture: true });
}

export function disposeScrollListener(): void {
	if (typeof window === 'undefined' || typeof window.removeEventListener !== 'function' || !listenerAttached) return;
	window.removeEventListener('scroll', onScrollActivity, true);
	window.removeEventListener('wheel', onScrollActivity, true);
	listenerAttached = false;
	if (scrollTimer !== null) {
		clearTimeout(scrollTimer);
		scrollTimer = null;
	}
	settleListeners.clear();
	isScrolling = false;
	overlaySuspended = false;
}
