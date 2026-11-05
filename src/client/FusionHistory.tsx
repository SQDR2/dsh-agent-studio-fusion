import { useEffect, useState } from 'react'
import type { HistoryView, HistoryTotals } from '../host/history.js'
import { tr, useLang, type Lang } from './i18n.js'

export function formatCompact(tokens: number): string {
  if (tokens < 1000) return `${tokens}`
  if (tokens < 1_000_000) {
    const k = tokens / 1000
    return `${k >= 100 ? Math.round(k) : Number(k.toFixed(1))}K`
  }
  const m = tokens / 1_000_000
  return `${m >= 100 ? Math.round(m) : Number(m.toFixed(m >= 10 ? 1 : 2))}M`
}

export function outputTokens(lang: Lang, usage: HistoryTotals, calls: number): string {
  if (!calls) return '—'
  const total = usage.totalOutput
  const hasTotal = Boolean(total && total.reported > 0)
  const hasVisible = Boolean(usage.output && usage.output.reported > 0)
  const hasReasoning = Boolean(usage.reasoning && usage.reasoning.reported > 0)

  if (!hasTotal) {
    if (hasVisible) {
      const vis = formatCompact(usage.output.known)
      const cov = usage.output.reported < calls ? tr(lang, `（${usage.output.reported}/${calls} 次有报告）`, ` (${usage.output.reported}/${calls} reported)`) : ''
      return `${tr(lang, `至少 ${vis}，推理未提供`, `at least ${vis}, reasoning unavailable`)}${cov}`
    }
    return tr(lang, '未提供', 'not reported')
  }

  const totalStr = formatCompact(total!.known)
  const visibleStr = hasVisible ? formatCompact(usage.output.known) : tr(lang, '未提供', 'not reported')
  const reasoningStr = hasReasoning ? formatCompact(usage.reasoning!.known) : tr(lang, '未提供', 'not reported')
  const coverageStr = total!.reported < calls ? tr(lang, `（${total!.reported}/${calls} 次有报告）`, ` (${total!.reported}/${calls} reported)`) : ''
  const splitStr = tr(lang, `（可见 ${visibleStr} + 推理 ${reasoningStr}）`, ` (visible ${visibleStr} + reasoning ${reasoningStr})`)
  return `${totalStr} ${splitStr}${coverageStr}`
}

const takeoverReason = (lang: Lang, reason: string) => ({
  'checks-still-failing': tr(lang, '返工后检查仍失败', 'checks still failing after rework'),
  'worker-step-limit': tr(lang, 'Sidekick 步数用尽', 'Sidekick step limit'),
  'worker-stalled': tr(lang, 'Sidekick 反复停滞', 'Sidekick stalled repeatedly'),
} as Record<string, string>)[reason] ?? reason
const tokens = (lang: Lang, field: HistoryTotals['input'], calls: number) => !calls ? '—' : !field.reported ? tr(lang, '未提供', 'not reported')
  : `${formatCompact(field.known)} (${field.known.toLocaleString()})${field.reported < calls ? tr(lang, `（${field.reported}/${calls} 次有报告）`, ` (${field.reported}/${calls} reported)`) : ''}`
const purpose = (lang: Lang, value: string) => ({ conversation: tr(lang, '任务', 'task'), compaction: tr(lang, '压缩', 'compaction'),
  'cache-keepalive': tr(lang, '保活', 'keepalive'), 'session-title': tr(lang, '标题', 'title') } as Record<string, string>)[value] ?? value
/** What still holds the task, so a refusal says why instead of only that it refused. */
const blockerText = (lang: Lang, blocker?: string) => ({
  agent: tr(lang, 'Lead 或 Sidekick 仍在运行', 'its Lead or Sidekick is still running'),
  tool: tr(lang, '有原生工具调用尚未返回', 'a native tool call has not returned'),
  job: tr(lang, '有后台任务尚未停止', 'a background job has not stopped'),
  lease: tr(lang, '仍持有工作区写入租约', 'it still holds the workspace write lease'),
  'foreign-process': tr(lang, '另一个 Host 进程仍在处理它', 'another Host process is still working on it'),
} as Record<string, string>)[blocker ?? ''] ?? tr(lang, '仍有活动写入方', 'something is still writing to it')

export function FusionHistory() {
  const lang = useLang()
  const [page, setPage] = useState<HistoryView>()
  const [cursor, setCursor] = useState('')
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [loading, setLoading] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null)
  const [open, setOpen] = useState(false)
  const [tasksOpen, setTasksOpen] = useState(false)

  useEffect(() => {
    const abort = new AbortController()
    setLoading(true); setError('')
    void fetch(`/api/model-fusion?view=history&cursor=${encodeURIComponent(cursor)}`, { credentials: 'same-origin', cache: 'no-store', signal: abort.signal })
      .then(async response => {
        if (!response.ok) {
          const body = await response.json().catch(() => null) as { error?: string } | null
          if (cursor && (response.status === 409 || body?.error?.includes('cursor') || body?.error?.includes('Cursor'))) {
            setCursor('')
            return
          }
          throw new Error(body?.error || tr(lang, '历史记录暂时无法读取', 'History is unavailable right now'))
        }
        return response.json() as Promise<HistoryView>
      })
      .then(data => { if (data) setPage(data) })
      .catch(error => { if (!abort.signal.aborted) setError(String(error)) })
      .finally(() => { if (!abort.signal.aborted) setLoading(false) })
    return () => abort.abort()
  }, [cursor, refresh, lang])

  const handleDelete = async (taskId: string) => {
    setDeletingId(taskId)
    setRowError(null)
    setError('')
    try {
      const res = await fetch(`/api/model-fusion?taskId=${encodeURIComponent(taskId)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null) as { error?: string; blocker?: string } | null
        const raw = data?.error || ''
        const msg = raw === 'Cannot delete a running task'
          ? tr(lang, `当前任务仍在运行或尚未安全终止，无法清除：${blockerText(lang, data?.blocker)}`,
              `Cannot delete while it still runs: ${blockerText(lang, data?.blocker)}`)
          : (raw || tr(lang, '清除任务失败', 'Failed to delete task'))
        throw new Error(msg)
      }
      setPage(prev => prev ? {
        ...prev,
        totalTasks: Math.max(0, prev.totalTasks - 1),
        tasks: prev.tasks.filter(task => task.id !== taskId),
      } : prev)
      setConfirmingId(null)
      setRowError(null)
      if (cursor === taskId) setCursor('')
      setRefresh(v => v + 1)
    } catch (err) {
      setRowError({ id: taskId, message: err instanceof Error ? err.message : String(err) })
    } finally {
      setDeletingId(null)
    }
  }

  return <details
    className="fusion-history"
    aria-label={tr(lang, 'Fusion 历史与统计', 'Fusion history and statistics')}
    data-ud-check="fusion-history"
    {...(open ? { open: true } : {})}
    onToggle={event => {
      if (!event.target || event.target === event.currentTarget) {
        setOpen(event.currentTarget.open)
      }
    }}
  >
    <summary className="fusion-history-summary">
      <span className="fusion-history-title">
        <h3>{tr(lang, '历史与统计', 'History and statistics')}</h3>
      </span>
      <span className="fusion-history-indicator">
        <small>{open ? tr(lang, '点击收起', 'Collapse') : tr(lang, '点击展开', 'Expand')}</small>
        <span className="fusion-history-chevron" aria-hidden="true" />
      </span>
    </summary>
    <div className="fusion-history-content">
      <div className="fusion-history-header">
        <p>{tr(lang, '按实际模型请求汇总，包含任务、压缩、保活及已有标题请求。未报告的用量不算作 0；金额与节省率尚无可靠数据。',
          'Totals of actual model requests: tasks, compaction, keepalive and title requests. Unreported usage is not counted as 0; no reliable billed amount or saving rate is available.')}</p>
        <button disabled={loading} onClick={() => setRefresh(value => value + 1)}>{tr(lang, '刷新记录', 'Refresh')}</button>
      </div>
    {error && <p role="alert">{error}</p>}{loading && !page && <p role="status">{tr(lang, '正在读取记录…', 'Loading…')}</p>}
    {page && <>
      <div className="fusion-history-panel fusion-history-usage" aria-label={tr(lang, '用量统计', 'Usage statistics')}>
        <h3>{tr(lang, '用量统计', 'Usage statistics')}</h3>
        <p>{tr(lang, `${page.totalTasks} 项任务 · ${page.totals.calls} 次原生请求 · ${page.totals.final} 次用量定稿 · ${page.totals.provisional} 次暂报 · ${page.totals.unreported} 次未提供`,
          `${page.totalTasks} tasks · ${page.totals.calls} native requests · ${page.totals.final} final usage · ${page.totals.provisional} provisional · ${page.totals.unreported} unreported`)}</p>
        <p>{tr(lang, '未缓存输入', 'Uncached input')} {tokens(lang, page.totals.input, page.totals.calls)} · {tr(lang, '缓存读取', 'cache read')} {tokens(lang, page.totals.cacheRead, page.totals.calls)} · {tr(lang, '总输出', 'Total output')} {outputTokens(lang, page.totals, page.totals.calls)} Token</p>
        <p>{tr(lang, `Lead 接手改代码 ${page.takeovers?.total ?? 0} 次（${page.takeovers?.tasks ?? 0} 项任务）`, `Lead takeovers: ${page.takeovers?.total ?? 0} (${page.takeovers?.tasks ?? 0} tasks)`)}
          {page.takeovers?.total ? `: ${Object.entries(page.takeovers.reasons).map(([reason, count]) => `${takeoverReason(lang, reason)} ${count}`).join(', ')}` : ''}
          {tr(lang, '。只有 Sidekick 确实完成不了时，程序才会解锁接手。', '. The Host unlocks a takeover only when the Sidekick demonstrably cannot finish.')}</p>
        <div style={{ overflowX: 'auto' }} tabIndex={0} aria-label={tr(lang, '按实际模型统计', 'By actual model')}>
          <table><caption>{tr(lang, '按角色、实际模型和请求用途', 'By role, actual model and purpose')}</caption><thead><tr>
            <th scope="col">{tr(lang, '角色 / 模型', 'Role / model')}</th><th scope="col">{tr(lang, '用途', 'Purpose')}</th><th scope="col">{tr(lang, '请求', 'Requests')}</th><th scope="col">{tr(lang, '总输出 Token（可见 / 推理）', 'Total output tokens (visible / reasoning)')}</th></tr></thead>
            <tbody>{page.groups.map(group => <tr key={JSON.stringify([group.role, group.provider, group.model, group.purpose])}>
              <th scope="row">{group.role === 'lead' ? 'Lead' : 'Sidekick'} · {group.model}<small>{group.provider}</small></th>
              <td>{purpose(lang, group.purpose)}</td><td>{group.calls}</td><td>{outputTokens(lang, group, group.calls)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p><small>{tr(lang, `更新于 ${new Date(page.observedAt).toLocaleString()}。供应商内部重试次数未知。`, `Updated ${new Date(page.observedAt).toLocaleString()}. Provider-internal retries are unknown.`)}</small></p>
      </div>
      <details
        className="fusion-history-panel fusion-history-tasks"
        {...(tasksOpen ? { open: true } : {})}
        onToggle={event => setTasksOpen(event.currentTarget.open)}
      >
        <summary className="fusion-history-tasks-summary">
          <span className="fusion-history-tasks-title">
            <strong>{tr(lang, '任务记录', 'Tasks')}</strong>{' '}
            <span className="fusion-history-count">({page.totalTasks})</span>
          </span>
          <span className="fusion-history-tasks-indicator">
            <small>{tasksOpen ? tr(lang, '点击收起', 'Collapse') : tr(lang, '点击展开', 'Expand')}</small>
            <span className="fusion-history-tasks-chevron" aria-hidden="true" />
          </span>
        </summary>
        <div className="fusion-history-tasks-content">
          {!page.tasks.length && <p>{tr(lang, '还没有 Fusion 任务。', 'No Fusion tasks yet.')}</p>}
          <ol>{page.tasks.map(task => <li key={task.id}>
            <div className="fusion-history-item-header">
              <div>
                <strong>{task.title}</strong>
                <small>
                  {new Date(task.createdAt).toLocaleString()} · {task.mode === 'completed' ? tr(lang, '已结束', 'finished') : task.phase} · {tr(lang, `${task.usage.calls} 次请求`, `${task.usage.calls} requests`)}{task.takeovers ? tr(lang, ` · Lead 接手 ${task.takeovers} 次`, ` · ${task.takeovers} Lead takeovers`) : ''}
                </small>
              </div>
              <div className="fusion-history-actions">
                {confirmingId === task.id ? (
                  <>
                    <span className="fusion-history-confirm-text">{tr(lang, '确定清除？', 'Delete?')}</span>
                    <button
                      type="button"
                      disabled={Boolean(deletingId)}
                      onClick={() => void handleDelete(task.id)}
                    >
                      {deletingId === task.id ? tr(lang, '正在清除…', 'Deleting…') : tr(lang, '确认', 'Confirm')}
                    </button>
                    <button
                      type="button"
                      className="fusion-btn-subtle"
                      disabled={Boolean(deletingId)}
                      onClick={() => { setConfirmingId(null); setRowError(null) }}
                    >
                      {tr(lang, '取消', 'Cancel')}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={Boolean(deletingId)}
                    onClick={() => { setError(''); setRowError(null); setConfirmingId(task.id) }}
                    aria-label={tr(lang, `清除任务 ${task.title}`, `Delete task ${task.title}`)}
                  >
                    {tr(lang, '清除记录', 'Clear')}
                  </button>
                )}
              </div>
            </div>
            {rowError?.id === task.id && (
              <p role="alert" className="fusion-history-row-error" style={{ color: 'var(--dsw-alias-state-error-primary, #e5484d)', margin: '6px 0 0', fontSize: '12px' }}>
                {rowError.message}
              </p>
            )}
            <details><summary>{tr(lang, '记录详情', 'Details')}</summary><p>{tr(lang, '任务', 'Task')}: {task.id}</p><p>{tr(lang, '会话', 'Session')}: {task.sessionId}</p>
              <p>{tr(lang, `验证状态：${task.verification}。历史运行状态不代表当前仍在执行。`, `Verification: ${task.verification}. A recorded state does not mean it is still running.`)}</p>
              <p>{tr(lang, '输入', 'Input')} {tokens(lang, task.usage.input, task.usage.calls)} · {tr(lang, '缓存读取', 'cache read')} {tokens(lang, task.usage.cacheRead, task.usage.calls)} · {tr(lang, '总输出', 'Total output')} {outputTokens(lang, task.usage, task.usage.calls)} Token</p>
            </details>
          </li>)}</ol>
          <div className="fusion-actions"><button disabled={loading || !cursor} onClick={() => setCursor('')}>{tr(lang, '最新记录', 'Newest')}</button>
            <button disabled={loading || !page.nextCursor} onClick={() => setCursor(page.nextCursor!)}>{tr(lang, '更早记录', 'Older')}</button></div>
        </div>
      </details>
    </>}
    </div>
  </details>
}
