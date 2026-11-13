# DSH Agent Studio With Fusion

[English](README.en.md) · [安装](INSTALL.zh.md) · [更新日志](CHANGELOG.md) · [文档索引](#文档索引)

<img src="assets/icon.svg" width="72" alt="">

**贵的模型只动脑，便宜的模型动手 —— 一个插件，把这件事做成 DSH 里的普通模型。**

装好之后，左侧边栏多一个 **Fusion** 入口，页面里三块：**Fusion 组合**、**Antigravity**（`agy` CLI）、**ACP 线路**。
不再需要 `dsh-agy-worker`、`dsh-tauri-acp` 或任何配套包。

| | |
|---|---|
| 包名 | `@sqdr2/dsh-agent-studio-fusion` |
| 插件 id | `dsh-agent-studio-fusion`（配置行、状态目录、日志标记都用它） |
| 模型菜单里的线路 | `dsh-fusion`，显示为 **Fusion · 组合名称** |
| 运行要求 | DSH `>=0.2.1-rc.5 <0.2.2-0 || >=0.2.2-rc.2 <0.3.0-0`，Node 24+ |

## 它解决什么

每个 **Fusion 组合**背后是你自己选的两个模型：

- **Lead**：一个强的前沿模型。读需求、看代码、写任务说明、验收结果、打回重做。它**不写代码**——没有写文件的工具，shell 命令跑在 DSH 的只读沙盒里，由程序保证，不靠提示词约束。
- **Sidekick**：一个便宜得多的模型。改文件、跑命令、跑测试，然后把结果交回来。
- **目标只有一个**：前沿模型的效果，打折的价钱。省钱靠价差——Sidekick 要比 Lead 便宜得多（最好 5 倍以上），两者价格越接近越省不了。

思路受 Cognition 在 Devin 里做的 Fusion 启发；这里是独立实现，与 Cognition 无关。

## 实测

9 道真实开源项目的题（SWE-rebench，Python），每题跑 2 次，隐藏测试判对错。Lead 为 GPT-6 Astra（high），Sidekick 为 GLM-5.3-Flash（high）：

| | 做对 | 总花费（按 API 公开价估算） |
|---|---|---|
| GPT-6 Astra 单独 | 9/18 | $39.17 |
| **Fusion：Astra + GLM-5.3-Flash** | **11/18** | **$18.07（省 54%）** |
| Fusion：Astra + Grok 4.6 | 13/18 | $41.27（不省钱） |

对照 Devin 自己的 Fusion——同一对模型（Lead GPT-6 Astra，Sidekick SWE-2）、同题、同工作区、同隐藏测试。排除被污染的尝试后，四组都干净的题剩 4 道：本插件 **4/4、$2.73**；Devin Fusion 3/4、$4.81；Devin 单独 Astra 3/4、$8.13。本插件耗时约为 Devin 的 3.4 倍。

样本小（4 道题 1 次；另一组 9 题 2 次）、只测了 Python、公开题目可能出现在训练数据里，所以这**不是**排名，也不是与 Devin 同等水平的声明。方法、原始数据、每轮结论和被排除的尝试：**[docs/EVIDENCE.md](docs/EVIDENCE.md)**。

## 上手

```sh
dsh plugin --profile web add @sqdr2/dsh-agent-studio-fusion
```

也可以直接从 GitHub 装（仓库自带构建好的 `lib/`）：`dsh plugin --profile web add github:SQDR2/dsh-agent-studio-fusion`。桌面版安装、本地目录安装、卸载、从旧包迁移见 **[INSTALL.zh.md](INSTALL.zh.md)**。

1. 打开左侧边栏的 **Fusion**（默认在记忆系统下方）。
2. 在 **Fusion 组合** 里起个名字，选 Lead 和 Sidekick。DSH 里任何已登录的模型都能选，包括已配好的 Antigravity 与 ACP 线路。
3. 在模型菜单里选 **Fusion · 组合名称**，像平时一样对话。
4. 输入框附近的 Fusion 标签随时显示当前谁在干活：`Lead · 仅可查看` / `Sidekick · 完全权限`。

**最多 6 个组合**，可以同时存在——「快」用便宜组合、「稳」用强组合，各是模型菜单里的一项。同时开多个会话时每个会话可以选不同组合；选定后该会话冻结这个组合，之后改设置或换别的会话都不影响它。旧版只有一个组合的配置会自动迁成名为「自动」的组合（模型 id 仍是 `auto`），已有会话照常继续。

输入框的「权限」控件在下发任务后会显示 `Custom`：Lead 的会话被固定在只读，而「只读 + 你的确认策略」通常匹配不上任何已配置预设。那个控件仍然决定 **Sidekick** 的权限——在那里换一项，Sidekick 下一轮就用那一项，Lead 始终只读。想让它显示名字而不是 `Custom`，在你 profile 的 `presets` 里加一条 `sandbox: read-only` + `approval: never` 的预设即可（纯配置，本插件不依赖它）。

## 一次任务怎么跑

1. Lead 判断要改代码，把活交给 Sidekick。任务说明里带用户需求的原话和验收命令。
2. Sidekick 改完交回，DSH 在真实工作区跑验收命令。
3. Lead 逐条审用户的硬性要求，每条都要给结论和证据，缺一条不能过；Sidekick 改写过的原有测试会单独标出来，必须 Lead 确认。
4. 不过就把具体问题打回同一个 Sidekick 继续改。发现可改文件范围不够（例如另一个测试文件还写着旧行为），Lead 只能在返工时往里**加**、不能减，每次加都留记录。
5. 原本就失败的测试（如缺可选依赖）可以标成「只要求不新增失败」。
6. **唯一例外**：程序判定 Sidekick 确实做不完（返工 2 轮仍失败、步数耗尽、反复卡住）才解锁 Lead 接手——只能改任务允许的文件，必须过同一套验收，结束后恢复只读。
7. 额度用完或出错按角色分别处理：换模型继续、定时继续，进度都保留。

## 三条线路

### Fusion 组合

上面那套 Lead/Sidekick。Lead 和 Sidekick 都可以是 DSH 自带线路、订阅登录线路、Antigravity 或 ACP 线路。

### Antigravity（`agy` CLI，已内建）

1.0.0 起整块内建，移植自 [`dsh-agy-worker`](https://github.com/SQDR2/dsh-agy-worker) 0.6.3（MIT，见 [docs/ATTRIBUTION-AGY.md](docs/ATTRIBUTION-AGY.md)）：`antigravity` 线路、`/agy` 命令族、`agy_ask` / `agy_tool`、`/plugins/agy-worker/*` 路由、带额度跟踪的账号池。管理控制台在页面的 **Antigravity** 区域；`/agy status | pool | models | doctor` 在输入框里回答同一批问题。

当 Sidekick 用这条路时，**三个条件必须同时成立**，缺一条都会静默失败：

| 条件 | 作用 | 缺了会怎样 |
|---|---|---|
| `mcpBridge: true` | agy 要能真的**执行** DSH 工具 | 工具看得见，但调不动 |
| `permissionMode: 'skip'` | headless 下 MCP 调用要被自动允许 | agy 直接拒绝：`a tool required the "mcp" permission that headless mode cannot prompt for` |
| 白名单里有 `fusion_*` | Sidekick 要能**交回结果** | 只能诊断，永远交不回 |

回传通道 `agy_tool` 不用你手写：检测到 `antigravity` 线路已注册时，本插件会把它自动并进 Lead 和 Sidekick 的工具面（`src/host/route-transport.ts`）。

```yaml
- id: dsh-agent-studio-fusion
  config:
    agy:
      mcpBridge: true
      permissionMode: skip
      mcpConfigScope: global
      mcpToolAllowlist: "fusion_submit_result,fusion_read_state,fusion_read_evidence,bash,read,write,edit,glob,grep,job_output,job_kill"
```

旧 `dsh-agy-worker` 的键（`enabled`、`agyBin`、`workspaceRoot`、`defaultModel`、`hiddenModels`、`quotaPollIntervalMs`、`autoWarmup`……）原样写在 `agy` 块里，`DSH_AGY_*` 环境变量仍然优先。`enabled: false` 是**安装期**开关：去掉 `antigravity` 线路与全部后台能力（额度轮询、预热、MCP 反桥、媒体清扫），但 `/agy` 与管理路由仍挂着供你查看状态；改配置后重启 DSH，它不是运行期开关。

> Windows 把 `bash` 换成 `pwsh`，改过 `workerTools` 就跟着改。启用前**先**停用或移除 `dsh-agy-worker`：同一套路由前缀、同一个 `antigravity` provider、同一个 `/agy`、同一组工具卡键，同时启用会在加载时失败（`duplicate exact route`、`DUPLICATE_ADAPTER`、`already registered`）。步骤、配置搬家与唯一需要手动复制的账号池见 [docs/MIGRATION-AGY.md](docs/MIGRATION-AGY.md)。

### ACP 线路（内建 `deepseek-harness-acp`）

Host 实现以 MIT 许可并入（[docs/ATTRIBUTION-ACP.md](docs/ATTRIBUTION-ACP.md)），**不必再单独安装 `dsh-tauri-acp`**。页面 **ACP 线路** 区域有最小示例、重启要求与迁移步骤；键就是模型选择器里的 provider 路由名：

```yaml
- id: dsh-agent-studio-fusion
  config:
    acp:
      agents:
        codex:
          displayName: Codex (ACP)
          command: /absolute/path/to/codex-acp   # 必填；绝对路径更稳，PATH 上的命令也可用
          args: []
          models:                                 # 可整段省略：省略时按 discoverModels 询问
            - id: default
          permission: ask
```

配置在 Host 启动时读取一次，改完需要重启。以前装着独立 `dsh-tauri-acp` 的，**先手动停用它**再把同名 provider 搬到这里，否则重复注册直接加载失败（[docs/MIGRATION-ACP.md](docs/MIGRATION-ACP.md)）。

ACP 线路当 Sidekick 时，本插件只在那一个会话的 ACP `session/new` 里挂 MCP 工具桥：本机 Web 服务自己的公开 origin 加固定路径 `/api/fusion/acp-mcp`，32 字节随机令牌**只放在 `Authorization: Bearer` 头里、不进 URL**，请求按这个 origin 校验 `Host` / `Origin` / 对端必须在本机、跨站一律拒绝，不看任何转发头。令牌绑定「这条任务的 Worker 会话 + 当前工作单及 revision + brief revision + implement/explore 模式 + 该线路的 provider 与 model + `workerTools`」，每次调用重核；任务暂停/重跑/恢复/完成、待审批、额度阻断、交报告、运行时关闭、改配置、换会话、超时或中断时立即撤销并中断在途调用。只放行 `workerTools` ∩ 该 Agent 可见工具（explore 单再与只读工具取交集，只收窄不放大），全部走 DSH 的 `tools.guard`、审批与 Fusion 的路径/租约检查。Lead 的 ACP 会话、普通线路调用、模型发现与压缩请求、text 单、别的 Fusion 任务都拿不到它（`mcpServers` 为空）。

### 其它 agent 线路

上面那套 `mcpBridge` / `permissionMode` / `agy_tool` 是 **agy 专属**的，因为那条线路由本插件的桥接层接管。别的适配器（不是本插件内置 ACP 线路的那些）可能在自己的会话里根本不带 MCP servers，**本插件没有任何设置能替它补上这座桥**。这种线路做纯文本问答时，Fusion 接受一份严格限定的文本报告（`fusionTextReport` 块，绑定当前 `workOrderId` + `revision`，字段与 `fusion_submit_result` 同构；散文、旧单、错 revision、多余字段一律拒绝，仍由 Lead 审查）；要读写文件、跑命令的活仍然需要真实工具调用。细节见 [docs/WORKER-TOOLS-UNREACHABLE.md](docs/WORKER-TOOLS-UNREACHABLE.md)。

## 缓存保活

Lead 等 Sidekick 干活时可能要等好几分钟，模型的输入缓存一过期，下一次请求就得按全价重读整段对话。保活的做法是：等待期间定时把 Lead 上一次的请求原样再发一遍，末尾只加一句 `Reply OK`。前缀完全相同，厂商就从缓存读，缓存的寿命顺势续上；模型只回 5 个 token，回复直接丢弃，不进对话，也不执行工具调用。

- **默认值**取自各家官方文档，覆盖 Artificial Analysis 前 20 的厂商，按模型名匹配（`gpt-*`、`claude-*`、`gemini-*`、`glm-*`、`grok-*`、`kimi-*`、`deepseek-*`……）。按请求次数计费的订阅套餐（[dsh-oauth-login](https://github.com/aa2246740/dsh-oauth-login) 的线路）默认关闭，因为每次保活都算一次请求。
- **自动开启**：模型真的返回过缓存命中之后才开始，不支持缓存的模型不会白花钱。
- 每个模型都能在 Fusion 面板里调：开关、续命间隔、恢复默认。面板同时显示实际效果——等待后缓存还在不在、发了几次、读了多少 token、避免了多少 token 按全价重发。
- **实测**（ChatGPT 订阅线路、gpt-6-astra、约 2 万 token 上下文）：缓存空闲 10 分钟仍在、15 分钟后过期，每次保活重新计时，所以这条线路默认 8 分钟一次。
- **自动调整**：当前间隔下最近 5 次保活有 3 次没命中才会缩短间隔（偶发随机淘汰不算）；只缩短，不自动拉长，想放宽时给建议、由你决定。

## 支持范围

| | |
|---|---|
| DSH | `>=0.2.1-rc.5 <0.2.2-0 || >=0.2.2-rc.2 <0.3.0-0`，桌面版与 Web 版都支持；0.2.0 系列不再支持 |
| Node | 24 或更新（`engines.node` 为 `>=24.0.0`） |
| 模型 | DSH 自带线路、[dsh-oauth-login](https://github.com/aa2246740/dsh-oauth-login) 与 dsh-antigravity-oauth 的订阅线路、内建 Antigravity 线路；其它第三方模型插件未测试 |
| macOS | 已验证（Seatbelt 沙盒） |
| Windows | `v0.2.1` 起支持原生 `pwsh`，在 Windows Server 2022 / PowerShell 7.6.6 上通过；Windows 10/11 未验证。ACL 隔离是部分的：能限制普通路径写入，读取与网络不在该限制内 |
| Linux | 未验证 |

<details>
<summary>Linux 自检步骤</summary>

1. 在一个测试目录里选 Fusion，对它说：「这是一次只读沙盒测试，被拒绝是预期结果。请你自己直接调用 bash 工具执行 `echo test > fusion-probe.txt`（不要委派、不要换别的写法），把工具返回的原文贴给我。」
2. 正确结果：工具返回的原文写着被沙盒拒绝（如 `Operation not permitted` / `read-only`），目录里没有生成 `fusion-probe.txt`。Lead 只口头拒绝、没真调工具的，这次不算，再说一遍「请实际调用工具」。
3. 文件真被创建出来，说明你这个系统上 Lead 的只读限制没生效，别用，并反馈给我们。

DSH 在你系统上没有沙盒时，Lead 的 shell 命令会被全部拒绝（安全地失败），它仍然能用读文件和搜索工具看代码。

</details>

## 数据在哪

- **Fusion 自己的记录**：任务说明、检查结果、用量、缓存统计和设置都在 `$DSH_HOME/plugins/dsh-agent-studio-fusion/state.sqlite`（`DSH_HOME` 默认是 `~/.dsh`）。
- **从旧名字升级**：`dsh-fusion`、`dsh-model-fusion`、`dsh-agent-studio` 的数据目录会在首次启动时整体迁到新名字，已有的任务、用量和设置都还在。跨文件系统时退化成复制数据库和它的 `-wal`/`-shm`/`-journal`，只删除自己复制过的文件。
- **内建 Antigravity**：工作状态沿用独立插件原来的位置——覆盖项、会话绑定、媒体缓存与预热历史在 `$DSH_HOME/agy-worker/`。账号池是本插件的 `$DSH_HOME/agy-accounts/pool.json`，每个账号独立的 HOME 在 `$DSH_HOME/agy-accounts/<id>/`；上游从 `DSH_STATE_DIR` 取账号池，所以只有设置过它的安装才需要 [docs/MIGRATION-AGY.md](docs/MIGRATION-AGY.md) 里的一次性复制。**不会**自动搬迁，卸载本包也不删这两个目录。
- **会话本身**由 DSH 保存，Fusion 不另外上传任何数据。想清空记录：退出 DSH 后删掉那个 sqlite 文件（设置会一起清掉）。

## 已知限制

- **比单独用前沿模型慢**：GPT-6 + Flash 的总耗时约为 GPT-6 单独的 5 倍，主要花在 Sidekick 身上。换更快的 Sidekick 会好很多。
- **Lead 接手**：72 次实测里一次都没触发，目前只有自动化测试覆盖。
- **macOS 桌面版的 PATH**：从程序坞打开的 DSH Studio 只有系统默认 PATH，Homebrew（`/opt/homebrew/bin`）、nvm 等装的 `node`、`npm`、`cargo` 在 shell 里找不到。这是 DSH 的运行环境，所有模型一样。Fusion 在派活前会检查验收命令用到的程序，找不到时告诉 Lead 它实际装在哪（例如 `/opt/homebrew/bin/node`），Lead 改用完整路径。
- **Windows 10/11 与 Linux 未验证**：见上表。

## 开发

```sh
corepack pnpm@9.15.9 install --frozen-lockfile
node scripts/link-host.mjs /path/to/deepseek-harness-0.2.1-rc.5   # 支持的基线；开发时链接 DSH 源码
DSHX_HARNESS=/path/to/deepseek-harness-0.2.1-rc.5 pnpm build
pnpm test && DSHX_HARNESS=/path/to/deepseek-harness-0.2.1-rc.5 pnpm test:host
```

Windows 开发环境需把 PowerShell 7（`pwsh`）、Node 和 Python 加进跑测试的进程 PATH。原生测试通过 `DSHX_HARNESS` 读取已构建的指定 Host，不需要改 Host 源码。

`lib/` 是随源码一起提交的构建产物（`lib/dsh-agent-studio-fusion.js`、`lib/client.js`、`lib/bridge.mjs`、`lib/assets/mermaid.min.js`、`lib/types/**`），改 `src/` 后要 `pnpm build` 并一起提交。插件只用 DSH 公开的插件接口，不改 DSH 源码；适配新版本见 [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md)。发版（改版本号、重建 `lib/`、打 tag、CI 经 OIDC 发 npm）见 [RELEASING.zh.md](RELEASING.zh.md)。

## 文档索引

| 文档 | 内容 |
|---|---|
| [INSTALL.zh.md](INSTALL.zh.md) | 安装、卸载、从旧包迁移 |
| [CHANGELOG.md](CHANGELOG.md) | 每个版本改了什么、验证了什么、**没有**验证什么 |
| [docs/EVIDENCE.md](docs/EVIDENCE.md) | 实测方法、原始数据、被排除的尝试 |
| [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) | 依赖的 DSH 接口、升级适配流程 |
| [docs/WORKER-TOOLS-UNREACHABLE.md](docs/WORKER-TOOLS-UNREACHABLE.md) | Sidekick 够不到工具时的诊断与文本报告兜底 |
| [docs/MIGRATION-AGY.md](docs/MIGRATION-AGY.md) | 从 `dsh-agy-worker` 迁到内建 Antigravity |
| [docs/MIGRATION-ACP.md](docs/MIGRATION-ACP.md) | 从 `dsh-tauri-acp` 迁到内建 ACP 线路 |
| [docs/ATTRIBUTION-AGY.md](docs/ATTRIBUTION-AGY.md) · [docs/ATTRIBUTION-ACP.md](docs/ATTRIBUTION-ACP.md) | 并入代码的来源、改动与许可 |
| [docs/DEVIN-LOCAL-FUSION.md](docs/DEVIN-LOCAL-FUSION.md) | Devin CLI 的 Fusion 二进制取证与本项目逐项对比 |
| [RELEASING.zh.md](RELEASING.zh.md) | 发版流程 |

## 许可

Apache-2.0。fork 自 [`aa2246740/dsh-model-fusion`](https://github.com/aa2246740/dsh-model-fusion)，同样以 Apache-2.0 发布。

并入的第三方成果保留各自许可：ACP provider 移植为 MIT（[docs/ATTRIBUTION-ACP.md](docs/ATTRIBUTION-ACP.md)）；内建 Antigravity（agy）能力为 MIT，移植自 [`SQDR2/dsh-agy-worker`](https://github.com/SQDR2/dsh-agy-worker)（其上游为 [`amlyczz/dsh-agy-link`](https://github.com/amlyczz/dsh-agy-link)），见 [docs/ATTRIBUTION-AGY.md](docs/ATTRIBUTION-AGY.md)——那份文档同时列出随包的 `mermaid.min.js` 里各库的许可。
