import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId as NativeSessionId } from '@deepseek-ai/dsh-session'
import type { Session } from '@deepseek-ai/dsh-session'
import type { Role, SandboxMode } from '../contracts.js'
import type { SqliteFusionStore } from '../task/sqlite-store.js'
import type { SessionBinding } from './bindings.js'

type Mode = SandboxMode

// Mirrors the Host sandbox-policy augmentation (a type-only declaration; the Host
// registers the event at runtime). The plugin does not depend on that package.
declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    'sandbox/mode': { mode: Mode; source?: 'delegation' }
  }
}

/** The public per-session policy service (`ctx.sandboxPolicy`), used by structure only. */
interface SandboxPolicy {
  resolve(request?: { session?: Session }): { mode: Mode }
  overrideOf(session: Session): Mode | undefined
}

interface Intent {
  schemaVersion: 1
  sessionId: string
  /** The mode the user chose for this conversation; the Sidekick runs under it. */
  mode: Mode
  /** `sandbox/mode` events this plugin appended; any other one is the user's choice. */
  ownSeqs: number[]
  /** False after leaving Fusion; the next selection re-reads the user's current mode. */
  active: boolean
}

export const roleSeparated = (binding: SessionBinding) => binding.profile.workflowPolicy === 'enforced-v3'

const intentId = (sessionId: string) => `sandbox-intent:${sessionId}`

/**
 * The mode the user chose for a confined Fusion conversation, which is the mode
 * the Sidekick runs under. Undefined until Fusion has confined the Lead, or after
 * the conversation left Fusion and its own mode was restored.
 */
export function readSandboxIntent(store: SqliteFusionStore, sessionId: string): { mode: Mode } | undefined {
  const intent = store.readDocument(intentId(sessionId))?.value as Intent | undefined
  if (!intent || intent.schemaVersion !== 1 || !intent.active) return undefined
  return { mode: intent.mode }
}

/**
 * Both Fusion roles run in the mode the user chose.
 *
 * The Lead used to be forced into the Host's read-only sandbox whenever it did not hold the
 * write lease, and the Sidekick alone kept the user's mode. That was a capability cap where a
 * concurrency boundary was needed: it made the expensive reviewer unable to run the check it
 * was reviewing, and it contradicted the prompt that told it to verify its own judgement. So
 * the Lead now runs exactly like a normal agent, and the only remaining rule is the one the
 * workspace lease already enforces — one writer per workspace, so a Lead write while the
 * Sidekick holds the lease is refused by the writer guard (reads and searches still work).
 *
 * What this class still owns is the Sidekick's mode: a child is seeded from the Lead's session
 * and is re-checked before every request, so the Sidekick always runs in the user's mode, and
 * leaving Fusion restores that mode on the conversation. Only public session events are written.
 */
export class NativeRoleSandbox {
  readonly #dispose: (() => void)[] = []

  constructor(readonly ctx: Context, readonly store: SqliteFusionStore,
    readonly binding: (sessionId: string) => SessionBinding | undefined) {}

  get #policy(): SandboxPolicy | undefined {
    return (this.ctx as unknown as { get(name: string): unknown }).get('sandboxPolicy') as SandboxPolicy | undefined
  }

  #intent(sessionId: string): Intent | undefined {
    return this.store.readDocument(intentId(sessionId))?.value as Intent | undefined
  }
  #save(intent: Intent) {
    const prior = this.store.readDocument(intentId(intent.sessionId))
    this.store.writeDocument(intentId(intent.sessionId), prior?.revision ?? 0, { ...intent, ownSeqs: intent.ownSeqs.slice(-32) })
  }
  // Session listeners run synchronously inside append, before the seq is known here.
  #writing = false
  #set(session: Session, mode: Mode, intent: Intent) {
    this.#writing = true
    try { intent.ownSeqs.push(session.append('sandbox/mode', { mode }).seq) }
    finally { this.#writing = false }
  }

  /**
   * Called before every model request of an enforced-v3 role.
   *
   * The Lead is put back into the user's own mode — never a read-only one — so it can read,
   * search and run commands like any other agent; concurrent writing is the writer guard's
   * job, not a sandbox downgrade. The Sidekick is given the same recorded mode.
   */
  ensure(agent: Agent, binding: SessionBinding, role: Role): void {
    const policy = this.#policy
    if (!policy || !roleSeparated(binding)) return
    if (role === 'lead') {
      const saved = this.#intent(binding.sessionId)
      const intent: Intent = saved?.active ? saved
        : { schemaVersion: 1, sessionId: binding.sessionId, mode: policy.resolve({ session: agent.session }).mode, ownSeqs: saved?.ownSeqs ?? [], active: true }
      if (policy.overrideOf(agent.session) !== intent.mode) this.#set(agent.session, intent.mode, intent)
      this.#save(intent)
      return
    }
    const intent = this.#intent(binding.sessionId)
    if (!intent?.active) throw new Error('Fusion has not recorded the conversation sandbox mode for the Sidekick')
    // The child was seeded with the Lead's read-only override at delegation; give it the user's mode.
    if (policy.overrideOf(agent.session) !== intent.mode) this.#set(agent.session, intent.mode, { ...intent, ownSeqs: [] })
  }

  /** Apply the user's mode to a resident Sidekick immediately. The next request still re-checks through ensure(). */
  #pushSidekickMode(taskId: SessionBinding['taskId'], mode: Mode): void {
    const policy = this.#policy
    if (!policy) return
    const state = this.store.load(taskId)
    const childId = state?.acceptedChild ?? state?.reservedChild
    if (!childId) return
    const child = this.ctx.agents.get(NativeSessionId(childId))
    if (!child || policy.overrideOf(child.session) === mode) return
    try { this.#set(child.session, mode, { schemaVersion: 1, sessionId: child.id, mode, ownSeqs: [], active: true }) }
    catch { /* ensure() applies the same mode on the Sidekick's next request */ }
  }

  /**
   * Frozen acceptance checks are plugin-issued and nested in a Lead tool call, so they run in
   * whatever mode the Lead's session has — the user's. Kept as a named seam because the
   * coordinator's baseline/verification paths call it, and because a future role that does
   * need a temporary mode still has one place to do it.
   */
  async whileChecking<T>(_agent: Agent, _binding: SessionBinding, run: () => Promise<T>): Promise<T> {
    return await run()
  }

  /** Put the user's own mode back when the conversation leaves Fusion. */
  restore(agent: Agent): void {
    const intent = this.#intent(agent.id), policy = this.#policy
    if (!intent?.active || !policy) return
    if (policy.overrideOf(agent.session) !== intent.mode) this.#set(agent.session, intent.mode, intent)
    this.#save({ ...intent, active: false })
  }

  /** A mode switch the user makes while Fusion is selected becomes both roles' mode. */
  install(): () => void {
    this.#dispose.push(this.ctx.on('session/event', (session, event) => {
      if (event.type !== 'sandbox/mode' || this.#writing) return
      const binding = this.binding(session.id)
      if (!binding?.selected || !roleSeparated(binding) || binding.sessionId !== session.id) return
      const intent = this.#intent(session.id)
      if (!intent?.active || intent.ownSeqs.includes(event.seq)) return
      intent.mode = (event.data as { mode: Mode }).mode
      this.#pushSidekickMode(binding.taskId, intent.mode)
      // Appending inside this event's publication is rejected as reentrant; apply next tick.
      setImmediate(() => {
        try {
          const current = this.#intent(session.id), policy = this.#policy
          if (!current?.active || !policy) return
          if (policy.overrideOf(session) !== current.mode) this.#set(session, current.mode, current)
          this.#save(current)
        } catch { /* the next Lead request applies it through ensure() */ }
      })
      this.#save(intent)
    }))
    return () => { for (const dispose of this.#dispose.splice(0)) dispose() }
  }
}
