import { describe, expect, it } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { FUSION_MODEL, FUSION_PROVIDER } from '../src/identity.js'
import { pinNativeRoute } from '../src/host/route-pin.js'
import { installNativeFusionSelection } from '../src/host/native-selection.js'

/**
 * Fusion keeps two routes per session: the combo the user picked in the native model menu
 * (`dsh-fusion/<combo>`) and the pair's Lead route that actually answers. On a 0.2.2 Host
 * the Lead route has to be the recorded selection *before* a step is prepared, so Fusion
 * pins it at the turn boundary — which also makes it the newest `model/selection` event,
 * and therefore what the composer's model menu reads as `modelSelection.next`.
 *
 * The pin was never given back: session-7f326880 opened on the combo "6.1 --> Gemini 3.8"
 * and the composer showed `gz/gpt-5.6-sol` for the whole task, because nothing restored the
 * user's own selection when the turn settled. These cases pin that restore.
 */

interface Recorded { type: string; data: Record<string, unknown> }

function harness() {
  const events: Recorded[] = []
  const handlers = new Map<string, ((...args: unknown[]) => unknown)[]>()
  const lastSelection = () => events.findLast(event => event.type === 'model/selection')?.data
  const emit = (name: string, ...args: unknown[]) => { for (const handler of handlers.get(name) ?? []) handler(...args) }
  // The Session surface `installNativeFusionSelection` touches: it appends through the log
  // so the plugin's own `session/event` listener observes exactly what a Host would emit.
  const session = {
    id: 'session-1',
    header: {},
    append: (type: string, data: Record<string, unknown>) => {
      const event = { type, data }
      events.push(event)
      if (type === 'model/selection') emit('session/event', session, event)
    },
    snapshotEvents: () => events,
  }
  const agent = {
    id: 'session-1',
    status: 'running',
    session,
    cancel: () => {},
    model: { current: lastSelection, select: (selection: Record<string, unknown>) => { session.append('model/selection', selection) } },
  } as unknown as Agent
  // The session already runs a Fusion task, so the combo is `selected` and a pin is never a
  // "the user switched model" drain.
  const coordinator = {
    bindings: { read: () => ({ binding: { selected: true, profile: { id: `fusion-${FUSION_MODEL}` } } }) },
    pause: async () => {},
    clear: async () => {},
    selectBeforeAssembly: () => {},
    pinRoute: () => {},
  }
  const ctx = {
    on: (name: string, handler: (...args: unknown[]) => unknown) => {
      const list = handlers.get(name) ?? []
      list.push(handler)
      handlers.set(name, list)
      return () => {}
    },
    agents: { get: (id: string) => id === session.id ? agent : undefined },
  }
  const dispose = installNativeFusionSelection(ctx as never, {
    coordinator: () => coordinator as never, profile: () => undefined, selection: () => undefined,
  })
  /** One Host turn: the log records `turn/end`, then the Agent's status settles to idle. */
  const settle = (turn: number) => {
    session.append('turn/end', { turn, reason: { kind: 'completed' } })
    ;(agent as unknown as { status: string }).status = 'idle'
    emit('agent/status', { agent, status: 'idle' })
  }
  const startTurn = () => {
    ;(agent as unknown as { status: string }).status = 'running'
    emit('agent/status', { agent, status: 'running' })
  }
  return { agent, events, session, lastSelection, settle, startTurn, dispose }
}

const menuCombo = { provider: FUSION_PROVIDER, model: FUSION_MODEL }
const lead = { provider: 'gz', model: 'gpt-5.6-sol', reasoningEffort: 'high' }

describe('the model menu after a pinned Fusion turn', () => {
  it('gives the combo back when the turn settles instead of leaving the pair Lead on display', () => {
    const { agent, session, lastSelection, settle } = harness()
    session.append('model/selection', menuCombo)
    // The Host fixes a step's route before any listener runs, so Fusion pins the Lead.
    expect(pinNativeRoute(agent, lead)).toBe(true)
    expect(lastSelection()).toEqual(lead)

    settle(1)

    // `modelSelection.next` is `pending ?? lastUsed`, so the newest recorded selection is
    // what the composer shows: it has to name the combo again, not the Lead.
    expect(lastSelection()).toEqual(menuCombo)
  })

  it('leaves a turn that ran no pin alone', () => {
    const { events, session, settle } = harness()
    session.append('model/selection', { provider: 'gz', model: 'deepseek-v4.1-flash' })
    const selections = events.filter(event => event.type === 'model/selection').length

    settle(1)

    expect(events.filter(event => event.type === 'model/selection')).toHaveLength(selections)
  })

  it('pins and restores once per turn, so a settled turn queues no second switch', () => {
    const { agent, session, events, settle, startTurn } = harness()
    session.append('model/selection', menuCombo)
    pinNativeRoute(agent, lead)
    settle(1)
    const settled = events.length

    // The next turn pins again (the route can change with a task rollover) and restores
    // again when it settles; the combo the user picked is already recorded, so the running
    // reservation must not append a second copy of it.
    startTurn()
    pinNativeRoute(agent, lead)
    settle(2)

    expect(events.slice(settled).map(event => event.type)).toEqual(['model/selection', 'turn/end', 'model/selection'])
  })
})
