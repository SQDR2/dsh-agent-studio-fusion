# 从 `dsh-agy-worker` 迁移到内建 Antigravity（`agy`）

[ATTRIBUTION-AGY.md](ATTRIBUTION-AGY.md) · English: [Migrating from dsh-agy-worker](#english-migrating-from-dsh-agy-worker)

从 1.0.0 起，`@sqdr2/dsh-agent-studio-fusion` 自己就带 **完整** 的 Google Antigravity（`agy CLI`）能力：
`antigravity` 模型路线、`/agy` 命令、`agy_ask` / `agy_tool`、`/plugins/agy-worker/*` 路由、
账号池与额度、MCP 反向桥接，以及左侧边栏 Fusion 面板里的 Antigravity 管理控制台。

因此 **不需要也不可以** 再同时安装旧的独立插件 `@sqdr2/dsh-agy-worker`。

## 1. 为什么必须先停用旧插件（硬失败）

旧插件与内建能力在同一 Host 上同时启用不是"重复一点 UI"，而是 **启动即失败**，因为两者用的是
同一组全局名字：

| 名字 | 冲突结果 |
| --- | --- |
| `/plugins/agy-worker/*` HTTP 路由 | `webserver: duplicate exact route "/plugins/agy-worker/status"` |
| `antigravity` provider 路线 | `llm.registerAdapter` 拒绝重复注册（`DUPLICATE_ADAPTER`） |
| `/agy` 命令 | `command "agy" is already registered` |
| 客户端 `agy_tool` / `run_code` 工具卡 | keyed slot 拒绝同 key 同优先级注册 |

这些都是 DSH 与旧插件既有的规则，本插件不会绕过它们。

## 2. 停用 / 移除旧插件（手动，本插件不会代劳）

任选其一，**不要** 两个都留着：

```sh
# 方式 A：从 profile 里移除旧插件
dsh plugin --profile web remove @sqdr2/dsh-agy-worker
```

```sh
# 方式 B：保留安装但不启用（编辑 profile 里该行的 enabled: false）
dsh plugin --profile web list
```

桌面端：左侧边栏 **插件** → 找到 `dsh-agy-worker` → 关闭或卸载。然后退出并重开 DSH（Web 端重启 Host
并刷新页面）。本插件 **绝不** 自动改 profile、自动卸载，也不会替你删目录。

## 3. 迁移配置

旧插件的 cordis entry 配置（`enabled` / `agyBin` / `permissionMode` / `workspaceRoot` /
`defaultModel` / `defaultEffort` ……）现在写在 **本插件** 的 `agy` 子配置下。逐字搬过去即可：

```yaml
- id: dsh-agent-studio-fusion
  name: '@sqdr2/dsh-agent-studio-fusion'
  config:
    agy:
      enabled: true
      agyBin: ''
      permissionMode: skip        # Sidekick 必需，见第 5 节
      workspaceRoot: ''
      defaultModel: ''
      defaultEffort: ''
      mcpBridge: true             # Sidekick 必需
      mcpConfigScope: global
      mcpToolAllowlist: "fusion_submit_result,fusion_read_state,fusion_read_evidence,bash,read,write,edit,glob,grep,job_output,job_kill"
```

- 分层顺序与旧插件完全一致：**环境变量 `DSH_AGY_*` > 运行期覆盖文件 > `agy` 配置块 > 默认值**。
  也就是说 `DSH_AGY_*` 仍然有效，可以被 `/agy` 热改的键仍写在覆盖文件里。
- `enabled` 是 **安装期** 设置，不是运行期开关：
  - `enabled: false` 关闭的是 **provider 路线与全部后台能力** —— 不注册 `antigravity`、不注册 `agy_tool`
    镜像、不跑配额轮询 / 周预热 / MCP 反桥 / 媒体清扫；
  - `/plugins/agy-worker/*` 管理路由与 `/agy` 命令 **仍然存在**，所以你能用 `/agy status` 看它为什么是
    关闭的、用控制台查看配置，但它们不会因此把能力"打开"；
  - `/agy` 与控制台的 `config` 接口都 **不接受** `enabled` 作为可热改的键（`permissionMode`、
    `defaultModel`、`askTool`、`hiddenModels`、`autoWarmup` 等才是）。要重新打开，改 `agy` 配置块（或
    `DSH_AGY_ENABLED=1`）后重启 DSH。
- 差别在于哪些键在什么时候读：`enabled` 只在 **安装时** 决定是否挂 provider 与后台任务，所以它需要重启；
  其余键（`permissionMode`、`defaultModel`、`hiddenModels` 等）每次请求都会重新解析，`/agy mode` 之类的
  热改立即生效。

## 4. 迁移状态（手动复制）

**工作状态路径不变，账号池路径不同。** 本插件 **不会** 自动搬动任何目录：

| 内容 | 旧插件（`dsh-agy-worker`） | 本插件 | 是否需要手动复制 |
| --- | --- | --- | --- |
| 运行期覆盖、会话绑定、媒体缓存、预热历史 | `$DSH_HOME/agy-worker/` | `$DSH_HOME/agy-worker/`（同一路径） | 不需要 |
| 账号池 `pool.json` | `$DSH_STATE_DIR/agy-accounts/pool.json`（`DSH_STATE_DIR` 未设置时回退 `~/.dsh`） | `$DSH_HOME/agy-accounts/pool.json`（`DSH_HOME` 未设置时回退 `~/.dsh`） | **仅当两个根目录不同** |
| 每个账号的独立 HOME | `<账号池根>/<id>/` | `<账号池根>/<id>/` | 跟随账号池 |

两个环境变量都未设置时，`DSH_STATE_DIR` 与 `DSH_HOME` 都回退到 `~/.dsh`，因此两边是同一个目录，**什么都
不用做**。只有两个根目录真的不同时才需要复制一次账号池 —— 也就是 **`DSH_STATE_DIR` 被指到别处**，或者
**`DSH_HOME` 被指到别处**，只要两边展开后不是同一个目录：

```sh
# 1) 先退出 DSH（桌面版退出，Web 版停掉 Host），否则 pool.json 可能正被写。
# 2) 把 <STATE> 换成你原来的 DSH_STATE_DIR；目标目录写成展开后的绝对路径：
cp -a "<STATE>/agy-accounts/." "$HOME/.dsh/agy-accounts/"
#    目标永远是本插件读取的那个根（默认 ~/.dsh）；DSH_HOME 有设置时换成：
#    cp -a "<STATE>/agy-accounts/." "$DSH_HOME/agy-accounts/"
```

- 源路径末尾的 `/.` 与目标末尾的 `/` 是必须的：`cp -a <src> <dst>` 在 `<dst>` **已存在** 时会把源目录
  变成 `<dst>/agy-accounts`（多套一层），而本插件只读 `<dst>/pool.json`，于是账号会"消失"。
- 目标目录已存在是常态（首次启动就会建好），所以不要先删它；`cp -a .../.` 会把内容合并进去，同名文件
  （`pool.json`）被旧副本覆盖 —— 这正是你要的效果，但请先备份：`cp -a "$HOME/.dsh/agy-accounts" "$HOME/.dsh/agy-accounts.bak"`。
- 复制后 **保留** 原目录，确认账号与额度都列得出来，再自行决定是否删除旧副本。已登录的 Google 账号
  无需重新登录 —— 账号池里的凭据引用没有变化。

> 覆盖文件 `$DSH_HOME/agy-worker/runtime-overrides.json` 与旧插件同名同义、同路径，无需改名也无需复制；
> 旧插件停用后它不会再被写，内建能力直接接着用。

## 5. 把 agy 选作 Sidekick

内建能力等价于旧插件，所以三个条件一个都不能少（细节见
[docs/MCP-BRIDGE-SETUP.md](https://github.com/SQDR2/dsh-agy-worker/blob/main/docs/MCP-BRIDGE-SETUP.md)，仍适用于本实现）：

1. `mcpBridge: true`（默认已开）；
2. `permissionMode: skip`（headless 下 `plan` / `accept-edits` 会让 agy 自动拒绝 MCP 调用）；
3. `mcpToolAllowlist` 里包含 `fusion_submit_result`。

`agy_tool` 这条回传通道由 Fusion 自动加进 Worker 的工具天花板（`src/host/route-transport.ts`），
不需要手写。**本实现不修改该文件。**

## 6. 验证与排障

```sh
/agy status      # agy 版本、桥接状态、权限模式、账号与额度摘要
/agy pool        # 每个账号的实时额度与冷却
/agy models      # 刷新并列出发现的模型
/agy doctor      # 写一份诊断报告并给出路径
```

左侧边栏 **Fusion** → 页面标题 **DSH Agent Studio With Fusion** → 顶部区域按钮里的 **Antigravity**，就是原来的
管理控制台（账号、额度、模型可见性、权限模式、预热）。它不再是独立的侧栏入口，也不再是"插件"页面里的一张卡片 ——
这与"Fusion 是唯一入口"的设计一致。未选中该区域时控制台不会挂载，所以它也不会在后台轮询。

> 同一个页面里的 **ACP 线路** 区域只是接入说明；如果你还装着独立的 `dsh-tauri-acp`，迁移步骤见
> [`docs/MIGRATION-ACP.md`](MIGRATION-ACP.md)。

常见现象：

| 现象 | 原因与处理 |
| --- | --- |
| 启动报 `duplicate exact route` / `DUPLICATE_ADAPTER` / `already registered` | 旧插件仍在启用，按第 2 节停用它 |
| 模型菜单里没有 Antigravity 模型 | `agy` 二进制不在 PATH，或 `permissionMode`/登录未就绪；先看 `/agy status` |
| Worker 整轮只回文本、宿主报 `WORKER_TOOLS_UNREACHABLE` | 检查 `mcpBridge`、`permissionMode: skip` 与白名单是否含 `fusion_submit_result` |
| 账号列表是空的但旧插件里明明有账号 | 你设置了 `DSH_STATE_DIR`，按第 4 节手动复制一次 |

---

# English: migrating from `dsh-agy-worker`

Since 1.0.0 `@sqdr2/dsh-agent-studio-fusion` ships the **complete** Google Antigravity (`agy CLI`) capability
itself: the `antigravity` model route, the `/agy` command, `agy_ask` / `agy_tool`, the
`/plugins/agy-worker/*` HTTP surface, the account pool and quota, the reverse MCP bridge, and the
Antigravity console inside the Fusion panel in the left sidebar. You therefore do **not** install
`@sqdr2/dsh-agy-worker` any more — and must not run both.

## 1. Why the old plugin has to go first (hard failure)

Both halves use the same global names, so enabling them together fails at load, not cosmetically:

| Name | Result |
| --- | --- |
| `/plugins/agy-worker/*` routes | `webserver: duplicate exact route "/plugins/agy-worker/status"` |
| `antigravity` provider route | `llm.registerAdapter` refuses a second registration (`DUPLICATE_ADAPTER`) |
| `/agy` command | `command "agy" is already registered` |
| client `agy_tool` / `run_code` cards | the keyed `tool.call.toolview` slot refuses the same key at the same priority |

These are existing DSH and upstream rules; this plugin does not work around them.

## 2. Disable or remove the old plugin (manual)

```sh
dsh plugin --profile web remove @sqdr2/dsh-agy-worker
```

Or keep it installed with `enabled: false` on its profile row. In the desktop app: **Plugins** in the
left sidebar → `dsh-agy-worker` → disable or uninstall. Then quit and reopen DSH (for the Web Host:
restart it and reload the page). This plugin never edits a profile, never uninstalls anything and
never deletes a directory for you.

## 3. Move the configuration

The old entry config (`enabled` / `agyBin` / `permissionMode` / `workspaceRoot` / `defaultModel` /
`defaultEffort` …) now lives under this plugin's `agy` block:

```yaml
- id: dsh-agent-studio-fusion
  name: '@sqdr2/dsh-agent-studio-fusion'
  config:
    agy:
      enabled: true
      agyBin: ''
      permissionMode: skip        # required for a Sidekick
      workspaceRoot: ''
      defaultModel: ''
      defaultEffort: ''
      mcpBridge: true             # required for a Sidekick
      mcpConfigScope: global
      mcpToolAllowlist: "fusion_submit_result,fusion_read_state,fusion_read_evidence,bash,read,write,edit,glob,grep,job_output,job_kill"
```

Layering is unchanged: **`DSH_AGY_*` environment > runtime overrides file > the `agy` block >
defaults**. The `/agy` command still hot-edits the same overrides file.

`enabled` is an **install-time** setting, not a live switch:

- `enabled: false` turns off the **provider route and every background capability**: no
  `antigravity` registration, no `agy_tool` mirror, no quota polling, weekly warmup, MCP bridge or
  media sweep.
- The `/plugins/agy-worker/*` management routes and the `/agy` command **stay mounted**, so you can
  read `/agy status` and inspect the console configuration of a dormant capability. They do not turn
  it back on.
- Neither `/agy` nor the console's `config` endpoint accepts `enabled` as a settable key
  (`permissionMode`, `defaultModel`, `askTool`, `hiddenModels`, `autoWarmup`, … are settable). To
  re-enable, change the `agy` block (or `DSH_AGY_ENABLED=1`) and restart DSH.
- What differs is *when* each key is read: `enabled` decides at install whether the provider and
  timers are mounted, so it needs the restart; every other key is re-resolved per request, so a
  `/agy mode` change takes effect immediately.

## 4. Move the state (manual copy)

**The work-state path is unchanged; the account-pool path is different.** Nothing is moved
automatically:

| Content | Old plugin (`dsh-agy-worker`) | This plugin | Manual copy? |
| --- | --- | --- | --- |
| runtime overrides, session bindings, media cache, warmup history | `$DSH_HOME/agy-worker/` | `$DSH_HOME/agy-worker/` (same path) | no |
| account pool `pool.json` | `$DSH_STATE_DIR/agy-accounts/pool.json` (falls back to `~/.dsh`) | `$DSH_HOME/agy-accounts/pool.json` (falls back to `~/.dsh`) | **only when those two roots differ** |
| per-account isolated HOME | `<pool root>/<id>/` | `<pool root>/<id>/` | follows the pool |

With neither variable set, both `DSH_STATE_DIR` and `DSH_HOME` fall back to `~/.dsh`, so the two
paths are the same directory and there is **nothing to do**. The pool needs one copy only when the two
resolved roots differ — either because you pointed `DSH_STATE_DIR` elsewhere, **or** because you pointed
`DSH_HOME` elsewhere:

```sh
# 1) Quit DSH first (desktop: quit; Web: stop the Host) — pool.json may be mid-write.
# 2) Replace <STATE> with your old DSH_STATE_DIR; give the destination as an absolute path:
cp -a "<STATE>/agy-accounts/." "$HOME/.dsh/agy-accounts/"
#    With DSH_HOME set, the destination is "$DSH_HOME/agy-accounts/":
#    cp -a "<STATE>/agy-accounts/." "$DSH_HOME/agy-accounts/"
```

- The trailing `/.` on the source and the trailing `/` on the destination are load-bearing. With a
  plain `cp -a <src> <dst>` and an **existing** `<dst>`, the source lands at
  `<dst>/agy-accounts` — one level too deep — and this plugin reads `<dst>/pool.json`, so the
  accounts appear to vanish.
- An existing destination is normal (the first start creates it), so do not delete it first;
  `cp -a …/.` merges into it and overwrites the same-named `pool.json`, which is what you want. Back
  it up first anyway: `cp -a "$HOME/.dsh/agy-accounts" "$HOME/.dsh/agy-accounts.bak"`.
- Keep the original directory until the new location lists your accounts and quota. Existing Google
  logins need no re-authentication — the credential references inside the pool do not change.

> The overrides file `$DSH_HOME/agy-worker/runtime-overrides.json` has the same name, meaning and
> path upstream, so it needs no rename and no copy; once the old plugin is stopped nothing writes it
> any more and this capability picks it up in place.

## 5. Using agy as a Sidekick

The three requirements are the same as before, because the capability is the same:
`mcpBridge: true` (default), `permissionMode: skip` (headless mode cannot prompt for the MCP
permission), and an allowlist that admits `fusion_submit_result`. Fusion adds the `agy_tool`
transport to the Worker ceiling itself (`src/host/route-transport.ts`, unchanged by this port);
you do not write it by hand.

## 6. Where the console lives now

Left sidebar → **Fusion** → the page titled **DSH Agent Studio With Fusion** → the **Antigravity** button in
its section row. That is the old console (accounts, quota, model visibility, permission mode, warmup). It is no
longer its own sidebar panel and no longer a card on the Plugins page: Fusion is the single entry point, by design.
The console mounts only while that section is selected, so it never polls in the background.

> The **ACP routes** section of the same page is setup guidance only; if you still have the standalone
> `dsh-tauri-acp` installed, its migration steps are in [`docs/MIGRATION-ACP.md`](MIGRATION-ACP.md).

Troubleshooting:

| Symptom | Cause and fix |
| --- | --- |
| `duplicate exact route` / `DUPLICATE_ADAPTER` / `already registered` at startup | the old plugin is still enabled — see §2 |
| no Antigravity models in the model menu | the `agy` binary is not on PATH, or login/`permissionMode` is not ready — check `/agy status` |
| the Worker answers in prose and the Host reports `WORKER_TOOLS_UNREACHABLE` | check `mcpBridge`, `permissionMode: skip`, and that the allowlist admits `fusion_submit_result` |
| the account list is empty although the old plugin had accounts | you set `DSH_STATE_DIR`; copy once, as in §4 |
