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
 *
 * They also pin the other half: a pin is recognised only while Fusion itself is publishing
 * it. `gz/gpt-6.1-sol` (the Lead) and `gz/deepseek-v4.1-flash` (the Sidekick) are ordinary
 * models a user may pick by hand, and a session that picked one has left Fusion — reading
 * that pick as a leftover pin is what turned a DeepSeek session back into a Fusion task.
 */

interface Recorded { type: string; data: Record<string, unknown> }

function harness(initial: 'running' | 'idle' = 'running') {
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
  /** A restart's log: the durable events are already there and publish no new event. */
  const seed = (type: string, data: Record<string, unknown>) => { events.push({ type, data }) }
  const agent = {
    id: 'session-1',
    status: initial,
    session,
    cancel: () => {},
    model: { current: lastSelection, select: (selection: Record<string, unknown>) => { session.append('model/selection', selection) } },
  } as unknown as Agent
  // The session already runs a Fusion task, so the combo is `selected` and a pin is never a
  // "the user switched model" drain. `clear` really leaves Fusion, as the coordinator's does:
  // the drain's effect on every later guard is the thing under test.
  let selected = true
  let drained = 0
  const coordinator = {
    bindings: { read: () => ({ binding: { selected, profile: {
      id: `fusion-${FUSION_MODEL}`, lead: { provider: 'gz', model: 'gpt-6.1-sol' }, worker: { provider: 'gz', model: 'deepseek-v4.1-flash' },
    } } }) },
    pause: async () => {},
    clear: async () => { drained += 1; selected = false },
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
    coordinator: () => coordinator as never, profile: () => undefined,
    // The Host's own view of the durable intent: the newest recorded selection, or the
    // frozen binding's combo when the log has none. A restart has only this.
    selection: () => lastSelection() as { provider: string; model: string } | undefined,
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
  /** Drive the registered `agent/request` guard the way the Host's waterfall does. */
  const request = async () => {
    const guard = handlers.get('agent/request')?.[0]
    if (guard === undefined) throw new Error('no agent/request guard installed')
    const config = { provider: 'gz', model: 'gpt-6.1-sol' }
    return guard({ agent, turn: 1, step: 1, signal: new AbortController().signal }, async () => config)
  }
  const tick = () => new Promise(resolve => setTimeout(resolve, 0))
  return { agent, events, session, seed, lastSelection, settle, startTurn, request, tick,
    drained: () => drained, selected: () => selected, dispose }
}

const menuCombo = { provider: FUSION_PROVIDER, model: FUSION_MODEL }
const lead = { provider: 'gz', model: 'gpt-5.6-sol', reasoningEffort: 'high' }
const pairLead = { provider: 'gz', model: 'gpt-6.1-sol', reasoningEffort: 'high' }
const pairWorker = { provider: 'gz', model: 'deepseek-v4.1-flash' }

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

describe('a route the user picked by hand while a Fusion task was bound', () => {
  // The pin and the user's own choice can name the same route: `gz/gpt-6.1-sol` is the pair
  // Lead here, and `gz/deepseek-v4.1-flash` its Sidekick. Recognising a pin by comparing the
  // recorded route with the last one Fusion wrote made both of those picks look like
  // Fusion's own note to itself, so the task was re-stated over the user's choice and the
  // composer showed the combo again for a session that had left Fusion (requirement:
  // 请继续修复，请修复这个自己切换成fusion的错误情况).
  it('drains when the user picks the pair Lead route themselves', async () => {
    const { session, drained, tick } = harness()
    session.append('model/selection', menuCombo)
    session.append('model/selection', pairLead)

    await tick()

    expect(drained()).toBe(1)
  })

  it('drains when the user picks the pair Sidekick route themselves', async () => {
    const { session, drained, tick } = harness()
    session.append('model/selection', menuCombo)
    session.append('model/selection', pairWorker)

    await tick()

    expect(drained()).toBe(1)
  })

  it('keeps the picked model as the selection and lets the next turn run unfused', async () => {
    const { session, request, lastSelection, startTurn, selected, tick } = harness()
    session.append('model/selection', menuCombo)
    session.append('model/selection', pairWorker)
    await tick()
    startTurn()
    // `change` re-reads the running reservation: nothing may re-state the combo here.
    await tick()

    await expect(request()).resolves.toBeDefined()
    expect(lastSelection()).toEqual(pairWorker)
    expect(selected()).toBe(false)
  })

  it('does not put the combo back after a switch made mid-turn', async () => {
    const { agent, session, lastSelection, settle, tick } = harness()
    session.append('model/selection', menuCombo)
    pinNativeRoute(agent, pairLead)
    session.append('model/selection', pairWorker)
    await tick()

    settle(1)

    // The restore only gives back a pin of its own; this one was superseded by the switch.
    expect(lastSelection()).toEqual(pairWorker)
  })

  it('drains when the user picks the exact pin route while idle, same reasoning effort', async () => {
    // The hardest case: the pick is byte-for-byte the route Fusion itself pinned a moment
    // ago, including the effort. Only the scoped guard can tell them apart — an equality
    // test against the last pin swallowed this pick and re-stated the combo over it.
    const { agent, session, drained, lastSelection, request, startTurn, tick, selected } = harness('idle')
    session.append('model/selection', menuCombo)
    pinNativeRoute(agent, pairLead)

    session.append('model/selection', pairLead)
    await tick()

    expect(drained()).toBe(1)
    expect(lastSelection()).toEqual(pairLead)
    // The next turn runs plain: no drain-ordering, no re-stated combo, no refuse.
    startTurn()
    await tick()
    await expect(request()).resolves.toBeDefined()
    expect(lastSelection()).toEqual(pairLead)
    expect(selected()).toBe(false)
  })

  it('drains when the user re-picks the pair Lead route after a settled turn restored the combo', async () => {
    const { agent, session, drained, lastSelection, request, startTurn, settle, tick, selected } = harness()
    session.append('model/selection', menuCombo)
    startTurn()
    pinNativeRoute(agent, pairLead)
    settle(1)
    // The settle-time restore put the combo back, so this is a fresh pick of the Lead route.
    expect(lastSelection()).toEqual(menuCombo)

    session.append('model/selection', pairLead)
    await tick()

    expect(drained()).toBe(1)
    expect(lastSelection()).toEqual(pairLead)
    startTurn()
    await tick()
    await expect(request()).resolves.toBeDefined()
    expect(lastSelection()).toEqual(pairLead)
    expect(selected()).toBe(false)
  })

  it('still treats Fusion\'s own pin as Fusion, so a running turn is never drained', async () => {
    const { agent, session, drained, lastSelection, request, tick } = harness()
    session.append('model/selection', menuCombo)

    pinNativeRoute(agent, pairLead)
    await tick()

    expect(drained()).toBe(0)
    await expect(request()).resolves.toBeDefined()
    // The pin is the newest recorded selection and stays it: the menu override names the
    // combo while it is in force (src/client/FusionModelLabel.tsx).
    expect(lastSelection()).toEqual(pairLead)
  })
})

describe('a pin a restarted Host no longer remembers', () => {
  // The map that recognises Fusion's own appends lives in the Host process. After a restart
  // the newest recorded selection is still the pair's Lead, and it is the only trace of a
  // task the user never left — session-7f326880 turned 3 read that as a model switch, drained
  // the Fusion task and then refused the turn with "先停止当前 Fusion 任务，再切换模型。"
  const frozenLead = { provider: 'gz', model: 'gpt-6.1-sol', reasoningEffort: 'high' }

  it('reads the frozen pair route as Fusion, so the turn is allowed and nothing drains', async () => {
    // A restart seeds the durable log without publishing a new event: the value is history,
    // not a choice this process observed.
    const { session, seed, request, drained, lastSelection, startTurn } = harness()
    seed('model/selection', frozenLead)

    startTurn()
    await expect(request()).resolves.toBeDefined()

    expect(drained()).toBe(0)
    // The combo is re-stated at the running reservation, so the menu names it again.
    expect(lastSelection()).toEqual(menuCombo)
  })

  it('stops reading a frozen route as Fusion once the process has seen a real choice', async () => {
    const { session, seed, drained, tick } = harness()
    seed('model/selection', frozenLead)
    // Same route, but now it is an event this process observed — the user's own re-pick.
    session.append('model/selection', frozenLead)

    await tick()

    expect(drained()).toBe(1)
  })

  it('still drains for a model the pair does not name', async () => {
    const { session, drained } = harness()
    session.append('model/selection', { provider: 'gz', model: 'gpt-5.6-sol', reasoningEffort: 'high' })
    // The drain is asynchronous: pause, clear, then install the next combo.
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(drained()).toBe(1)
  })
})
