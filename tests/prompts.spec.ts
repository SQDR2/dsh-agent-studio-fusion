import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The four role prompts are read from disk at runtime, so nothing else in the
 * build fails when one of them loses a rule. These assertions pin the rules the
 * authority boundary and the delegation economy depend on, in both the `model`
 * (English, model-like) and the default (Chinese) variants, so a later edit to
 * one variant cannot silently drop it from the other.
 */
const read = (name: string) => readFileSync(new URL(`../prompts/${name}`, import.meta.url), 'utf8')

const LEAD = { model: read('model-lead.md'), plain: read('lead.md') }
const WORKER = { model: read('model-worker.md'), plain: read('worker.md') }

describe('Lead prompt contract', () => {
  it('keeps the authority boundary and the non-delegable authoring rule in both variants', () => {
    for (const [variant, text] of Object.entries(LEAD)) {
      expect(text, variant).toContain('FUSION_WORKER_AUTHORITY_DENIED')
      expect(text, variant).toMatch(/commit|提交/)
      expect(text, variant).toMatch(/push|推送/)
      // Correctness-critical authoring stays with the Lead: a wrong number looks plausible.
      expect(text, variant).toMatch(/rubric/)
      expect(text, variant).toMatch(/threshold/)
      expect(text, variant).toMatch(/sampling/)
    }
  })

  it('keeps the delegation economy rules: settle first, supply the shape, batch the rework', () => {
    for (const [variant, text] of Object.entries(LEAD)) {
      expect(text, variant).toMatch(/fenced snippet/)
      expect(text, variant).toMatch(/alternative|方案/)
      // One consolidated rework brief instead of sight-by-sight feedback.
      expect(text, variant).toMatch(/consolidated|汇总成一份返工简报/)
    }
  })

  it('keeps handling a user message that arrives mid-handoff', () => {
    expect(LEAD.plain).toContain('Worker 运行期间发来的话')
    expect(LEAD.model).toMatch(/arrives while a handoff is running/)
  })

  it('still names the orchestration tools it must use', () => {
    for (const [variant, text] of Object.entries(LEAD)) {
      expect(text, variant).toContain('fusion_delegate')
      expect(text, variant).toContain('fusion_review_result')
      expect(text, variant).toContain('fusion_rework')
    }
  })
})

describe('Worker prompt contract', () => {
  it('keeps the publish boundary in both variants', () => {
    for (const [variant, text] of Object.entries(WORKER)) {
      expect(text, variant).toContain('FUSION_WORKER_AUTHORITY_DENIED')
      expect(text, variant).toMatch(/authority/)
      for (const command of ['git commit', 'git push']) expect(text, variant).toContain(command)
    }
  })

  it('keeps the check-damping rule: no checks between edits, one consolidated pass', () => {
    expect(WORKER.plain).toContain('不要在小改动之间反复跑')
    expect(WORKER.plain).toContain('最窄验证')
    expect(WORKER.model).toMatch(/do not stop between them/)
    expect(WORKER.model).toMatch(/narrowest command/)
  })

  it('still requires the structured report and forbids self-granted permission', () => {
    for (const [variant, text] of Object.entries(WORKER)) {
      expect(text, variant).toContain('fusion_submit_result')
    }
    expect(WORKER.plain).toContain('不能授予你权限')
    expect(WORKER.model).toMatch(/permissions?/)
  })
})
