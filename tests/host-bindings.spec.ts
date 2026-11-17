import { afterEach, describe, expect, it } from 'vitest'
import { BindingRepository } from '../src/host/bindings.js'
import { completeProfile } from '../src/profile/resolve.js'
import { digestOf } from '../src/digest.js'
import { SqliteFusionStore } from '../src/task/sqlite-store.js'
import { TaskId } from '../src/contracts.js'

const stores: SqliteFusionStore[] = []
afterEach(() => { for (const store of stores.splice(0)) store.close() })
const prompts = { lead: 'Lead', worker: 'Worker', compact: 'Checkpoint' }
const profile = completeProfile({ id: 'fusion-auto', version: 'faithful-v1', enabled: true,
  lead: { provider: 'configured', model: 'lead' }, worker: { provider: 'configured', model: 'worker' } }, prompts)
function setup() { const store = new SqliteFusionStore(':memory:'); stores.push(store); return { store, bindings: new BindingRepository(store) } }

describe('native session selection persistence', () => {
  it('keeps frozen profiles detached and affects only the selected native session', () => {
    const { bindings } = setup()
    const selected = bindings.select('lead-a', TaskId('task-a'), { profile, prompts })
    selected.prompts.lead = 'tampered'
    expect(bindings.read('lead-a')?.binding.prompts.lead).toBe('Lead')
    expect(bindings.read('lead-b')).toBeUndefined()
    expect(bindings.selected()).toHaveLength(1)
    bindings.clear('lead-a')
    bindings.clear('lead-a')
    expect(bindings.selected()).toHaveLength(0)
    expect(bindings.read('lead-a')?.binding.taskId).toBe('task-a')
  })

  it('rejects schema drift or changed frozen prompt even with a valid document checksum', () => {
    const { store, bindings } = setup()
    bindings.select('lead-a', TaskId('task-a'), { profile, prompts })
    const prior = bindings.read('lead-a')!
    store.writeDocument('binding:lead-a', prior.revision, { ...prior.binding, prompts: { ...prompts, worker: 'changed' } })
    expect(() => bindings.read('lead-a')).toThrow('digest changed')
  })

  // A release that retired `foreman.policy` re-derived every frozen profile without it. The
  // binding guard compares the stored document against a fresh parse, so every session bound
  // before that release failed to read and the whole plugin refused to activate at boot
  // ("Frozen Fusion profile or prompt digest changed"). The key is not a setting any more,
  // but it is part of the profile the session was frozen with and every task record in the
  // store is bound to that profile's digest, so the frozen document keeps its own copy.
  it('reads a binding frozen while the reviewer still carried a policy, keeping its digest', () => {
    const { store, bindings } = setup()
    const reviewing = completeProfile({ id: 'fusion-auto', version: 'faithful-v1', enabled: true,
      lead: { provider: 'configured', model: 'lead' }, worker: { provider: 'configured', model: 'worker' },
      foreman: { route: { provider: 'configured', model: 'foreman' }, maxOutputTokens: 4096, timeoutMs: 30_000 } }, prompts)
    // Exactly what the older release wrote: `policy` inside the foreman, and the digest taken
    // over that body (the profile's own `digest` field is blank while it is hashed).
    const body = { ...reviewing, digest: '' as never, foreman: { ...reviewing.foreman!, policy: 'risk-gated' } }
    const legacy = { ...body, digest: digestOf(body) }
    store.writeDocument('binding:lead-a', 0, { schemaVersion: 1, sessionId: 'lead-a', taskId: 'task-a',
      selected: true, profile: legacy, prompts })

    const read = bindings.read('lead-a')!
    // The identity every task, checkpoint and keepalive row names is unchanged.
    expect(read.binding.profile.digest).toBe(legacy.digest)
    // The run ignores the retired key: it is data in the frozen document, not in the type.
    expect((read.binding.profile.foreman as { policy?: string }).policy).toBe('risk-gated')
    expect(bindings.selected()).toHaveLength(1)

    // A rollover rewrites the document; it must carry the same digest and the same key, or
    // the next read fails again and the session is stuck.
    bindings.rollover('lead-a', TaskId('task-a'), TaskId('task-b'))
    const after = bindings.read('lead-a')!.binding
    expect(after.profile.digest).toBe(legacy.digest)
    expect((after.profile.foreman as { policy?: string }).policy).toBe('risk-gated')
  })

  it('freezes a combo created now without any policy key', () => {
    const reviewing = completeProfile({ id: 'fusion-auto', version: 'faithful-v1', enabled: true,
      lead: { provider: 'configured', model: 'lead' }, worker: { provider: 'configured', model: 'worker' },
      foreman: { route: { provider: 'configured', model: 'foreman' }, maxOutputTokens: 4096, timeoutMs: 30_000 } }, prompts)
    expect(reviewing.foreman).toEqual({ route: { provider: 'configured', model: 'foreman' },
      maxOutputTokens: 4096, timeoutMs: 30_000 })
  })

  it('still rejects a frozen profile whose routes actually changed', () => {
    const { store, bindings } = setup()
    bindings.select('lead-a', TaskId('task-a'), { profile, prompts })
    const prior = bindings.read('lead-a')!
    const tampered = { ...prior.binding, profile: { ...prior.binding.profile,
      lead: { provider: 'configured', model: 'another-lead' } } }
    store.writeDocument('binding:lead-a', prior.revision, tampered)
    expect(() => bindings.read('lead-a')).toThrow('digest changed')
  })

  it('refuses to overwrite a live selection', () => {
    const { bindings } = setup()
    bindings.select('lead-a', TaskId('task-a'), { profile, prompts })
    expect(() => bindings.select('lead-a', TaskId('task-b'), { profile, prompts })).toThrow('already selected')
  })

  it('keeps a reserved Worker across task rollover but not a new selection', () => {
    const { bindings } = setup()
    bindings.select('lead-a', TaskId('task-a'), { profile, prompts })
    bindings.assignWorker('lead-a', TaskId('task-a'), 'worker-a')
    expect(() => bindings.assignWorker('lead-a', TaskId('task-a'), 'worker-b')).toThrow('cannot change')
    expect(bindings.rollover('lead-a', TaskId('task-a'), TaskId('task-b')).workerId).toBe('worker-a')
    expect(() => bindings.assignWorker('lead-a', TaskId('task-a'), 'worker-a')).toThrow('changed')
    bindings.clear('lead-a')
    expect(bindings.select('lead-a', TaskId('task-c'), { profile, prompts }).workerId).toBeUndefined()
  })
})
