import { describe, expect, it } from 'vitest'
import { PlanReviewJobs, planReviewJobs } from '../src/host/plan-review-jobs.js'
import { TaskId } from '../src/contracts.js'

const job = (task = 'task-1', round = 1) => ({
  taskId: TaskId(task),
  workOrderId: 'wo-1',
  round,
  controller: new AbortController(),
})

describe('plan review jobs: one review per task, owned by whoever started it', () => {
  it('reserves the slot before the review runs and refuses a second one', () => {
    const jobs = new PlanReviewJobs()
    const first = job()
    expect(jobs.start(first)).toBe(true)
    expect(jobs.get(TaskId('task-1'))).toBe(first)
    // A second candidate cannot start a competing audit of the same pending round.
    expect(jobs.start(job('task-1', 2))).toBe(false)
    expect(jobs.get(TaskId('task-1'))).toBe(first)
    // Another task is independent.
    expect(jobs.start(job('task-2'))).toBe(true)
  })

  it('releases only the job that is still recorded', () => {
    const jobs = new PlanReviewJobs()
    const first = job()
    jobs.start(first)
    jobs.finish(first)
    expect(jobs.get(TaskId('task-1'))).toBeUndefined()
    // A superseded job must not free the slot of the review that replaced it.
    const second = job('task-1', 2)
    jobs.start(second)
    jobs.finish(first)
    expect(jobs.get(TaskId('task-1'))).toBe(second)
  })

  it('cancels through the controller and reports whether anything was running', () => {
    const jobs = new PlanReviewJobs()
    const running = job()
    jobs.start(running)
    expect(jobs.cancel(TaskId('task-1'), 'the task stopped')).toBe(true)
    expect(running.controller.signal.aborted).toBe(true)
    expect(running.controller.signal.reason).toBe('the task stopped')
    expect(jobs.cancel(TaskId('task-1'), 'again')).toBe(false)
  })

  it('cancels every running review when the Host closes', () => {
    const jobs = new PlanReviewJobs()
    const first = job()
    const second = job('task-2')
    jobs.start(first)
    jobs.start(second)
    jobs.cancelAll('host closing')
    expect(first.controller.signal.aborted).toBe(true)
    expect(second.controller.signal.aborted).toBe(true)
  })

  it('shares one registry per Host context, so an HMR replacement sees the running review', () => {
    const ctx = {} as never
    const before = planReviewJobs(ctx)
    const after = planReviewJobs(ctx)
    expect(after).toBe(before)
    expect(after.start(job())).toBe(true)
    expect(planReviewJobs(ctx).get(TaskId('task-1'))).toBeDefined()
  })
})
