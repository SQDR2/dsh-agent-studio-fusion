import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import type { Digest, Role, TaskId } from '../contracts.js'
import { FOREMAN_SYSTEM_PROMPT } from '../plan-review.js'

// LLM adapters may shallow-copy their call options. Keep this separate from the
// request-accounting WeakMap, and let the canonical audit protocol fail closed too.
const foremanReview = Symbol('fusion-foreman-review')
export function markForemanReview(request: GenerateOptions): void {
  Object.assign(request, { [foremanReview]: true })
}
export function isForemanReview(request: GenerateOptions): boolean {
  return (request as GenerateOptions & { [foremanReview]?: true })[foremanReview] === true
    || request.system === FOREMAN_SYSTEM_PROMPT
}

export type AuxiliaryRequest =
  | {
      purpose: 'cache-keepalive'
      taskId: TaskId
      sessionId: string
      profileDigest: Digest
      role: Role
      seriesId: string
      iteration: number
    }
  | {
      purpose: 'foreman'
      taskId: TaskId
      sessionId: string
      profileDigest: Digest
      role: Role
    }

/** Plugin-local identity: do not widen or misuse the Host's purpose enum. */
export class NativeAuxiliaryRequests {
  readonly #requests = new WeakMap<GenerateOptions, Readonly<AuxiliaryRequest>>()
  tag(request: GenerateOptions, metadata: AuxiliaryRequest): void { this.#requests.set(request, Object.freeze(metadata)) }
  get(request: GenerateOptions): Readonly<AuxiliaryRequest> | undefined { return this.#requests.get(request) }
}
