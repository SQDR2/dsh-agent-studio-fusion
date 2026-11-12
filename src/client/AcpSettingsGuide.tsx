import { tr, useLang } from './i18n.js'

/**
 * The ACP section of the Fusion page.
 *
 * This is a setup guide, not a configuration surface: the ACP routes live in
 * the plugin's own `acp.agents` config block and are read when the Host starts,
 * so there is nothing to discover, poll, edit or save from the browser. Showing
 * a live status or a save button here would be a promise this plugin cannot
 * keep, so the page states what is true and what to do instead.
 *
 * Upstream `deepseek-harness-acp` shipped an editor for this; it was not ported
 * (see docs/ATTRIBUTION-ACP.md).
 */
const styles = `
.acp-guide{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-module-platform);padding:16px;display:flex;flex-direction:column;gap:12px}
.acp-guide h3{margin:0;font-size:15px;font-weight:600}
.acp-guide h4{margin:0;font-size:13px;font-weight:600}
.acp-guide p{margin:0;font-size:13px;line-height:21px;color:var(--dsw-alias-label-secondary)}
.acp-guide ol,.acp-guide ul{margin:0;padding-left:20px;font-size:13px;line-height:21px;color:var(--dsw-alias-label-secondary);display:flex;flex-direction:column;gap:6px}
.acp-guide code{font-size:12px;overflow-wrap:anywhere}
.acp-guide pre{box-sizing:border-box;width:100%;margin:0;padding:12px;overflow:auto;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px}
.acp-guide .acp-note{display:flex;flex-direction:column;gap:6px;padding:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1)}
.acp-guide [data-kind=warning]{color:var(--dsw-alias-label-primary)}
`

/**
 * One minimal, valid `acp.agents` entry.
 *
 * Field names and shapes match `src/host/acp/config.ts` exactly: `command` is
 * required, `args` defaults to `[]`, and a `models` entry needs only an `id`.
 * It deliberately carries no machine-specific path and no credential: the user
 * substitutes their own agent command.
 */
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

export function AcpSettingsGuide() {
  const lang = useLang()
  return <section className="acp-guide" aria-labelledby="acp-guide-title">
    <style>{styles}</style>
    <h3 id="acp-guide-title">{tr(lang, 'ACP 接入说明', 'ACP setup guide')}</h3>
    <p>{tr(lang,
      'ACP（Agent Client Protocol）代理作为独立模型线路接进来，可以直接被选为 Lead 或 Sidekick。本区域是接入说明：说明支持哪些配置、怎么设置。路由定义在插件配置里，不在浏览器里编辑，所以这里没有在线状态、模型发现或保存按钮。',
      'ACP (Agent Client Protocol) agents join as their own model routes, so one can be the Lead or the Sidekick directly. This section is setup guidance: it explains the supported settings and how to apply them. The routes are defined in plugin configuration rather than edited in the browser, so there is no live status, model discovery or save button here.')}</p>

    <div className="acp-note">
      <h4>{tr(lang, '配置位置', 'Where the routes are configured')}</h4>
      <p>{tr(lang,
        '每条 ACP 线路写在本插件的 acp.agents 里，键就是模型选择器里显示的 provider 路由名。改完后需要重启 Host 才会生效：配置在插件安装时读取一次。',
        'Each ACP route lives in this plugin\'s acp.agents block; the key is the provider route name shown in the model menu. A Host restart is required after a change, because the routes are read once when the plugin installs.')}</p>
      <pre><code>{CONFIG_EXAMPLE}</code></pre>
      <p>{tr(lang,
        'command 必填，是 agent 的可执行命令；写成绝对路径更稳（从桌面端启动时 GUI 进程的 PATH 往往比终端短），但 PATH 上的命令同样可用，因为 Host 直接 spawn 这个命令。args 可留空。models 可以整段省略：省略或留空时按 discoverModels（默认 true）向 agent 询问模型，问不到就用回退的 default 模型；写了 models 则每一项都要有 id。其余可选字段（permission、contextWindow、startupTimeoutMs 等）见 docs/COMPATIBILITY.md。',
        'command is required: it is the agent executable. An absolute path is more reliable (a GUI-launched Host often has a shorter PATH than a terminal), but a command on PATH works too, because the Host spawns it directly. args may be empty. models may be omitted entirely: absent or empty means the route asks the agent via discoverModels (default true) and falls back to a default model when nothing is advertised; if you do list models, every entry needs an id. The remaining optional fields (permission, contextWindow, startupTimeoutMs, …) are listed in docs/COMPATIBILITY.md.')}</p>
    </div>

    <div className="acp-note">
      <h4>{tr(lang, '配置之后', 'After configuring')}</h4>
      <p>{tr(lang,
        '重启 Host 后，这些 ACP 线路会出现在原生模型选择和 Fusion 的组合里，可以像其他模型一样选为 Lead 或 Sidekick。它们是否列出工具、如何应答权限请求，由每个 agent 自己的实现和这里的 permission 设置决定。Fusion 只在本插件自己派发 Sidekick 任务时，才在该会话的 ACP session/new 里声明 Host 工具桥；其余 ACP 会话不带任何 MCP server。',
        'Once the Host restarts, those ACP routes appear in the native model picker and in Fusion combos, and can be chosen as Lead or Sidekick like any other model. Whether they expose tools and how they answer permission requests is decided by each agent\'s own implementation and by the permission setting you gave it. Fusion declares Host tools in an ACP session/new only while it is dispatching a Sidekick on that exact session; every other ACP session opens with no MCP server.')}</p>
    </div>

    <div className="acp-note">
      <h4>{tr(lang, '迁移提醒', 'Before you migrate')}</h4>
      <p data-kind="warning">{tr(lang,
        '如果你以前装过独立的 dsh-tauri-acp（或 deepseek-harness-acp），请先手动停用或移除它，再把同样的 provider 名写进这里的 acp.agents：同一个 provider 名被两处注册会在加载时被拒绝（DUPLICATE_ADAPTER）。本插件不会改你的 profile，也不会替你卸载任何东西。',
        'If you previously installed the standalone dsh-tauri-acp (or deepseek-harness-acp), disable or remove it manually before assigning the same provider names here: two registrations of one provider name are refused at load (DUPLICATE_ADAPTER). This plugin never edits your profile and never uninstalls anything for you.')}</p>
      <p>{tr(lang,
        '完整步骤见 docs/MIGRATION-ACP.md；ACP 部分的上游来源与许可见 docs/ATTRIBUTION-ACP.md。',
        'Full steps are in docs/MIGRATION-ACP.md; the upstream source and license for the ACP part are in docs/ATTRIBUTION-ACP.md.')}</p>
    </div>
  </section>
}
