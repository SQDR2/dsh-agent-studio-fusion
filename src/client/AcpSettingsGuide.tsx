import { useState } from 'react'
import { tr, useLang } from './i18n.js'
import {
  parseAgentImport,
  importOpsOf,
  useAcpConfigForm,
  type AgentImport,
} from './acp-import.js'

/**
 * The ACP section of the Fusion page.
 *
 * This section provides both setup guidance and a configuration importer:
 * it accepts JSON from other ACP clients (or previous dsh-tauri-acp installations)
 * and writes selected routes into `dsh-fusion → acp.agents` via DSH ConfigForms.
 * A Host restart is required after saving or importing.
 */
const styles = `
.acp-guide{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-module-platform);padding:16px;display:flex;flex-direction:column;gap:12px}
.acp-guide h3{margin:0;font-size:15px;font-weight:600}
.acp-guide h4{margin:0;font-size:13px;font-weight:600}
.acp-guide p{margin:0;font-size:13px;line-height:21px;color:var(--dsw-alias-label-secondary)}
.acp-guide ol,.acp-guide ul{margin:0;padding-left:20px;font-size:13px;line-height:21px;color:var(--dsw-alias-label-secondary);display:flex;flex-direction:column;gap:6px}
.acp-guide code{font-size:12px;overflow-wrap:anywhere}
.acp-guide pre{box-sizing:border-box;width:100%;margin:0;padding:12px;overflow:auto;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px}
.acp-guide .acp-note{display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1)}
.acp-guide [data-kind=warning]{color:var(--dsw-alias-label-primary)}
.acp-import-label{display:flex;flex-direction:column;gap:6px;width:100%}
.acp-field-hint{font-size:12px;color:var(--dsw-alias-label-secondary)}
.acp-import-textarea{box-sizing:border-box;width:100%;min-height:120px;padding:10px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-family:monospace;font-size:12px;line-height:18px;resize:vertical}
.acp-import-textarea::placeholder{color:var(--dsw-alias-label-tertiary,#888)}
.acp-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.acp-btn-primary{border:1px solid var(--dsw-alias-border-l2);border-radius:18px;background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary,#1677ff));color:var(--dsw-alias-label-primary-foreground,#fff);padding:7px 18px;font:inherit;font-size:13px;cursor:pointer}
.acp-btn-secondary{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);padding:6px 14px;font:inherit;font-size:13px;cursor:pointer}
.acp-btn-ghost{border:0;background:transparent;color:var(--dsw-alias-label-secondary);padding:6px 12px;font:inherit;font-size:13px;cursor:pointer}
.acp-guide button:disabled{opacity:.5;cursor:default}
.acp-guide button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.acp-banner{box-sizing:border-box;width:100%;padding:10px 12px;border-radius:6px;font-size:13px;line-height:19px;display:flex;flex-direction:column;gap:4px}
.acp-banner-error{background:rgba(248,81,73,0.1);border:1px solid rgba(248,81,73,0.4);color:var(--dsw-alias-state-error-primary,#cf222e)}
.acp-banner-warning{background:rgba(210,153,34,0.1);border:1px solid rgba(210,153,34,0.4);color:#d29922}
.acp-banner-success{background:rgba(46,160,67,0.1);border:1px solid rgba(46,160,67,0.4);color:#2ea043}
.acp-entries-list{display:flex;flex-direction:column;gap:8px}
.acp-entry-row{padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-module-platform)}
.acp-entry-checkbox-label{display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:13px}
.acp-entry-details{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1 1 auto}
.acp-entry-header{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.acp-entry-name{font-weight:600}
.acp-entry-cmd{font-size:12px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block}
.acp-tag{display:inline-flex;align-items:center;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:500}
.acp-tag-neutral{background:var(--dsw-alias-interactive-bg-hover,#eee);color:var(--dsw-alias-label-secondary)}
.acp-tag-success{background:rgba(46,160,67,0.15);color:#2ea043;border:1px solid rgba(46,160,67,0.3)}
.acp-tag-warning{background:rgba(210,153,34,0.15);color:#d29922;border:1px solid rgba(210,153,34,0.3)}
.acp-hint-skipped{font-size:12px;color:var(--dsw-alias-label-secondary);padding-left:4px}
.acp-import-footer{display:flex;align-items:center;justify-content:flex-end;gap:10px;padding-top:4px}
.acp-restart-notice{font-size:13px;font-weight:500;margin-top:2px}
.acp-status-hint{font-size:12px;color:var(--dsw-alias-label-secondary)}
`

const PLACEHOLDER = `{
  "agent_servers": {
    "Claude": {
      "command": "npx",
      "args": ["-y", "@agentclientprotocol/claude-agent-acp"],
      "env": {}
    }
  }
}`

const CONFIG_EXAMPLE = `- id: dsh-fusion
  name: '@sqdr2/dsh-fusion'
  config:
    acp:
      agents:
        my-agent:
          command: /absolute/path/to/acp-agent
          args: []
          models:
            - id: default`

function translateIssue(reason: string, lang: 'zh' | 'en'): string {
  switch (reason) {
    case 'importMissingCommand':
      return tr(lang, '缺少启动命令', 'missing command')
    case 'importBadArgs':
      return tr(lang, 'args 必须是字符串数组', 'args must be an array of strings')
    case 'importBadEnv':
      return tr(lang, 'env 必须是键值均为字符串的对象', 'env must be an object of strings')
    default:
      return reason
  }
}

export function AcpSettingsGuide() {
  const lang = useLang()
  const { status, value, user, revision, writable, form } = useAcpConfigForm()

  const [text, setText] = useState('')
  const [parsed, setParsed] = useState<AgentImport | null>(null)
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error' | 'warning'; message: string } | null>(null)

  const entries = parsed?.ok === true ? parsed.entries : []
  const selected = entries.filter(entry => !excluded.has(entry.route))

  const toggle = (route: string, include: boolean): void => {
    setExcluded(current => {
      const next = new Set(current)
      if (include) next.delete(route)
      else next.add(route)
      return next
    })
  }

  const canImport =
    status === 'ready' &&
    writable &&
    revision !== undefined &&
    selected.length > 0 &&
    !busy &&
    form !== undefined

  const handleImport = async () => {
    if (!canImport || !form || revision === undefined) return
    setBusy(true)
    setFeedback(null)
    try {
      const ops = importOpsOf(selected)
      const accepted = await form.mutate(ops, revision)
      if (accepted) {
        setFeedback({
          tone: 'success',
          message: tr(
            lang,
            `成功导入 ${selected.length} 条 ACP 线路到 dsh-fusion → acp.agents。`,
            `Successfully imported ${selected.length} ACP route${selected.length > 1 ? 's' : ''} to dsh-fusion → acp.agents.`
          ),
        })
      } else {
        setFeedback({
          tone: 'error',
          message: tr(
            lang,
            'Host 拒绝了配置写入（配置版本可能已过期或被外部修改），未应用更改。请刷新后重试。',
            'Host rejected the configuration write (configuration may be stale or modified concurrently). No changes applied; refresh and try again.'
          ),
        })
      }
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: tr(
          lang,
          `导入失败：${error instanceof Error ? error.message : String(error)}`,
          `Import failed: ${error instanceof Error ? error.message : String(error)}`
        ),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="acp-guide" aria-labelledby="acp-guide-title">
      <style>{styles}</style>
      <h3 id="acp-guide-title">{tr(lang, 'ACP 接入说明', 'ACP setup guide')}</h3>
      <p>
        {tr(
          lang,
          'ACP（Agent Client Protocol）代理作为独立模型线路接进来，可以直接被选为 Lead 或 Sidekick。本区域提供接入说明与旧版配置导入能力。路由定义在插件配置里，修改或导入后需要重启 Host 才会生效；这里不提供在线状态或模型发现。',
          'ACP (Agent Client Protocol) agents join as their own model routes, so one can be the Lead or the Sidekick directly. This section provides setup guidance and configuration import. Routes live in plugin configuration and require a Host restart after changes or imports; no live status or model discovery is offered here.'
        )}
      </p>

      {/* Import card */}
      <div className="acp-note" role="region" aria-label={tr(lang, '导入 ACP 线路配置', 'Import ACP route configuration')}>
        <h4>{tr(lang, '导入 ACP 线路配置', 'Import ACP route configuration')}</h4>
        <p>
          {tr(
            lang,
            '支持粘贴 Zed 配置中的 agent_servers、本插件的 agents 或裸 server 映射 JSON。解析后可选择要导入的线路并批量写入 dsh-fusion → acp.agents。',
            'Paste JSON from Zed\'s agent_servers, this plugin\'s agents, or a bare server map. Parse to preview, select routes, and import directly into dsh-fusion → acp.agents.'
          )}
        </p>

        {status === 'loading' && (
          <p role="status" className="acp-status-hint">
            {tr(lang, '正在读取配置表单…', 'Loading configuration form…')}
          </p>
        )}
        {status === 'unavailable' && (
          <p role="status" className="acp-status-hint">
            {tr(lang, '配置表单当前不可用（处于内存模式或尚未连接 Host）', 'Configuration form is currently unavailable (memory mode or disconnected from Host)')}
          </p>
        )}
        {status === 'ready' && !writable && (
          <p role="status" className="acp-status-hint">
            {tr(lang, '当前配置只读，无法导入', 'Configuration is read-only; importing is disabled')}
          </p>
        )}

        <label className="acp-import-label">
          <span className="acp-field-hint">{tr(lang, '配置 JSON', 'Configuration JSON')}</span>
          <textarea
            className="acp-import-textarea"
            value={text}
            placeholder={PLACEHOLDER}
            disabled={busy}
            aria-label={tr(lang, '粘贴 ACP 配置 JSON', 'Paste ACP configuration JSON')}
            onChange={event => {
              setText(event.target.value)
              setParsed(null)
              setExcluded(new Set())
              setFeedback(null)
            }}
          />
        </label>

        <div className="acp-actions">
          <button
            type="button"
            className="acp-btn-secondary"
            disabled={busy || text.trim().length === 0}
            onClick={() => {
              setFeedback(null)
              setParsed(parseAgentImport(text, { value, user }))
              setExcluded(new Set())
            }}
          >
            {tr(lang, '解析配置', 'Parse configuration')}
          </button>
          {entries.length > 1 && (
            <button
              type="button"
              className="acp-btn-ghost"
              disabled={busy}
              onClick={() =>
                setExcluded(selected.length === entries.length ? new Set(entries.map(e => e.route)) : new Set())
              }
            >
              {tr(
                lang,
                selected.length === entries.length ? '全不选' : '全选',
                selected.length === entries.length ? 'Deselect all' : 'Select all'
              )}
            </button>
          )}
        </div>

        {parsed?.ok === false && (
          <div role="alert" className="acp-banner acp-banner-error">
            {tr(lang, `解析失败：${parsed.error}`, `Parse failed: ${parsed.error}`)}
          </div>
        )}

        {parsed?.ok === true && entries.length === 0 && (
          <div role="status" className="acp-banner acp-banner-warning">
            {tr(lang, '未找到有效的 Agent 配置', 'No valid agent configuration found')}
          </div>
        )}

        {entries.length > 0 && (
          <div className="acp-entries-list" role="group" aria-label={tr(lang, '解析得到的线路列表', 'Parsed routes list')}>
            {entries.map(entry => {
              const isChecked = !excluded.has(entry.route)
              const args = Array.isArray(entry.profile.args) ? entry.profile.args : []
              const cmdLine = [entry.profile.command, ...args].join(' ')
              return (
                <div key={entry.route} className="acp-entry-row">
                  <label className="acp-entry-checkbox-label">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={busy}
                      aria-label={tr(lang, `选择导入 ${entry.name}`, `Select import ${entry.name}`)}
                      onChange={event => toggle(entry.route, event.target.checked)}
                    />
                    <span className="acp-entry-details">
                      <span className="acp-entry-header">
                        <strong className="acp-entry-name">{entry.name}</strong>
                        <span className="acp-tag acp-tag-neutral">{entry.route}</span>
                        <span className={`acp-tag acp-tag-${entry.replaces ? 'warning' : 'success'}`}>
                          {tr(lang, entry.replaces ? '替换现有' : '新建线路', entry.replaces ? 'Replace' : 'New')}
                        </span>
                      </span>
                      <code className="acp-entry-cmd" title={cmdLine}>{cmdLine}</code>
                    </span>
                  </label>
                </div>
              )
            })}
          </div>
        )}

        {parsed?.ok === true && parsed.skipped.map(issue => (
          <div key={issue.name} className="acp-hint-skipped">
            {tr(
              lang,
              `已跳过「${issue.name}」：${translateIssue(issue.reason, 'zh')}`,
              `Skipped "${issue.name}": ${translateIssue(issue.reason, 'en')}`
            )}
          </div>
        ))}

        <div className="acp-import-footer">
          <button
            type="button"
            className="acp-btn-primary"
            disabled={!canImport}
            onClick={() => { void handleImport() }}
          >
            {tr(
              lang,
              busy ? '正在导入…' : `导入 ${selected.length} 个 Agent`,
              busy ? 'Importing…' : `Import ${selected.length} Agent${selected.length === 1 ? '' : 's'}`
            )}
          </button>
        </div>

        {feedback && (
          <div
            role={feedback.tone === 'error' ? 'alert' : 'status'}
            className={`acp-banner acp-banner-${feedback.tone}`}
          >
            <div>{feedback.message}</div>
            {feedback.tone === 'success' && (
              <div className="acp-restart-notice">
                <strong>{tr(lang, '重要提示：', 'Important: ')}</strong>
                {tr(
                  lang,
                  '线路已写入 acp.agents 配置，必须重启 Host 才能使新线路生效。',
                  'Routes written to acp.agents configuration; you must restart the Host for new routes to take effect.'
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="acp-note">
        <h4>{tr(lang, '配置位置', 'Where the routes are configured')}</h4>
        <p>
          {tr(
            lang,
            '每条 ACP 线路写在本插件的 acp.agents 里，键就是模型选择器里显示的 provider 路由名。改完或导入后需要重启 Host 才会生效：配置在插件安装时读取一次。',
            'Each ACP route lives in this plugin\'s acp.agents block; the key is the provider route name shown in the model menu. A Host restart is required after a change or import, because the routes are read once when the plugin installs.'
          )}
        </p>
        <pre><code>{CONFIG_EXAMPLE}</code></pre>
        <p>
          {tr(
            lang,
            'command 必填，是 agent 的可执行命令；写成绝对路径更稳（从桌面端启动时 GUI 进程的 PATH 往往比终端短），但 PATH 上的命令同样可用，因为 Host 直接 spawn 这个命令。args 可留空。models 可以整段省略：省略或留空时按 discoverModels（默认 true）向 agent 询问模型，问不到就用回退的 default 模型；写了 models 则每一项都要有 id。其余可选字段（permission、contextWindow、startupTimeoutMs 等）见 docs/COMPATIBILITY.md。',
            'command is required: it is the agent executable. An absolute path is more reliable (a GUI-launched Host often has a shorter PATH than a terminal), but a command on PATH works too, because the Host spawns it directly. args may be empty. models may be omitted entirely: absent or empty means the route asks the agent via discoverModels (default true) and falls back to a default model when nothing is advertised; if you do list models, every entry needs an id. The remaining optional fields (permission, contextWindow, startupTimeoutMs, …) are listed in docs/COMPATIBILITY.md.'
          )}
        </p>
      </div>

      <div className="acp-note">
        <h4>{tr(lang, '配置之后', 'After configuring')}</h4>
        <p>
          {tr(
            lang,
            '重启 Host 后，这些 ACP 线路会出现在原生模型选择和 Fusion 的组合里，可以像其他模型一样选为 Lead 或 Sidekick。它们是否列出工具、如何应答权限请求，由每个 agent 自己的实现和这里的 permission 设置决定。Fusion 只在本插件自己派发 Sidekick 任务时，才在该会话的 ACP session/new 里声明 Host 工具桥；其余 ACP 会话不带任何 MCP server。',
            'Once the Host restarts, those ACP routes appear in the native model picker and in Fusion combos, and can be chosen as Lead or Sidekick like any other model. Whether they expose tools and how they answer permission requests is decided by each agent\'s own implementation and by the permission setting you gave it. Fusion declares Host tools in an ACP session/new only while it is dispatching a Sidekick on that exact session; every other ACP session opens with no MCP server.'
          )}
        </p>
      </div>

      <div className="acp-note">
        <h4>{tr(lang, '迁移提醒', 'Before you migrate')}</h4>
        <p data-kind="warning">
          {tr(
            lang,
            '如果你以前装过独立的 dsh-tauri-acp（或 deepseek-harness-acp），请先手动停用或移除它，再把同样的 provider 名写进这里的 acp.agents：同一个 provider 名被两处注册会在加载时被拒绝（DUPLICATE_ADAPTER）。本插件不会改你的 profile，也不会替你卸载任何东西。',
            'If you previously installed the standalone dsh-tauri-acp (or deepseek-harness-acp), disable or remove it manually before assigning the same provider names here: two registrations of one provider name are refused at load (DUPLICATE_ADAPTER). This plugin never edits your profile and never uninstalls anything for you.'
          )}
        </p>
        <p>
          {tr(
            lang,
            '完整步骤见 docs/MIGRATION-ACP.md；ACP 部分的上游来源与许可见 docs/ATTRIBUTION-ACP.md。',
            'Full steps are in docs/MIGRATION-ACP.md; the upstream source and license for the ACP part are in docs/ATTRIBUTION-ACP.md.'
          )}
        </p>
      </div>
    </section>
  )
}
