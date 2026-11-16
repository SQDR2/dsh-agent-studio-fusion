/**
 * Pin the physical route where 0.2.2 allows it: the Agent's model selection.
 *
 * Fusion always kept two routes for one session. The *virtual* one is what the user
 * picked and what the model menu shows (`dsh-fusion/<combo>`); the *physical* one is the
 * pair's Lead or Worker route that actually answers. Until 0.2.2 the physical route was
 * applied per request by rewriting `agent/request`, which the loop now refuses: a proposal
 * that differs from the step's captured selection throws, and the guidance is to select
 * before step preparation.
 *
 * Step preparation reads `agent.model.current()` before any waterfall runs, so the last
 * synchronous point that can still influence a step is the turn boundary. Fusion pins the
 * physical route at `turn/start` and gives the user's own selection back at `turn/end`,
 * which leaves the model menu on the combo the user chose while never touching a step.
 *
 * A pin is an ordinary `model/selection` append, so two readers have to recognise it:
 * the native selection listener (which would otherwise read the pin as "the user picked
 * another model" and drain the task) and the model menu projection (which would otherwise
 * display the pair's Lead model). {@link isNativeRoutePin} answers both.
 *
 * The capability is `agent.model`, which 0.2.1 does not have at all: there the route is
 * still applied by the `agent/request` rewrite, and every function here is a no-op.
 */
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { PhysicalRoute } from '../contracts.js';
interface Selection {
    provider: string;
    model: string;
    reasoningEffort?: string;
}
/** Whether this Host requires the route to be selected before step preparation. */
export declare function requiresSelectedRoute(agent: Agent): boolean;
/**
 * Remember the selection the user made, so a later pin can be undone.
 * @param agent - the Agent the selection belongs to.
 * @param selection - the recorded `model/selection` payload.
 */
export declare function recordNativeIntent(agent: Agent, selection: Selection): void;
/**
 * Whether one recorded selection is Fusion's own pin rather than a user choice.
 * @param agent - the Agent the event belongs to.
 * @param selection - the recorded `model/selection` payload.
 * @returns true when Fusion recorded it to route a step.
 */
export declare function isNativeRoutePin(agent: Agent, selection: Selection): boolean;
/**
 * Make the physical route the step's selection, if it is not already.
 *
 * Called synchronously at the running reservation, before prompt assembly and before the
 * loop reads the selection. Whatever the selection was at that moment becomes the intent
 * {@link restoreNativeIntent} gives back, so the restore does not depend on any other
 * listener having observed the user's own choice.
 * @param agent - the Agent whose next step must use this route.
 * @param route - the physical route frozen for this role and task.
 * @returns whether a new selection was recorded.
 */
export declare function pinNativeRoute(agent: Agent, route: PhysicalRoute): boolean;
/**
 * Give the session's recorded choice back to the user's own intent at `turn/end`.
 *
 * Without this the durable pin would be the last recorded selection, so the model menu
 * would show the pair's Lead model instead of the combo. The next turn pins again, which
 * is correct: a task rollover can change the route, and pinning is skipped when the
 * selection already matches.
 * @param agent - the Agent to restore.
 * @returns whether a different selection was recorded.
 */
export declare function consumeNativePin(agent: Agent): void;
/**
 * Whether a completed turn ran under a pin, so the user's choice has to be restored.
 * @param agent - the Agent whose turn just ended.
 * @returns whether a pin was consumed and has not been restored yet.
 */
export declare function consumedNativePin(agent: Agent): boolean;
export declare function restoreNativeIntent(agent: Agent): boolean;
export {};
