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
 * physical route there and gives the user's own selection back when the turn settles,
 * which leaves the model menu on the combo the user chose while never touching a step.
 * {@link restoreNativeIntent} is that second half; leaving the pin as the last recorded
 * selection would make the menu name the pair's Lead model from then on. A pinned turn
 * therefore does show the Lead while it runs — the Host fixes a step's route before any
 * listener can run — and the combo comes back when the Agent goes idle.
 *
 * A pin is an ordinary `model/selection` append, so two readers have to recognise it:
 * the native selection listener (which would otherwise read the pin as "the user picked
 * another model" and drain the task) and the model menu projection (which would otherwise
 * display the pair's Lead model, which is what the settle-time restore above undoes).
 * {@link isNativeRoutePin} answers both.
 *
 * The capability is `agent.model`, which 0.2.1 does not have at all: there the route is
 * still applied by the `agent/request` rewrite, and every function here is a no-op.
 */

import type { Agent } from '@deepseek-ai/dsh-agent'
import type { PhysicalRoute } from '../contracts.js'

interface Selection { provider: string; model: string; reasoningEffort?: string }

/** Structural view of the 0.2.2 `Agent.model` member. */
interface AgentModelSeam {
  current(): Selection | undefined
  select(selection: Selection): void
}

/** The route Fusion itself recorded per Agent, so its own appends are recognisable. */
const pins = new WeakMap<Agent, Selection>()
/** The user's own last selection, restored after each pinned turn. */
const intents = new WeakMap<Agent, Selection>()

/** The Agent's model seam, or undefined on a Host that has no Agent-owned selection. */
function seam(agent: Agent): AgentModelSeam | undefined {
  const model = (agent as { model?: Partial<AgentModelSeam> }).model
  return typeof model?.select === 'function' && typeof model.current === 'function'
    ? model as AgentModelSeam : undefined
}

/** Whether this Host requires the route to be selected before step preparation. */
export function requiresSelectedRoute(agent: Agent): boolean {
  return seam(agent) !== undefined
}

/**
 * Remember the selection the user made, so a later pin can be undone.
 * @param agent - the Agent the selection belongs to.
 * @param selection - the recorded `model/selection` payload.
 */
export function recordNativeIntent(agent: Agent, selection: Selection): void {
  intents.set(agent, { provider: selection.provider, model: selection.model,
    ...(selection.reasoningEffort === undefined ? {} : { reasoningEffort: selection.reasoningEffort }) })
}

/**
 * Whether one recorded selection is Fusion's own pin rather than a user choice.
 * @param agent - the Agent the event belongs to.
 * @param selection - the recorded `model/selection` payload.
 * @returns true when Fusion recorded it to route a step.
 */
export function isNativeRoutePin(agent: Agent, selection: Selection): boolean {
  const route = pins.get(agent)
  return route !== undefined && route.provider === selection.provider && route.model === selection.model
    && route.reasoningEffort === selection.reasoningEffort
}

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
export function pinNativeRoute(agent: Agent, route: PhysicalRoute): boolean {
  const model = seam(agent)
  if (model === undefined) return false
  const next: Selection = { provider: route.provider, model: route.model,
    ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: route.reasoningEffort }) }
  const current = model.current()
  if (current !== undefined && current.provider === next.provider && current.model === next.model
    && current.reasoningEffort === next.reasoningEffort) return false
  // Only a selection that is not itself one of our pins is the user's own choice. A pin
  // left over from a turn whose restore could not run (an aborted turn, a Host restart)
  // must not become the intent, or the next restore would re-pin it as the user's choice.
  if (current !== undefined && !isNativeRoutePin(agent, current)) intents.set(agent, current)
  pins.set(agent, next)
  model.select(next)
  return true
}

/**
 * Give the model menu the user's own selection back once a pinned turn settles.
 *
 * Without this the durable pin stays the last recorded selection, so every later `next`
 * the menu projection reads is the pair's Lead model instead of the combo the user picked:
 * the composer showed `gz/gpt-5.6-sol` for a session the user opened on a Fusion combo, and
 * it never went back. The restore is unconditional because a pin is only ever Fusion's own
 * append, and it is a no-op when the recorded selection already is the user's choice. The
 * next turn pins again, which is correct: a task rollover can change the route, and pinning
 * is skipped when the selection already matches.
 *
 * The native selection listener calls this from the Agent's `running` → `idle` transition,
 * which is the same moment as `turn/end` but outside the append that publishes `turn/end`:
 * a Session refuses to append while another append is being published, so the restore
 * cannot run from the `turn/end` event itself.
 * @param agent - the Agent to restore.
 * @returns whether a different selection was recorded.
 */
export function restoreNativeIntent(agent: Agent): boolean {
  const model = seam(agent), intent = intents.get(agent)
  if (model === undefined || intent === undefined) return false
  const current = model.current()
  if (current !== undefined && current.provider === intent.provider && current.model === intent.model
    && current.reasoningEffort === intent.reasoningEffort) return false
  pins.delete(agent)
  model.select(intent)
  return true
}
