import { useState } from 'react'
import { DiffBlock, TerminalBlock } from '@deepseek-ai/dsh-client-ui-primitives'
import { activityDiffs } from './activity-model.js'
import { presentedCall, presentedCommand, presentedCwd, presentedDescription, presentedExitCode,
  presentedPath, presentedQuery, presentsTerminal } from './agy-activity.js'
import { tr, useLang, type Lang } from './i18n.js'
import type { ActivityRow } from './activity-model.js'

const labelsFor = (lang: Lang) => ({ codeLabel: tr(lang, '代码', 'Code'), wrapLabel: tr(lang, '自动换行', 'Wrap'), unwrapLabel: tr(lang, '取消自动换行', 'No wrap'),
  copy: tr(lang, '复制', 'Copy'), copied: tr(lang, '已复制', 'Copied'), collapseAria: tr(lang, '收起内容', 'Collapse'), collapse: tr(lang, '收起', 'Collapse'),
  expandAria: (n: number) => tr(lang, `展开其余 ${n} 行`, `Show ${n} more lines`), expand: (n: number) => tr(lang, `展开其余 ${n} 行`, `Show ${n} more lines`) })
// `commandLine` is required by TerminalBlockLabels on DSH 0.2.1 and ignored on 0.2.0.
const terminalLabelsFor = (lang: Lang) => ({ ...labelsFor(lang), commandLine: (n: number) => tr(lang, `命令行第 ${n} 行`, `command line ${n}`),
  signal: (s: string) => tr(lang, `信号 ${s}`, `signal ${s}`), exitCode: (n: number) => tr(lang, `退出码 ${n}`, `exit code ${n}`),
  running: tr(lang, '执行中', 'Running'), failed: tr(lang, '执行失败', 'Failed'), done: tr(lang, '已返回', 'Done'), noOutput: tr(lang, '无输出', 'No output'), noExitCode: tr(lang, '未记录退出码', 'No exit code') })

// Native Host tools plus the agy operations a bridge route reports under its transport.
const titleFor = (lang: Lang): Record<string, string> => ({
  bash: tr(lang, '终端', 'Terminal'), pwsh: tr(lang, '终端', 'Terminal'),
  run_command: tr(lang, '终端', 'Terminal'), execute_command: tr(lang, '终端', 'Terminal'), ops_bash: tr(lang, '终端', 'Terminal'), sh: tr(lang, '终端', 'Terminal'), shell: tr(lang, '终端', 'Terminal'),
  read: tr(lang, '读取', 'Read'), view_file: tr(lang, '读取', 'Read'), read_file: tr(lang, '读取', 'Read'), open_file: tr(lang, '读取', 'Read'),
  write: tr(lang, '写入', 'Write'), write_to_file: tr(lang, '写入', 'Write'), write_file: tr(lang, '写入', 'Write'), create_file: tr(lang, '写入', 'Write'),
  edit: tr(lang, '编辑', 'Edit'), str_replace_editor: tr(lang, '编辑', 'Edit'), replace_file_content: tr(lang, '编辑', 'Edit'), edit_file: tr(lang, '编辑', 'Edit'), replace_in_file: tr(lang, '编辑', 'Edit'),
  glob: tr(lang, '查找文件', 'Find files'), find_by_name: tr(lang, '查找文件', 'Find files'), search_files: tr(lang, '查找文件', 'Find files'), ops_glob: tr(lang, '查找文件', 'Find files'),
  grep: tr(lang, '搜索', 'Search'), grep_search: tr(lang, '搜索', 'Search'), search_file_content: tr(lang, '搜索', 'Search'), ops_grep: tr(lang, '搜索', 'Search'), search: tr(lang, '搜索', 'Search'),
  job_output: tr(lang, '命令输出', 'Command output'), job_kill: tr(lang, '停止命令', 'Stop command'),
})

export function ActivityCard({ row, done, cwd, openFile }: {
  row: ActivityRow; done: boolean; cwd?: string; openFile(path: string): void
}) {
  const lang = useLang()
  const [open, setOpen] = useState(false)
  const presented = presentedCall(row.call.data.name, row.call.data.arguments)
  const result = row.result?.data.message
  const output = result?.content.flatMap(part => part.type === 'text' ? [part.text] : []).join('\n') ?? ''
  const path = presentedPath(presented)
  const command = presentedCommand(presented)
  const terminal = presentsTerminal(presented)
  const exit = presentedExitCode(presented, output)
  const failed = result?.isError || (exit !== undefined && exit !== 0)
  const diffs = activityDiffs(row)
  const label = titleFor(lang)[presented.tool] ?? presented.tool
  const summary = path ?? presentedDescription(presented) ?? command ?? presentedQuery(presented)
    ?? (presented.server === undefined ? label : `${presented.server}: ${label}`)
  const status = failed ? tr(lang, '失败', 'Failed') : !row.result ? (done ? tr(lang, '结果未记录', 'No result recorded') : tr(lang, '执行中', 'Running')) : ''
  return <div className="fusion-activity-row" data-fusion-tool={row.call.data.name}
    data-fusion-inner={presented.tool} data-fusion-call={row.id}>
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="fusion-activity-toggle">
      <span aria-hidden>{open ? '⌄' : '›'}</span><span>{label}</span>
      <span className="fusion-activity-summary">{summary}</span>
      {status && <small role="status" data-failed={Boolean(failed)}>{status}</small>}
    </button>
    {open && <div className="fusion-activity-body">
      {path && <button type="button" className="fusion-activity-file" onClick={() => openFile(path)}>{tr(lang, '打开', 'Open')} {path}</button>}
      {diffs.length ? <DiffBlock diffs={diffs} labels={labelsFor(lang)} maxLines={16} />
        : terminal && command ? <TerminalBlock command={command} cwd={presentedCwd(presented) ?? cwd} output={output}
          running={!row.result && !done} exitCode={exit} labels={terminalLabelsFor(lang)} />
          : <pre>{output || (presented.malformed ? presented.raw
            : row.result ? tr(lang, '已返回，无文本输出。', 'Returned without text output.') : presented.raw)}</pre>}
    </div>}
  </div>
}

export const activityStyles = `
.fusion-activity-row{font-size:13px;line-height:1.5;margin:4px 0;min-width:0;color:var(--dsw-alias-label-secondary)}
.fusion-activity-toggle{display:flex;align-items:center;gap:8px;width:100%;padding:6px 0;background:none;border:0;color:inherit;text-align:left;cursor:pointer;font:inherit}
.fusion-activity-toggle:focus-visible,.fusion-activity-file:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.fusion-activity-summary{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary)}
.fusion-activity-toggle small{white-space:nowrap}.fusion-activity-toggle small[data-failed=true]{color:var(--dsw-alias-state-error-primary)}
.fusion-activity-body{padding:4px 0 10px;overflow:hidden}.fusion-activity-body pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:360px;overflow:auto;font-size:12px}
.fusion-activity-file{font:inherit;border:0;background:none;color:var(--dsw-alias-brand-primary);padding:0 0 6px;cursor:pointer}
`
