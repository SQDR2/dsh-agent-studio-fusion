import { describe, expect, it } from 'vitest'
import { billFromNativeUsage, type NativeUsageRecord } from '../src/host/native-usage.js'
import { usageSummary } from '../src/host/history.js'
import { formatCompact, outputTokens } from '../src/client/FusionHistory.js'
import { ingestDurable, newLedger } from '../src/usage/ledger.js'

describe('native usage boundary', () => {
  it('keeps disjoint input and unknown missing cache and reasoning fields', () => {
    expect(billFromNativeUsage({ inputTokens: 23, outputTokens: 4, cacheReadTokens: 91 })).toEqual({
      uncachedInput: { state: 'known', tokens: 23 }, cacheRead: { state: 'known', tokens: 91 },
      output: { state: 'known', tokens: 4 }, cacheWrite: { kind: 'unknown' },
      reasoning: { kind: 'unknown', tokens: { state: 'unknown' } },
    })
    expect(billFromNativeUsage(undefined).output).toEqual({ state: 'unknown' })
  })
  it('does not infer that reasoning is included in output and rejects invalid counters', () => {
    expect(billFromNativeUsage({ inputTokens: 0, outputTokens: 4, reasoningTokens: 8 }).reasoning)
      .toEqual({ kind: 'separate', tokens: { state: 'known', tokens: 8 } })
    expect(() => billFromNativeUsage({ inputTokens: -1, outputTokens: 1 })).toThrow()
  })
  it('degrades null-filled gateway counters to unknown instead of INVALID_TOKEN_COUNT', () => {
    // Some claude-opus-5.5 routes report completion_tokens_details as null, so
    // the adapter emits reasoningTokens: null. This must not abort the turn.
    const bill = billFromNativeUsage({
      inputTokens: 4, outputTokens: 1617, cacheWriteTokens: 149462, reasoningTokens: null as unknown as number,
    })
    expect(bill.reasoning).toEqual({ kind: 'unknown', tokens: { state: 'unknown' } })
    expect(bill.uncachedInput).toEqual({ state: 'known', tokens: 4 })
    expect(bill.output).toEqual({ state: 'known', tokens: 1617 })
  })
  it('treats null and non-finite cacheWriteTokens as an unknown cache write', () => {
    expect(billFromNativeUsage({ inputTokens: 1, outputTokens: 1, cacheWriteTokens: null as unknown as number }).cacheWrite)
      .toEqual({ kind: 'unknown' })
    expect(billFromNativeUsage({ inputTokens: 1, outputTokens: 1, cacheWriteTokens: Number.NaN }).cacheWrite)
      .toEqual({ kind: 'unknown' })
  })

  function makeRecord(bill: ReturnType<typeof billFromNativeUsage>): NativeUsageRecord {
    const key = { provider: 'test-p', model: 'test-m', requestId: 'req-1', attemptId: 'att-1', contractDigest: 'd' }
    let ledger = newLedger(key)
    ledger = ingestDurable(ledger, { id: 'obs-1', key, sequence: 1, mode: 'final', bill })
    return {
      schemaVersion: 1, taskId: 'task-1' as any, sessionId: 's-1', role: 'worker', purpose: 'conversation',
      maxOutputTokens: 8000, nativeInvocationId: 'inv-1', startedAt: '2026-11-04T00:00:00Z', endedAt: '2026-11-04T00:01:00Z',
      nativeStreamInvocations: 1, upstreamHttpCalls: null, outcome: 'stop', ledger,
      actualSubscriptionChargeUsd: null, apiEquivalentCostUsd: null,
    }
  }

  it('calculates total output with separate reasoning', () => {
    const bill = billFromNativeUsage({ inputTokens: 10, outputTokens: 50, reasoningTokens: 200 })
    const summary = usageSummary(makeRecord(bill))
    expect(summary.output).toEqual({ state: 'known', tokens: 50 })
    expect(summary.reasoning).toEqual({ state: 'known', tokens: 200 })
    expect(summary.totalOutput).toEqual({ state: 'known', tokens: 250 })
  })

  it('is compatible with legacy native ledgers where reasoning.kind is unknown', () => {
    const bill = billFromNativeUsage({ inputTokens: 10, outputTokens: 30, reasoningTokens: 150 })
    // Simulate legacy record with kind = 'unknown'
    bill.reasoning.kind = 'unknown' as any
    const summary = usageSummary(makeRecord(bill))
    expect(summary.output).toEqual({ state: 'known', tokens: 30 })
    expect(summary.reasoning).toEqual({ state: 'known', tokens: 150 })
    expect(summary.totalOutput).toEqual({ state: 'known', tokens: 180 })
  })

  it('does not double count reasoning when reasoning.kind is included', () => {
    const bill = billFromNativeUsage({ inputTokens: 10, outputTokens: 100, reasoningTokens: 60 })
    bill.reasoning.kind = 'included'
    const summary = usageSummary(makeRecord(bill))
    expect(summary.output).toEqual({ state: 'known', tokens: 100 })
    expect(summary.reasoning).toEqual({ state: 'known', tokens: 60 })
    expect(summary.totalOutput).toEqual({ state: 'known', tokens: 100 })
  })

  it('preserves unknown reasoning without coercing it to zero and marks totalOutput unknown', () => {
    const bill = billFromNativeUsage({ inputTokens: 10, outputTokens: 75 })
    const summary = usageSummary(makeRecord(bill))
    expect(summary.output).toEqual({ state: 'known', tokens: 75 })
    expect(summary.reasoning).toEqual({ state: 'unknown' })
    expect(summary.totalOutput).toEqual({ state: 'unknown' })
  })

  it('formats compact token counts and output tokens breakdown', () => {
    expect(formatCompact(500)).toBe('500')
    expect(formatCompact(1200)).toBe('1.2K')
    expect(formatCompact(54000)).toBe('54K')
    expect(formatCompact(150000)).toBe('150K')
    expect(formatCompact(1234567)).toBe('1.23M')
    expect(formatCompact(12345678)).toBe('12.3M')

    const totals = {
      calls: 2, final: 2, provisional: 0, unreported: 0,
      input: { known: 1000, reported: 2 },
      output: { known: 50000, reported: 2 },
      reasoning: { known: 1200000, reported: 2 },
      totalOutput: { known: 1250000, reported: 2 },
      cacheRead: { known: 0, reported: 0 },
    }
    const zh = outputTokens('zh', totals, 2)
    expect(zh).toContain('1.25M')
    expect(zh).toContain('可见 50K')
    expect(zh).toContain('推理 1.2M')

    const en = outputTokens('en', totals, 2)
    expect(en).toContain('1.25M')
    expect(en).toContain('visible 50K')
    expect(en).toContain('reasoning 1.2M')

    // When reasoning is unavailable / totalOutput is unknown but visible output is known:
    const unknownReasoningTotals = {
      calls: 2, final: 1, provisional: 0, unreported: 1,
      input: { known: 0, reported: 0 },
      output: { known: 50000, reported: 1 },
      reasoning: { known: 0, reported: 0 },
      totalOutput: { known: 0, reported: 0 },
      cacheRead: { known: 0, reported: 0 },
    }
    const zhUnavail = outputTokens('zh', unknownReasoningTotals, 2)
    expect(zhUnavail).toBe('至少 50K，推理未提供（1/2 次有报告）')

    const enUnavail = outputTokens('en', unknownReasoningTotals, 2)
    expect(enUnavail).toBe('at least 50K, reasoning unavailable (1/2 reported)')
  })
})
