# 从 `dsh-tauri-acp` 迁移到内建 ACP 线路

[ATTRIBUTION-ACP.md](ATTRIBUTION-ACP.md) · English: [Migrating from dsh-tauri-acp](#english-migrating-from-dsh-tauri-acp)

**这个集成版本**（本仓库当前未发布的树）自带 ACP（Agent Client Protocol）线路：Host 实现以 MIT 许可并入本插件
（见 [ATTRIBUTION-ACP.md](ATTRIBUTION-ACP.md)），因此不再需要单独安装 `dsh-tauri-acp`
（也就是 [`deepseek-harness-acp`](https://github.com/Fleey/deepseek-harness-acp) 发布的那个包）。
这一路 ACP 整合在本仓库里尚未发布成版本，所以这里不给发布日期或版本号。

## 1. 为什么必须先停用旧包

**已核实**的冲突只有一处：同一个 provider 路由名被两处注册。

| 名字 | 冲突结果 |
| --- | --- |
| 同一个 provider 路由（例如 `devin`） | `llm.registerAdapter` 拒绝重复注册（`DUPLICATE_ADAPTER`），加载阶段直接失败 |

Fusion 自己的 Sidekick 工具桥挂在 `/api/fusion/acp-mcp`，是**本插件私有**的路径与实现，旧包不使用它；
这里不声称它与上游存在冲突。客户端 slot 层面的冲突同样没有经过核实，因此不做断言。

本插件的原则不变：**不改你的 profile、不替你卸载、不动你的数据**。停用动作必须由你手动完成。

## 2. 停用 / 移除旧包（手动）

```sh
# 方式 A：从 profile 里移除
dsh plugin --profile web remove dsh-tauri-acp
```

```sh
# 方式 B：保留安装但不启用（编辑 profile 里该行的 enabled: false）
dsh plugin --profile web list
```

桌面端：左侧边栏 **插件** → 找到 `dsh-tauri-acp` → 关闭或卸载。然后退出并重开 DSH
（Web 端重启 Host 并刷新页面）。

## 3. 把 ACP 线路搬进本插件

旧包的 `agents` 与这里的 `acp.agents` 是同一套字段（`command`、`args`、`env`、`permission`、
`discoverModels`、`contextWindow` 等），键就是模型选择器里的 provider 路由名。原样搬过去即可：

```yaml
- id: dsh-agent-studio-fusion
  name: '@sqdr2/dsh-agent-studio-fusion'
  config:
    acp:
      agents:
        my-agent:
          command: /absolute/path/to/acp-agent   # 必填；绝对路径更稳，PATH 上的命令也可用
          args: []
          models:
            - id: default                        # 可整段省略：省略时按 discoverModels 询问
          permission: ask          # ask | allow | read-only | reject
```

- `command` **必填**，是 agent 的可执行命令。写成**绝对路径更稳**（桌面端启动的 GUI 进程 PATH 往往比终端短），
  但 PATH 上的命令同样可用：Host 用 node 的 `spawn` 直接起这个命令，不经过 shell，也不要求绝对路径。
- `args` 可空。
- `models` **可整段省略**：省略或留空时，按 `discoverModels`（默认 `true`）向 agent 询问模型，问不到就用回退的
  `default` 模型；显式写了 `models` 时每一项都必须有 `id`。
- 其余字段与默认值见 `src/host/acp/config.ts` 与 [COMPATIBILITY.md](COMPATIBILITY.md)。
- 配置在 **Host 启动时读取一次**，改完或导入后都需要重启 Host 才会生效。浏览器在左侧栏 **Fusion** →
  **ACP 线路** 中提供了配置导入能力，支持粘贴配置 JSON 解析预览并批量导入到 `dsh-fusion → acp.agents`，
  但范围仅限导入流程，不提供完整 Agent 编辑后台、在线路由管理或实时模型发现与状态。

## 4. 数据与前缀

- 旧包自己的数据目录/键不会被本插件读取，也不会被删除。
- **Fusion 不迁移活动的 ACP 进程会话或 agent 自己维护的历史**：进程随 Host 结束而结束，agent 侧的会话/历史留在
  agent 那边。DSH 的会话记录留在 DSH 里，不受影响；agent 自己管理的认证与凭据也留在 agent 那边。
- 本插件把学到的 ACP 能力缓存写到 `$DSH_HOME/cache/dsh-fusion/`（`prompt-capabilities.json`、
  `context-windows.json`），与旧包的缓存分开，互不覆盖。
- 需要重新认证的 agent（例如会自己登录的 CLI），认证状态在 agent 自己那边，迁移不影响。

## 5. 当前桥接的实际边界（Fusion 自己加的那一层）

这一层是 **Fusion 特有**的加固，不是"与上游一致"：上游没有这个 Sidekick 工具桥。

- Sidekick 只有在 Fusion 真正派发任务时才会拿到 Host 工具的 MCP 桥；其余 ACP 会话不带任何 MCP server。
- 桥挂在 Host 自己 origin 上的固定路径 `/api/fusion/acp-mcp`，token 是 32 字节随机数，只走
  `Authorization: Bearer` 头，不进 URL；并绑定单个任务与单个 session。
- 授权只由 coordinator 的运行时事实决定，任务结束、会话替换或连接断开都会撤销。
- 详见 [ATTRIBUTION-ACP.md](ATTRIBUTION-ACP.md) 的 "What changed" 一节；不要为了让某个 agent 能跑通就放宽这些前提。

## 6. 界面去哪了

左侧边栏 **Fusion** → 顶部三个区域按钮 **Fusion 组合 / Antigravity / ACP 线路** 中的 **ACP 线路**。
那里包含**配置说明与导入能力**：不仅给出 `acp.agents` 的最小示例、重启要求，还支持直接粘贴旧版配置 JSON、灰色示例占位、
解析预览、选择路线并批量导入到 `dsh-fusion → acp.agents`。
导入后会明确提示需要重启 Host 生效；范围仅限导入流程，不实现完整 Agent 编辑后台、在线路由管理或实时模型发现与连接状态。

---

# English: migrating from `dsh-tauri-acp`

**This integrated build** (the current, unreleased tree of this repository) hosts ACP (Agent Client
Protocol) routes itself: the Host implementation is merged here under its MIT license (see
[ATTRIBUTION-ACP.md](ATTRIBUTION-ACP.md)), so the separate `dsh-tauri-acp` package — the published form of
[`deepseek-harness-acp`](https://github.com/Fleey/deepseek-harness-acp) — is no longer needed. This ACP
integration has not been released as a version here, so no release date or version number is claimed.

## 1. Why the old package has to go first

The one **verified** conflict is a provider route name registered twice:

| Name | Result |
| --- | --- |
| the same provider route (e.g. `devin`) | `llm.registerAdapter` refuses a second registration (`DUPLICATE_ADAPTER`), so the Host fails at load |

Fusion's own Sidekick tool bridge lives at `/api/fusion/acp-mcp` — a **private** path and implementation of
this plugin that the old package does not use — so no conflict with upstream is claimed for it. Client-slot
collisions between the two packages were likewise not verified and are not asserted.

This plugin never edits your profile, never uninstalls anything and never moves your data: the disable
step is yours to perform.

## 2. Disable or remove the old package (manual)

```sh
dsh plugin --profile web remove dsh-tauri-acp
```

Or keep it installed with `enabled: false` on its profile row. In the desktop app: **Plugins** in the
left sidebar → `dsh-tauri-acp` → disable or uninstall. Then quit and reopen DSH (for the Web Host:
restart it and reload the page).

## 3. Move the routes into this plugin

The old package's `agents` and this plugin's `acp.agents` use the same fields (`command`, `args`, `env`,
`permission`, `discoverModels`, `contextWindow`, …); the key is the provider route shown in the model
menu. Move it across verbatim:

```yaml
- id: dsh-agent-studio-fusion
  name: '@sqdr2/dsh-agent-studio-fusion'
  config:
    acp:
      agents:
        my-agent:
          command: /absolute/path/to/acp-agent   # required; absolute is more reliable, PATH also works
          args: []
          models:
            - id: default                        # may be omitted entirely; then discoverModels asks
          permission: ask          # ask | allow | read-only | reject
```

- `command` is **required**: it is the agent executable. An **absolute path is more reliable** (a
  GUI-launched Host usually has a shorter PATH than a terminal), but a command on PATH works too — the
  Host `spawn`s it directly, with no shell and no absolute-path requirement.
- `args` may be empty.
- `models` may be **omitted entirely**: absent or empty means the route asks the agent via
  `discoverModels` (default `true`) and falls back to the `default` model when nothing is advertised; an
  explicit `models` list needs an `id` on every entry.
- The remaining fields and their defaults are in `src/host/acp/config.ts` and
  [COMPATIBILITY.md](COMPATIBILITY.md).
- The routes are read **once when the Host starts**, so a Host restart is required after changes or imports.
  An in-browser import interface is provided at left sidebar **Fusion** → **ACP routes** to paste configuration
  JSON, preview parsed routes, and import them directly into `dsh-fusion → acp.agents`. The scope is strictly
  limited to the import flow; no full agent editing backend, online route management, or live model discovery/status is offered.

## 4. Data and caches

- The old package's own data directory and keys are not read by this plugin and are never deleted.
- **Fusion does not migrate live ACP process sessions or agent-managed history.** A process ends with the
  Host; the agent's own sessions and history stay with the agent. DSH's session history stays in DSH and is
  unaffected, and credentials the agent manages itself stay with the agent.
- The learned ACP facts this plugin caches live in `$DSH_HOME/cache/dsh-fusion/`
  (`prompt-capabilities.json`, `context-windows.json`), separate from the old package's cache.
- An agent that authenticates itself keeps its own credentials outside DSH; migration does not touch them.

## 5. The bridge boundary as it actually is (Fusion's own layer)

This layer is **Fusion-specific hardening**, not something inherited from upstream — upstream has no such
Sidekick tool bridge.

- A Sidekick receives the Host-tool MCP bridge only while Fusion is actually dispatching it; every other
  ACP session opens with no MCP servers.
- The bridge is mounted on the Host's own origin at the fixed path `/api/fusion/acp-mcp`; its token is 32
  random bytes carried only in the `Authorization: Bearer` header, never in the URL, and bound to one
  dispatch and one session.
- Authorization comes solely from the coordinator's live facts; it is revoked when the task, session or
  connection ends.
- See "What changed" in [ATTRIBUTION-ACP.md](ATTRIBUTION-ACP.md). Do not relax those preconditions to
  make one agent work.

## 6. Where the UI went

Left sidebar **Fusion** → the three section buttons **Fusion combos / Antigravity / ACP routes** →
**ACP routes**. That panel provides both **setup guidance and configuration import**: alongside the minimal
`acp.agents` example and restart instructions, it restores the legacy configuration import flow, allowing
pasting configuration JSON, previewing parsed routes, selecting routes, and saving them directly into
`dsh-fusion → acp.agents`. An explicit notice indicates that a Host restart is required after importing.
The scope is limited strictly to the import flow; no full agent editing backend, online route management,
or live model discovery and connection status is provided.
