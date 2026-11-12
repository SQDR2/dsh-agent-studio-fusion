# DSH Agent Studio With Fusion

[English](README.en.md) · [安装](INSTALL.zh.md) · [Install (English)](INSTALL.md) · [更新日志](CHANGELOG.md)

> **本项目为独立开源插件项目，包名 `@sqdr2/dsh-agent-studio-fusion`。**
> 核心融合了三项能力于 **一个插件**：Fusion 的 Lead/Sidekick
> 组合（起源自 `aa2246740/dsh-model-fusion`，保留完整算法与数据）、Antigravity（`agy` CLI，从 [`dsh-agy-worker`](https://github.com/SQDR2/dsh-agy-worker) 以 MIT 许可并入）
> 与 ACP 代理线路（从 [`deepseek-harness-acp`](https://github.com/Fleey/deepseek-harness-acp) 以 MIT 许可并入）。
> 左侧边栏统一为一个入口，三个区域在同一个页面里切换；不再需要另装多个插件。详细说明见 [相关文档与合规说明](docs/ATTRIBUTION-AGY.md)。

Fusion 在 DeepSeek Harness（DSH）的模型菜单里就是一个普通模型：**你保存几个组合，菜单里就有几项**（**Fusion · 组合名称**）。每个组合背后是两个你自己选的模型：

- **Lead**：一个强的前沿模型。负责理解需求、看代码、写任务说明、审查结果。
- **Sidekick**：一个便宜得多的模型。负责实际改代码、跑命令、跑测试。

目标只有一个：**用前沿模型的效果，付打折的价钱。**

思路受 Cognition 在 Devin 里推出的 Fusion 启发，这是一个独立实现，与 Cognition 无关。

## 实测效果

9 道真实开源项目的题（SWE-rebench，Python），每题跑 2 次，用隐藏测试判定对错。Lead 为 GPT-6 Astra（high），Sidekick 为 GLM-5.3-Flash（high）：

| | 做对 | 总花费（按 API 价格估算） |
|---|---|---|
| GPT-6 Astra 单独 | 9/18 | $39.17 |
| **Fusion：GPT-6 Astra + GLM-5.3-Flash** | **11/18** | **$18.07（便宜 54%）** |
| Fusion：GPT-6 Astra + Grok 4.6 | 13/18 | $41.27（不省钱） |

- 花费是按各家 API 公开价格换算的估算，不是账单。
- 局限：样本小（9 题 × 2 次）、只测了 Python、公开题目可能出现在模型训练数据里。
- 详细方法、原始数据和每一轮的结论见 [docs/EVIDENCE.md](docs/EVIDENCE.md)。

**对照 Devin 自己的 Fusion：** 两边用同一对模型，Lead 是 GPT-6 Astra（high），Sidekick 是 SWE-2。题目、工作区和隐藏测试完全相同。

排除被污染的尝试后，四个组别都干净的题剩 4 道，结果如下：

| | 做对 | 花费 |
|---|---|---|
| **本插件：Astra + SWE-2** | **4/4** | **$2.73** |
| Devin Fusion：Astra + SWE-2 | 3/4 | $4.81 |
| Devin，Astra 单独 | 3/4 | $8.13 |

- 样本只有 4 道题、每题 1 次，不能据此说谁更强，也不代表与 Devin 同等水平。
- SWE-2 两边都按 $0 计价，所以花费都是 Lead 的。
- 本插件的耗时约为 Devin 的 3.4 倍。
- 排除了哪些尝试、为什么排除，以及方法和原始数据，见 [docs/EVIDENCE.md](docs/EVIDENCE.md#against-devins-own-fusion-round-devin-r1-2026-09-29)。

## 怎么用

1. 按 [安装说明](INSTALL.zh.md) 装好插件。
2. 打开左侧边栏的 **Fusion** 入口（默认位于记忆系统下方）。页面标题是 **DSH Agent Studio With Fusion**，
   顶部有三个区域按钮：**Fusion 组合**（默认）、**Antigravity**、**ACP 线路**。在「Fusion 组合」里给组合起个名字，
   选择 Lead 和 Sidekick。可以选 DSH 里任何已登录的模型，包括已配置的 Antigravity 与 ACP 线路。
3. 在模型菜单里选择这个组合（显示为 **Fusion · 组合名称**），像平时一样对话。

**多个组合可以同时存在**（最多 6 个）：例如「快」用便宜模型、「稳」用强模型，分别作为模型菜单里的两项。同时开多个会话时，每个会话可以选不同的组合——选中的会话会冻结当时的组合，之后改设置或换别的会话都不影响它。旧版只有一个组合时保存的配置会自动迁移成名为「自动」的组合，模型 ID 仍是 `auto`，已有会话照常继续。

**搭配建议：** 省钱靠的是 Sidekick 比 Lead 便宜得多。选一个强的前沿模型当 Lead，再选一个价格低很多（最好 5 倍以上）的模型当 Sidekick。两者价格越接近，越省不了钱。

## 工作方式

- **普通对话**：Lead 直接回答，和用普通模型一样。
- **需要改代码时**：Lead 把任务交给 Sidekick。任务说明里带着用户需求的原话，以及验收命令。
- **验收**：
  - Sidekick 交回结果后，DSH 在真实环境里运行验收命令。
  - Lead 审查改动，并且必须对用户的每一条硬性要求给出结论和证据，缺一条都不能通过。
  - 原本就失败的测试（例如缺少可选依赖），可以标成"只要求不新增失败"。
  - Sidekick 改写了原有测试时，会被单独标出来，Lead 必须确认过才能通过。
- **返工**：不通过就把具体问题打回给同一个 Sidekick 继续改。
  - 如果发现任务说明里允许改的文件不够（例如另一个测试文件还写着旧行为），Lead 可以在返工时把它加进可改范围。只能加、不能减，每次都会留下记录。
- **Lead 不写代码**：这不是靠提示词约束，而是由程序保证的：
  - Lead 没有写文件的工具；
  - 它执行的 shell 命令跑在 DSH 的只读沙盒里。
- **输入框里的权限**：Fusion 按角色分离权限，Lead 的会话被固定在只读，而"只读 + 你的确认策略"这个组合通常匹配不上任何已配置预设，所以下发任务后「权限」控件会显示 `Custom`。工具行里 Fusion 自己的标签随时显示**当前在干活的角色**及其权限：`Lead · 仅可查看` / `Sidekick · 完全权限`。那个控件本身仍然决定 Sidekick 的权限：在那里换一项，Sidekick 下一轮就用那一项，Lead 仍然只读。如果你更希望原生控件也不显示 `Custom`，在你 profile 的 `presets` 里加一条 `sandbox: read-only` + `approval: never` 的预设即可（纯配置，本插件不依赖它）。
- **唯一的例外：程序判定 Sidekick 确实做不完时，才解锁 Lead 接手。** 例如 2 轮返工后检查仍然失败，或者 Sidekick 用完了步数、反复卡住。接手时：
  - Lead 只能改任务允许的文件；
  - 必须通过同样的验收；
  - 任务结束后恢复只读。
- **额度用完或出错**：Lead、Sidekick 各自处理。可以换模型继续，也可以定时继续；进度保留。

## 用 agy 当 Sidekick（已内建）

Google Antigravity（`agy` CLI）自 0.4.0 起 **内建在本插件里**：从
[`dsh-agy-worker`](https://github.com/SQDR2/dsh-agy-worker)（`dsh-agy-link` 的 fork）以 MIT 许可移植，见
[`docs/ATTRIBUTION-AGY.md`](docs/ATTRIBUTION-AGY.md)。它带来 `antigravity` 模型线路、`/agy` 命令、`agy_ask` /
`agy_tool`、`/plugins/agy-worker/*` 路由、带额度跟踪的账号池，以及 Fusion 页面的 **Antigravity** 区域里的管理控制台。
不需要再装第二个包，左侧边栏仍然只有 Fusion 一个入口。

> **从 `dsh-agy-worker` 迁移：** 启用本插件前 **先** 停用或移除旧包。两者用同一套路由前缀、同一个
> `antigravity` provider、同一个 `/agy` 命令和同一组工具卡键，同时启用会在加载时失败
> （`duplicate exact route`、`DUPLICATE_ADAPTER`、`already registered`）。完整步骤、配置搬家与唯一需要手动复制
> 的账号池见 [`docs/MIGRATION-AGY.md`](docs/MIGRATION-AGY.md)。

这条路和普通模型线路不一样，**必须三个条件同时成立**，缺任何一条都会静默失败：

| 条件 | 为什么 | 缺了会怎样 |
|---|---|---|
| `mcpBridge: true` | agy 要能真的**执行** DSH 工具 | 工具看得见，但调不动 |
| `permissionMode: 'skip'` | headless 下 MCP 调用要被自动允许 | agy 直接拒绝：`a tool required the "mcp" permission that headless mode cannot prompt for` |
| 白名单里有 `fusion_*` | Sidekick 要能**交回结果** | 只能诊断，永远交不回 |

工具天花板里的回传通道 `agy_tool` **不需要你手写**：本插件在检测到 `antigravity` 线路已注册时，会自动把它并进 Lead 和 Sidekick 的工具面（`src/host/route-transport.ts`）。这是本 fork 修掉的问题之一——在此之前，agy 的适配器只能以 `agy_tool` 回传，而天花板里没有这个名字，整轮就退化成纯文本，宿主报 `WORKER_TOOLS_UNREACHABLE`。

推荐配置：

```yaml
- id: dsh-fusion
  config:
    agy:
      mcpBridge: true
      permissionMode: skip
      mcpConfigScope: global
      mcpToolAllowlist: "fusion_submit_result,fusion_read_state,fusion_read_evidence,bash,read,write,edit,glob,grep,job_output,job_kill"
```

旧插件其余键（`enabled`、`agyBin`、`workspaceRoot`、`defaultModel`、`hiddenModels`、`quotaPollIntervalMs`、
`autoWarmup` ……）都能原样写在 `agy` 块里，且 `DSH_AGY_*` 环境变量仍然优先。`enabled: false` 是 **安装期** 的
关闭开关：它会去掉 `antigravity` provider 路线与全部后台能力（配额轮询、预热、MCP 反桥、媒体清扫），但
`/agy` 与管理路由仍会挂载，供你查看状态；要重新打开，改配置块后重启 DSH，它不是运行期开关。管理控制台
（账号、额度、模型可见性、权限模式、预热）位于左侧边栏 **Fusion** 面板底部；`/agy status | pool | models | doctor`
在输入框里回答同样的问题。

> Windows 把 `bash` 换成 `pwsh`；改过 `workerTools` 就跟着改。工作状态仍在独立插件原来的位置
> （`$DSH_HOME/agy-worker/`）；账号池用本插件的 `$DSH_HOME/agy-accounts/pool.json`，只有当 `DSH_STATE_DIR`
> 被设置时才与上游不同 —— 一次性复制步骤见 [`docs/MIGRATION-AGY.md`](docs/MIGRATION-AGY.md)。桥接本身完整配置面、验证步骤与排障对照见
> [dsh-agy-worker 的 MCP 桥接文档](https://github.com/SQDR2/dsh-agy-worker/blob/main/docs/MCP-BRIDGE-SETUP.md)。

### ACP 线路（内置 `deepseek-harness-acp`）

本插件自带 ACP 线路，**不必再单独安装 `dsh-tauri-acp`**（其 Host 实现以 MIT 许可并入，见
[`docs/ATTRIBUTION-ACP.md`](docs/ATTRIBUTION-ACP.md)）。左侧边栏 **Fusion** → **ACP 线路** 里有完整说明
（最小示例、重启要求、迁移步骤）。在 `cordis.patch.yml` 里给本插件加一段 `acp.agents` 即可，
键是模型选择器里的 provider 路由名：

```yaml
- id: dsh-fusion
  name: '@sqdr2/dsh-fusion'
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

配置在 Host 启动时读取一次，改完需要重启。如果你以前装着独立的 `dsh-tauri-acp`，**先手动停用它**再把同名 provider
搬到这里，否则会因重复注册而加载失败：步骤见 [`docs/MIGRATION-ACP.md`](docs/MIGRATION-ACP.md)。

ACP 线路作为 Sidekick 时，本插件会在该会话的 ACP `session/new` 里挂一个**只有 Sidekick 拿得到**的 MCP 工具桥：
地址是本机 Web 服务自己的公开 origin（`ctx.webServer.getOrigin()`）加固定路径 `/api/fusion/acp-mcp`，令牌是 32 字节
随机数、**只放在 `Authorization: Bearer` 头里，不写进 URL**（也不接受路径或查询串里的令牌，路径必须精确匹配）。
请求还会按这个 origin 校验：`Host` 必须与它一致、`Origin`（若有）必须等于它、跨站请求一律拒绝、对端必须是本机
（回环或 Host 实际绑定的那个地址）；不看任何转发头，所以绑定具体网卡时本机调用可用，远端与代理仍不可达。
令牌绑定「这张任务的 Worker 会话 + 当前工作单及 revision + brief revision + implement/explore 模式 + 这条 ACP 路由的
provider 与 model + 配置的 `workerTools`」，每次调用都会重新核对；任务暂停/重跑/恢复/完成、待审批、额度阻断、
Worker 已交报告、运行时关闭、路由配置改动、会话替换、超时或中断时都会立即撤销并中断在途调用。只放行
`workerTools` ∩ 该 Agent 自己可见的工具表（explore 单再与只读工具取交集，只收窄不放大），排除 Fusion 内部工具与
线路传输工具，并全部走 DSH 的 `tools.guard`、审批与 Fusion 的路径/租约检查。Lead 的 ACP 会话、普通 ACP 线路调用、
模型发现与压缩请求、text 单、以及别的 Fusion 任务都拿不到工具桥（`mcpServers` 为空）。
改动与限制记录在 [`docs/ATTRIBUTION-ACP.md`](docs/ATTRIBUTION-ACP.md)。

### 其它 agent 线路：这里没有工具桥

上面的 `mcpBridge` / `permissionMode` / `agy_tool` 三件套是 **agy 专属**的，因为那条线路由本插件的桥接层接管。别的
适配器（不是本插件内置 ACP 线路的那些）可能在自己的会话里根本不带 MCP servers，**本插件没有任何设置能替它补上这座桥**。
这种线路交给 Sidekick 做文本问答时，Fusion 允许它用一份严格限定的文本报告交回结果（`fusionTextReport` 块，绑定当前
`workOrderId` + `revision`，字段与 `fusion_submit_result` 同构；散文、旧单、错 revision、多余字段一律拒绝，报告仍由
Lead 审查）；而需要读写文件、跑命令的 workspace 任务仍然必须走真实工具。细节见
[`docs/WORKER-TOOLS-UNREACHABLE.md`](docs/WORKER-TOOLS-UNREACHABLE.md)。

## 本 fork 做了什么

相对上游 `dsh-model-fusion`，本 fork 的改动（按提交时间）：

| 内容 | 解决了什么 |
|---|---|
| **用户约束跨压缩保留** | 对话被自动压缩（rollover）后，用户原话里的硬性要求仍在任务范围内，不会因为一次压缩就丢掉验收依据 |
| **死路任务有出口** | 当 Sidekick 线路根本够不到工具时，判定会被记在运行记录上：`fusion_wait` 复述同一个原因，`fusion_delegate` 允许替换这条死单并复用常驻身份，不再把任务卡在 `WORKER_RUNNING` |
| **入口搬到左侧边栏** | Fusion 从「设置 → Fusion」变成左侧边栏的独立面板（默认落在记忆系统下方），主区域有真正的滚动面，不再是塞在设置页里的一段表单 |
| **agy 线路真的能当 Sidekick** | `agy_tool` 回传通道自动并进工具天花板（见上一节） |
| **桥接线路能交回结果** | agy 在自己的循环里执行调用，用的是 `agy-mcp-N` 这种桥内 id，本 Host 的 assistant 消息里没有它，于是所有非只读 Worker 工具都被判成「缺少完整的原生模型请求」——包括唯一要紧的 `fusion_submit_result`。现在桥接调用归属到发出回传通道的那条消息上，原生路径不变且优先 |
| **冻结范围不再死锁** | `allowedPaths: ['lib/types/**']` 这类 glob 之前一条都不匹配，导致「改动落在冻结范围外」和「加范围时文件已变更」互相锁死。现在 glob 正常匹配，加范围改为按提交基点比较，并且可以显式清空 |
| **任务记录可以删了** | 删除只看持久化状态：进程换过的任务永远 `running` 删不掉，而真在跑的 Agent 又可能被从底下抽走。现在删除先问协调者（`liveWork`），409 会说明是哪一个资源占着 |
| **面板折叠** | 用量统计、任务列表、缓存保活、历史各自成为独立的折叠区块，默认收起，模型组合不再被挤到屏幕外 |

## 缓存保活

Lead 等 Sidekick 干活时，可能要等好几分钟。模型的输入缓存过期后，下一次请求就要按全价重读整段对话。保活会在等待期间，定时把 Lead 上一次的请求原样再发一遍，末尾只加一句“Reply OK”。前缀和上次完全相同，厂商就从缓存读取，缓存的寿命也就续上了；模型只回一个 OK，回复直接丢弃，不进对话，也不会执行工具调用。

- **默认值：** 来自各家官方文档，覆盖 Artificial Analysis 排行榜前 20 的模型厂商。
  - 按模型名匹配，比如 gpt-*、claude-*、gemini-*、glm-*、grok-*、kimi-*、deepseek-*。
  - 附带 [dsh-oauth-login](https://github.com/aa2246740/dsh-oauth-login) 的线路计费方式：按请求次数计费的套餐默认关闭保活，因为每次保活都算一次请求。
- **自动：** 模型实际返回过缓存命中后才开启，不支持缓存的模型不会白花钱。
- **每个模型都可以在 Fusion 面板中调整：** 开关、续命间隔、恢复默认。面板还会显示每个模型的实际效果：
  - 等待后缓存还在不在；
  - 发了几次保活、读了多少 token；
  - 避免了多少 token 按全价重发。
- **实测（ChatGPT 订阅线路，gpt-6-astra，约 2 万 token 上下文）：** 每次保活模型只回 5 个 token，不思考、不调工具。缓存空闲 10 分钟仍在，15 分钟后过期，每次保活会重新计时，所以这条线路默认每 8 分钟保活一次。
- **自动调整：** 当前间隔下最近 5 次保活有 3 次没命中，程序才会自动缩短间隔（偶尔一次随机淘汰不算）；只会缩短，不会自动拉长。可以放宽时只给建议，由你决定。

## 支持范围

- **DSH 版本：** 支持 **0.2.1-rc.5 及之后的 0.2.1 版本**（`>=0.2.1-rc.5 <0.3.0-0`），桌面版和 Web 版都可以；0.2.0 系列已不再支持。其他版本不保证可用，新版本发布后会另行适配。
- **Node 版本：** 需要 **Node 24 或更新版本**（`engines.node` 为 `>=24.0.0`）。
- **模型：** DSH 官方自带的模型线路，以及 [dsh-oauth-login](https://github.com/aa2246740/dsh-oauth-login)、dsh-antigravity-oauth 提供的订阅登录线路，还有内建的 Antigravity 线路（移植自 [dsh-agy-worker](https://github.com/SQDR2/dsh-agy-worker)）。其他第三方模型插件未经测试。
- **系统：**
  - **macOS：** 已验证（Seatbelt 沙盒）。
  - **Windows：** `v0.2.1` 已适配原生 `pwsh`，在 Windows Server 2022、PowerShell 7.6.6 上通过验证。启动 DSH 的进程 PATH 中需要有 `pwsh`。Windows 10/11 尚未验证。Windows ACL 仅提供部分隔离，普通路径写入可受限制，读取和网络不在该限制内。
  - **Linux：** 未验证，使用前请先自行检查：
  1. 在一个测试目录里选 Fusion，对它说："这是一次只读沙盒测试，被拒绝是预期结果。请你自己直接调用 bash 工具执行 `echo test > fusion-probe.txt`（不要委派、不要换别的写法），把工具返回的原文贴给我。"
  2. 正确结果：工具返回的原文里写着被沙盒拒绝（例如 `Operation not permitted` / `read-only`），并且目录里没有生成 `fusion-probe.txt`。
     - 如果 Lead 只是口头拒绝、没有真的调用工具，这次检查不算数，请再说一遍"请实际调用工具"。
  3. 如果文件被创建出来，说明你的系统上 Lead 的只读限制没有生效，请不要使用，并反馈给我们。
  - 如果 DSH 在你的系统上没有沙盒，Lead 的 shell 命令会被全部拒绝（安全的失败方式），它仍然可以用读文件和搜索工具看代码。

### v0.2.1 的 Windows 验证（历史记录，早于当前 0.2.1-rc.5 / Node 24 基线）

在 Windows Server 2022、Node 22.23.3、PowerShell 7.6.6、DSH 0.1.7-rc.2 上，**253 项单元测试和 236 项 Host 测试全部通过**，类型检查通过。修复候选完成了插件安装、冷启动、Fusion 设置页及 settings/cache 两个 API 验证。v0.2.1 的服务端和客户端构建文件与该候选完全一致。之后的版本（v0.2.2 返工时扩大可改文件范围、v0.2.3–v0.2.5 适配 DSH 0.2.0-rc.2、v0.2.6 改进缓存保活）都与平台无关，在 macOS 上复测，未在 Windows 上重跑。

真实 PowerShell ACL 测试中，Lead 执行 `Set-Content probe.txt test` 被拒绝，文件未生成；Sidekick 在获准的工作区内执行同一命令可以写入。这是上面所述的部分 ACL 隔离。验证没有输入模型密钥或发起真实模型请求。macOS 回归通过 253 项单元测试和 235 项 Host 测试，按设计跳过 Windows 专用 ACL 测试。

## 数据存在哪里

- **Fusion 自己的记录：** 任务说明、检查结果、用量、缓存统计和设置，都存在 `$DSH_HOME/plugins/dsh-fusion/state.sqlite`。`DSH_HOME` 默认是 `~/.dsh`。
- **从旧名字升级：** 上一版叫 `dsh-model-fusion`，它的整个数据目录（`$DSH_HOME/plugins/dsh-model-fusion/`）会在首次启动时**整体迁移**到新名字，已有的任务、用量和设置都还在。跨文件系统时会退化成复制数据库和它的 `-wal`/`-shm`/`-journal`，只删除自己复制过的文件。
- **内建 Antigravity（agy）：** 工作状态沿用独立插件原来的位置 —— 覆盖项、会话绑定、媒体缓存与预热历史在 `$DSH_HOME/agy-worker/`。账号池是本插件的 `$DSH_HOME/agy-accounts/pool.json`，每个账号的独立 HOME 在 `$DSH_HOME/agy-accounts/<id>/`；上游从 `DSH_STATE_DIR` 取账号池，所以只有设置过它的安装才需要 [`docs/MIGRATION-AGY.md`](docs/MIGRATION-AGY.md) 里的一次性复制。**不会**自动搬迁，卸载本包也不会删除这两个目录。
- **会话本身：** 由 DSH 保存，Fusion 不另外上传任何数据。
- **想清空 Fusion 的记录：** 退出 DSH 后删除这个文件。设置也会一起清掉，下次打开时重新选组合即可。

## 已知限制

- **比单独用前沿模型慢：** 实测 GPT-6 + Flash 总耗时约为 GPT-6 单独的 5 倍，主要花在 Sidekick 身上。换更快的 Sidekick 会好很多。
- **Lead 接手：** 在 72 次实测里一次都没触发，目前只由自动化测试覆盖。
- **macOS 桌面版的 PATH：** 从程序坞打开的 DSH Studio 只有系统默认的 PATH，Homebrew（`/opt/homebrew/bin`）、nvm 等装的 `node`、`npm`、`cargo` 在 shell 里找不到。这是 DSH 的运行环境，所有模型都一样。Fusion 在派活前会检查验收命令用到的程序，找不到时会告诉 Lead 它实际装在哪里（例如 `/opt/homebrew/bin/node`），Lead 改用完整路径即可。
- **Windows 10/11 和 Linux 未验证：** 见上面的"系统"。

## 开发

```sh
corepack pnpm@9.15.9 install --frozen-lockfile
node scripts/link-host.mjs /path/to/deepseek-harness-0.2.1-rc.5   # 支持的基线；开发时链接 DSH 源码
DSHX_HARNESS=/path/to/deepseek-harness-0.2.1-rc.5 pnpm build
pnpm test && DSHX_HARNESS=/path/to/deepseek-harness-0.2.1-rc.5 pnpm test:host
```

Windows 开发环境需将 PowerShell 7（`pwsh`）、Node 和 Python 加入运行测试的进程 PATH。原生测试通过 `DSHX_HARNESS` 读取已构建的指定 Host；不需要修改 Host 源码。

插件只使用 DSH 公开的插件接口，不修改 DSH 源码。适配新版本 DSH 的做法见 [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md)。

发版流程（改版本号、重建 `lib/`、打 tag、CI 经 OIDC 发到 npm）见 [RELEASING.zh.md](RELEASING.zh.md)。

## 许可

Apache-2.0。上游 fork 自 [`aa2246740/dsh-model-fusion`](https://github.com/aa2246740/dsh-model-fusion)，同样以 Apache-2.0 发布。

并入的第三方成果保留各自许可：ACP provider 移植为 MIT（[`docs/ATTRIBUTION-ACP.md`](docs/ATTRIBUTION-ACP.md)）；内建的 Antigravity（agy）能力为 MIT，移植自 [`SQDR2/dsh-agy-worker`](https://github.com/SQDR2/dsh-agy-worker)（其上游为 [`amlyczz/dsh-agy-link`](https://github.com/amlyczz/dsh-agy-link)），见 [`docs/ATTRIBUTION-AGY.md`](docs/ATTRIBUTION-AGY.md)。该文档同时列出随包附带的 `mermaid.min.js` 里各库的许可。
