# DSH Agent Studio

一个 DeepSeekRuntime 插件，把三个东西放进同一个侧边栏条目：**Fusion 组合**（贵模型判断、便宜模型干活）、**Antigravity**（agy CLI 的模型线路）和 **ACP 代理线路**。

> 包名 `@sqdr2/dsh-agent-studio-fusion`，插件 id `dsh-agent-studio-fusion`。
> 需要 **Node 24 或更新版本** 与 **DeepSeekRuntime `>=0.2.1-rc.5 <0.2.2-0 || >=0.2.2-rc.2 <0.3.0-0`**。
> 安装步骤见 [INSTALL.zh.md](INSTALL.zh.md)，改动记录见 [CHANGELOG.md](CHANGELOG.md)。

## 一句话说清 Fusion

一个 **Fusion 组合** = 你自己挑的两个模型：

- **Lead**：前沿模型。定方案、写任务说明、验收结果、和用户对话、做提交推送这类权威动作。
- **Sidekick**：便宜得多的模型。改文件、跑命令、跑测试，把报告交回来。

省下的钱来自两者价差，所以 Sidekick 要比 Lead 便宜得多；价差越小，省得越少。组合最多 **6 个**，每个在模型菜单里各占一项，同时开多个会话时可以各选各的。

**两个角色用同一套用户权限。** 插件不再把 Lead 钉成只读——它和普通会话一样能读、能搜、能跑命令、也能改文件。分工靠提示词约束：实现和验证默认交给 Sidekick，一两轮就能做完或者正确性上不能转手时才自己做，但不许留下改了一半的工作区。宿主只保证一件程序层面的事：**同一个工作区同时只有一个写者**。

## 装

```sh
dsh plugin --profile web add @sqdr2/dsh-agent-studio-fusion
```

装完重新打开一次 Web 服务（或 DSH Studio），刷新页面。模型菜单里就会出现你保存过的组合。完整的 npm / GitHub / 本地目录 / 桌面版几种安装方式、以及从 `dsh-fusion` 旧包迁移的步骤，都在 [INSTALL.zh.md](INSTALL.zh.md)。

## 配

侧边栏 **Fusion** → **Fusion 组合**：点「新增」，选 Lead、选 Sidekick、保存。可选地给这个组合配一个工长（见下一节）。

- **模型来源**：Lead 和 Sidekick 都可以选普通 provider 模型，也可以选 Antigravity / ACP 线路。
- **上下文与压缩**：每个角色有独立的上下文预算和压缩模型，可以在组合里调；不调就用默认。
- **价格**：面板会按记录的用量折算成钱。价格没配的模型按「未知」计，不会假装便宜。

## 一次任务怎么跑

```
用户请求
  │
  ├─ 需要先讨论的 skill（如 /grill-me）→ Lead 先和你讨论，讨论没完成不许定稿
  │
Lead 亲自读代码 / 跑命令形成判断 → 定稿计划
  │
  ├─► 工长审查（可选，独立上下文，读真实代码）
  │      ├─ 有意见 → Lead 改 → 再送审（最多 3 轮）
  │      └─ 无意见（且引用能对上真实文件）→ 放行
  │
  └─► 派给 Sidekick 执行 → 宿主在真实工作区跑验收 → Lead 验收
```

**宿主跑验收，不是 Sidekick 自己报。** 定稿时你写下 agent 要满足的要求原话和验收命令，Sidekick 交回后由 DSH 在真实工作区执行这些命令；报告和检查结果物理分离，「测试全绿」和「真的对」不是同一句话。Sidekick 改写了原有测试会被单独标出来，需要 Lead 确认。

**验收命令怎么写.** 测试用 `test` + 对应计数解析器（unittest、pytest、vitest、jest、mocha、tap、go 需 `go test -v`、cargo）；没有解析器的检查用 `static-check` + `exit-code`。几条互不共享状态的检查可以标 `independent` 并发跑；同一个测试框架的两条命令通常不独立（共享缓存目录）。对「本来就可能失败」的大回归套件用 `baseline: no-new-failures`。

**权限：Lead 也会写，但同时只有一个写者。** 谁持有写租约谁写；Worker 持有租约期间 Lead 的写入会被拒绝（`FUSION_LEAD_WRITE_CONFLICT`），读和搜索照常。程序判定 Sidekick 确实做不完（返工 2 轮仍失败、步数耗尽、反复卡住）时解锁 Lead 接管：只能改任务允许的文件，必须过同一套验收。

**权威动作不归写租约管.** 提交、推送、打 tag、发版、开或更新 PR、触发 CI 都要在派活时用 `authority` 明确授权那一个动作，否则 Sidekick 执行会被拒绝（`FUSION_WORKER_AUTHORITY_DENIED`）。改动验收之后你才说「提交推送」也可以：Lead 不自己跑 git（Worker 还占着写租约），而是把那个动作补授给同一张工作单（只增不减，记为修订），再让同一个执行者去跑。

**取整取证默认由 Lead 亲自做。** 只有你执行 `/fusion allow-explore <范围>` 明确授权后，才允许一次限定范围的 Sidekick 只读调查；这种调查不送工长、不派工，关键证据仍由 Lead 核验。

## 工长审查（可选）

组合可以额外配第三个模型：**工长**（Foreman）。它不干活，只在 Lead 定稿之后、Sidekick 开始之前，用**独立上下文**对着**真实工作区**审这份计划。

**它读代码，不是读描述。** 工长可以用 `read` / `grep` / `glob` 打开文件，也可以用宿主的 shell 跑验收里写明的命令（测试、lint、构建），从而自己确认「这条要求真被覆盖了」「这个检查真会失败」。它拿到的权限就是你选的模式；「只审不改」是提示词条款：不改方案、不修代码、不跑会改工作区的命令，坏了就报告而不是顺手修。

**每条结论都挂在代码上。** `blocking-concern` 必须带 `path:startLine-endLine` 引用，判 `ready` 必须列出它读过的范围。宿主逐个核对：路径必须在这个工作区内、文件真的存在、行号真的在文件里；任何一条对不上，整份结论作废并按「不可用」处理。核对通过的引用会附上文件摘要，记录里因此能证明确切读过哪一版字节。

它盯的是「测试全绿却还是不对」：没被任何检查覆盖的硬要求、太弱的验收判据、会假绿的具体场景、没有依据的设计决定、反例、尚未解决的关键假设、会改变外部行为的歧义。

**有分歧会怎样.** 派发被挡住，Lead 必须逐条回应：

- **接受**：改计划（brief、路径、验收条件），改完这份新候选再送下一轮审查；
- **覆盖**：**只有 `warning` 可以覆盖**，写清理由，理由进持久记录；一边覆盖一边偷改计划会被拒；
- **`blocking-concern` 不能覆盖**：它的意思是「这份计划会做出错的东西」，作者不同意不算证据。只能改到它不再成立，或者问你。

最多三轮。第 2 轮的意见被接受后还有第 3 轮；三轮之后仍不让步时，Lead 只能问你或停下。

**审不了就不派工.** 超时、额度用完、线路不可用、输出解析失败、引用核对不上、或撞上防跑飞保险（一次审查最多 40 次工具调用），都会记成「不可用」并写明原因，**不会**有候选计划在没被审过的情况下派出去。你从 `/fusion` 里三选一：

```
/fusion foreman-retry                  同一份方案、同一条线路再试一次
/fusion foreman-model <provider/model> 换一条线路重审这份方案
/fusion foreman-skip <理由>            明确同意这份方案不经审查就派工
```

决定只绑定当前失败的那一份候选和那一轮。跳过不是审查通过；宿主自己的结构、路径、权限校验仍然生效。记录之后 Lead 会调用 `fusion_resume_plan` 用**原样保存**的那份方案继续，不会另写一份新方案来绕过。

**花费单独记账.** 工长调用记在 `foreman` 用途下，历史里每个任务能看到审了几次、多少 token、约多少钱、几条意见、接受/覆盖各几条。审查轮次不算 Sidekick 的返工轮次。

**开关.** 每个组合各自一个开关，默认关闭。打开后必须选一条**能跑工具的**模型线路，可以调推理强度、输出上限（默认 8192，上限 128000）和超时（默认 5 分钟，上限 10 分钟）。

**别把 ACP / Antigravity 线路配成工长.** 这两类线路在审查请求上直接 fail-closed（`AUX_DISABLED`：Antigravity 没有可验证的无工具模式、ACP 线路无法交回工具循环），所以每次审查都会变成「不可用」，而不可用不派工——等于把整条派工路径堵死。它们仍然可以当 Lead 或 Sidekick。

## 命令与工具

你在输入框里能用的：

| 命令 | 作用 |
|---|---|
| `/fusion status` | 任务阶段、控制状态、模型调用数、未收尾的操作、花费、工长审查状态（含原因） |
| `/fusion pause` / `resume` | 暂停 / 恢复当前任务 |
| `/fusion recover <检查记录>` | Host 重启后核对中断的工具操作；确认命令与子进程都已停止时加 `--effects-stopped` |
| `/fusion allow-explore <范围>` | 授权一次限定范围的只读调查（不送审、不派工） |
| `/fusion foreman-retry` | 重试失败的那次工长审查 |
| `/fusion foreman-model <provider/model>` | 换线路重审同一份方案 |
| `/fusion foreman-skip <理由>` | 明确跳过这次失败的审查 |
| `/fusion off` | 退出 Fusion，恢复成普通单模型会话 |

Lead 在会话里能调用的（Sidekick 只有其中一部分）：

| 工具 | 作用 |
|---|---|
| `fusion_plan_discussion` | 开启 / 结束一次需要和用户讨论的规划（`/grill-me` 会自动开启） |
| `fusion_delegate` / `fusion_delegate_text` | 把定稿方案交给 Sidekick（需要工作区 / 纯文本） |
| `fusion_rework` | 继续同一个 Sidekick，可以补授 `authority`、追加 `allowedPaths`、修正 `checks` |
| `fusion_explore` | 在你授权范围后发起一次只读调查 |
| `fusion_wait` | 读取已保存的报告和验收结果（不会把已结束的执行者再跑起来） |
| `fusion_review_result` | 记录验收结论（accept / rework / needs-decision） |
| `fusion_takeover` | 宿主解锁后接管修复 |
| `fusion_submit_result` | 交回结果（接管时由 Lead 用，平时是 Sidekick 用） |
| `fusion_read_state` / `fusion_read_evidence` | 读任务记录 / 读证据（diff、检查回执） |
| `fusion_resume_plan` | 用户记录恢复决定后，用原样保存的方案继续 |
| `fusion_finish_direct` | 结束整个直接任务（讨论或审查未完成时会拒绝） |
| `fusion_declare_runtime` | Sidekick 声明需要保留的后台进程 |

## 状态与数据

- **状态面板**：侧边栏 Fusion → 当前任务的阶段、验收、花费、工长审查（`审查中 / 就绪 / 有分歧 / 不可用` + 第几轮 + 接受/覆盖条数）。
- **数据位置**：默认 `$DSH_HOME/plugins/dsh-agent-studio-fusion/state.sqlite`（`DSH_HOME` 默认 `~/.dsh`）。用 `databasePath` 可以改。旧包 `dsh-fusion` / `dsh-model-fusion` 的数据在首次启动时自动迁移。
- **历史与花费**：历史里每个任务都能看到两个角色各自的 token、按价目折算的花费，以及相对「全用 Lead」的省下多少。

## 常见报错

| 报错 | 意思与处理 |
|---|---|
| `FUSION_LEAD_WRITE_CONFLICT` | 另一个角色正持有写租约。这是并发保护，不是权限缺失：读和搜索照常，等它交回或走 `fusion_takeover` |
| `FUSION_LEAD_TAKEOVER_LOCKED` | 接管还没解锁：需要返工轮次 + 检查仍失败、步数耗尽或反复卡住 |
| `FUSION_LEAD_DELEGATE_FIRST` | 这个工作流要求把执行交给 Sidekick；先 `fusion_delegate` |
| `FUSION_SIDEKICK_PROTOCOL` | Lead 试图伪造「交报告 / 直接结束任务」这类只有 Sidekick 该发的动作 |
| `FUSION_WORKER_AUTHORITY_DENIED` | 提交/推送/发布这类动作没有被工作单授权。用 `fusion_rework` 的 `authority` 补授 |
| `FUSION_TAKEOVER_REQUIRES_REWORK` | 接管前需要先有一份实现报告和一条 rework 审查结论 |
| 工长审查「不可用」 | 见上一节的三个 `/fusion` 命令；不会派工 |

## 限制（写清楚，别猜）

- **Lead 和 Sidekick 同时改同一个文件的窗口仍然存在。** 程序只挡住「另一个角色持租约时的写入」；两者都空闲时，靠提示词。
- **Code Mode 下 `run_code` 不受写租约约束。** Code Mode 把所有工具调用都包进 `run_code`，租约看不到程序内部，所以只能靠提示词约束。
- **ACP / Antigravity 线路做不了工长。** 它们会在审查请求上直接拒绝（见上一节）；配成工长会让每次审查都不可用，从而不派工。
- **工长跑命令可能有副作用**（例如测试写缓存或快照）。它被要求不修改工作区；宿主在审查结束后会比对工作区快照，快照变了就拒绝派工（`The workspace changed during plan review`），但不会逐文件报告漂移。
- **验收命令由宿主执行，失败重试策略有限**：同一份检查连续失败会被退回一次，之后交给 Lead 判断。

## 开发

```sh
pnpm install
pnpm typecheck                            # tsc --noEmit
pnpm exec vitest run                      # 单元测试
DSHX_HARNESS=<dsh 源码 checkout> pnpm test:host   # 用真实 Host 包跑的 native 测试
DSHX_HARNESS=<dsh 源码 checkout> pnpm build        # 重建 lib/（Host 模块 + Web 客户端包）
```

`lib/` 是随仓库一起发布的构建产物；改了 `src/` 之后要重建它，否则运行中的 Host 加载的还是旧代码。发布流程见 [RELEASING.zh.md](RELEASING.zh.md)。

## 文档

| 文档 | 内容 |
|---|---|
| [INSTALL.zh.md](INSTALL.zh.md) | 安装、迁移、桌面版 |
| [CHANGELOG.md](CHANGELOG.md) | 每个版本改了什么、验证了什么、没验证什么 |
| [RELEASING.zh.md](RELEASING.zh.md) | 发版步骤 |
| [docs/PLAN-LEAD-FOREMAN-V2.md](docs/PLAN-LEAD-FOREMAN-V2.md) | Lead / 工长流程改造的计划与阶段状态 |
| [docs/FOREMAN-WORKFLOW-PLAN.md](docs/FOREMAN-WORKFLOW-PLAN.md) | 工长工作流的历史设计提案（现行规则以本文为准） |
| [docs/DEVIN-LOCAL-FUSION.md](docs/DEVIN-LOCAL-FUSION.md) | Devin CLI 的 Fusion 二进制取证与本仓库逐项对比 |
| [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) | 支持的 Host 版本与兼容性说明 |
| [docs/EVIDENCE.md](docs/EVIDENCE.md) | 证据链说明 |

## 许可

Apache-2.0，见 [LICENSE](LICENSE)。Antigravity 与 ACP 的归属说明见 [docs/ATTRIBUTION-AGY.md](docs/ATTRIBUTION-AGY.md)、[docs/ATTRIBUTION-ACP.md](docs/ATTRIBUTION-ACP.md)。
