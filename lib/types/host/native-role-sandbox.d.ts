import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { Role, SandboxMode } from '../contracts.js';
import type { SqliteFusionStore } from '../task/sqlite-store.js';
import type { SessionBinding } from './bindings.js';
type Mode = SandboxMode;
declare module '@deepseek-ai/dsh-session/types' {
    interface SessionEventMap {
        'sandbox/mode': {
            mode: Mode;
            source?: 'delegation';
        };
    }
}
export declare const roleSeparated: (binding: SessionBinding) => boolean;
/**
 * The mode the user chose for a confined Fusion conversation, which is the mode
 * the Sidekick runs under. Undefined until Fusion has confined the Lead, or after
 * the conversation left Fusion and its own mode was restored.
 */
export declare function readSandboxIntent(store: SqliteFusionStore, sessionId: string): {
    mode: Mode;
} | undefined;
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
export declare class NativeRoleSandbox {
    #private;
    readonly ctx: Context;
    readonly store: SqliteFusionStore;
    readonly binding: (sessionId: string) => SessionBinding | undefined;
    constructor(ctx: Context, store: SqliteFusionStore, binding: (sessionId: string) => SessionBinding | undefined);
    /**
     * Called before every model request of an enforced-v3 role.
     *
     * The Lead is put back into the user's own mode — never a read-only one — so it can read,
     * search and run commands like any other agent; concurrent writing is the writer guard's
     * job, not a sandbox downgrade. The Sidekick is given the same recorded mode.
     */
    ensure(agent: Agent, binding: SessionBinding, role: Role): void;
    /**
     * Frozen acceptance checks are plugin-issued and nested in a Lead tool call, so they run in
     * whatever mode the Lead's session has — the user's. Kept as a named seam because the
     * coordinator's baseline/verification paths call it, and because a future role that does
     * need a temporary mode still has one place to do it.
     */
    whileChecking<T>(_agent: Agent, _binding: SessionBinding, run: () => Promise<T>): Promise<T>;
    /** Put the user's own mode back when the conversation leaves Fusion. */
    restore(agent: Agent): void;
    /** A mode switch the user makes while Fusion is selected becomes both roles' mode. */
    install(): () => void;
}
export {};
