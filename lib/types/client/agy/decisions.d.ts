/**
 * Insert text directly into DSH's chat composer
 */
export declare function insertTextIntoChatComposer(text: string): boolean;
/**
 * Scan DOM for decision prompts and mount interactive choice chips.
 *
 * IDEMPOTENCE (incident 2026-10-23 — "scroll back and forth = insane flashing"):
 * DSH renders these containers inside a TanStack-Virtual list with dynamic
 * measurement (`measureElement` + `anchorTo:"start"`). Injecting a toolbar
 * changes the measured item height, which makes the virtualizer rewrite
 * scrollTop; the resulting re-render rebuilds the markdown/heading nodes
 * (dropping the per-HEADING guard) and this scanner injected the toolbar
 * again — growth on every scroll pass, i.e. a flashing flywheel.
 *
 * Two independent guards now make injection strictly once-per-container:
 *   1. `data-agy-decisions-scanned` on the container, written on EVERY pass
 *      (it used to be read here but never assigned anywhere in the codebase),
 *   2. "a toolbar already exists in this container" — survives React
 *      rebuilding the heading nodes during a virtualizer remount.
 */
export declare function scanAndEnhanceDecisions(): void;
export declare function installDecisionChips(): () => void;
