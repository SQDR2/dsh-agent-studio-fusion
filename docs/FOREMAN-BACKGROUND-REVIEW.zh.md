# 工长后台审查实施计划（Foreman as Background Review）

> 状态：已实施（1.5.0），实施记录见第 11 节；阶段 1 的子会话形态按第 11 节调整为进程内后台任务
> 日期：2026-11-19
> 关联：[`FOREMAN-WORKFLOW-PLAN.md`](./FOREMAN-WORKFLOW-PLAN.md)（历史方案）、[`PLAN-LEAD-FOREMAN-V2.md`](./PLAN-LEAD-FOREMAN-V2.md)
> 背景证据：`session-20b3fa52-3af8-4484-8e55-4f9c0679e63b`（2026-11-19 16:32–16:42，工长审查撞上 600 000 ms 上限，派工被阻断）

## 1. 一句话结论

工长审查是 Fusion 里**唯一还在同步等待的角色**。Sidekick 早就是后台子会话 + 结算通知，
工长却还是 `fusion_delegate` 里的一次 `await`，所以它只能靠"任务级总时长"收场；而到点后
交出的是白卷，不是结论。

本计划把工长改成**后台子会话审查**：派发即返回，审查在自己的会话里跑完，结论落账后唤醒
Lead，`concerns` 修订再审、`ready` 派 Sidekick。任务级超时随之取消，只保留三种真实边界：
线路静默、单条命令超时、连续取证不收敛。

## 2. 现状与证据

### 2.1 三个角色的运行形态

| 角色 | 运行形态 | 阻塞 Lead 的 turn？ | 结论如何回到 Lead |
| --- | --- | --- | --- |
| Lead | 会话主 turn | — | — |
| Sidekick（Worker） | 子会话；`block: false` 可后台（`src/host/coordinator.ts:317`） | 否 | `subagent-settled` → `NativeWorkerNotices.project`（`src/host/native-worker-notices.ts:27`） |
| Foreman | **`fusion_delegate` 内 `await service.review(...)`**（`src/host/coordinator.ts:2660`） | **是，整轮被占** | 同步返回 |

### 2.2 一次真实失败的账

| 项 | 数值 | 说明 |
| --- | --- | --- |
| 审查时长 | 610 s | 16:32:26 派发 → 16:42:36 中止 |
| 模型回合 | 22 | 已记录的 21 次请求输出 63 480 tokens，约 142 tokens/s |
| 工具调用 | 42（日志中 39 个 shell 作业） | 全部正常返回 |
| 工具执行总耗时 | 26.2 s | 占审查时长 4.3% |
| 单回合耗时 | 4 s → 46 s | 单回合思考输出 140 → 7 300 tokens |
| 结果 | `Foreman review aborted: … used its whole 600000ms ceiling while still streaming after 42 tool calls` | 无结论，派工阻断 |

结论：**没有任何一次调用卡住**。时间全部花在模型推理输出上；审查是被总时长掐断的，不是被
某条命令或某次请求卡死的。

### 2.3 为什么总上限存在

审查是一个嵌在 Lead 工具调用里的同步循环：

```
fusion_delegate(…)
  └─ await service.review(candidate, exec.signal)   ← Lead 的 turn 挂在这里
```

它没有自己的界面、没有独立取消入口（只能取消整个 Lead turn）、跑的时候 Lead 什么都不能做。
所以 Host 必须给这个 `await` 一个出口。**总上限是同步实现逼出来的，不是协议要求。**

同一形态已经失败过两次，而每次只是把上限翻倍（前一场的数据来自提交 `553d8fc` 的说明）：

| 场次 | 上限 | 工具调用 | 结果 |
| --- | --- | --- | --- |
| `session-28dd82b6` | 300 000 ms | 21 | 到点被杀 |
| `session-20b3fa52` | 600 000 ms | 42 | 到点被杀 |

两次都以约 14 s/次的节奏把预算吃满（540 s 模型间隙 / 39 次工具往返）：多给的预算被花在更多取证上，
而不是更早给结论。审查循环里没有任何一处告诉它"还剩多少预算、该交卷了"。

## 3. 目标形态

### 3.1 时序

```
Lead turn N
  fusion_delegate(plan)
    ├─ Host 校验计划 → 存 foreman-input → append plan-review/requested
    ├─ 启动 Foreman 子会话（route = foreman.route，persona = FOREMAN_SYSTEM_PROMPT，
    │                     工具 = read/grep/glob/shell，无写工具）
    └─ 返回 "review-dispatched (round R)"          ← Lead 的 turn 立即结束
Foreman 子会话（自己的 turn、自己的 transcript、可单独取消）
  … 读代码、跑命令，直到输出一个 JSON 评估 …
  └─ settled → Host 解析 + 引文校验
              → append plan-review/completed | unavailable
              → 清 pending → notice 唤醒 Lead
Lead turn N+1（由 notice 触发）
  ready    → 派 Sidekick（现有 dispatch 路径）
  concerns → 修订计划 → 再 fusion_delegate（round R+1，回到上面）
  超过 FOREMAN_MAX_REVIEW_ROUNDS → 交回用户
```

### 3.2 状态

```
PLANNING ──dispatch──► REVIEWING_PENDING(round R, childId)
                              │
             settle ──────────┼──► PLAN_READY ──► WORKER_RUNNING …
                              │
             settle ──────────┴──► PLAN_CONCERNS ──► 回到 PLANNING（round R+1）
                              │
             interrupted ─────┴──► PLAN_UNAVAILABLE（现有恢复命令）
```

### 3.3 已存在的可复用件

- 事件溯源：`plan-review/requested`、`plan-review/completed`、`plan-review/unavailable` 已存在，
  延迟结算不需要新协议。
- 计划输入 `foreman-input:<taskId>:<workOrderId>` 在审查前落盘（`src/host/coordinator.ts:2687`）→ 可重跑。
- `pendingPlanReview` 已能挡住审查期间的重复派工（`src/host/coordinator.ts:2178`）。
- 唤醒已有先例：`agent.send(message, 'next-turn', true)`（`src/host/planning-commands.ts:31`）。
- 子会话启动、工具上限、中断已有先例：`NativeWorkerTransport.start`
  （`src/host/native-worker.ts:99`、`:116`）。
- 结算通知投影已有先例：`NativeWorkerNotices.project`（`src/host/native-worker-notices.ts:27`）。

## 4. 需要撤销的既有决定

`docs/FOREMAN-WORKFLOW-PLAN.md` 的 v1 明确写着：

> v1 使用一次性文本模型调用，不扩展 `Role = 'lead' | 'worker'`，不创建第二个持久子会话。

这个决定的前提是"审查 = 一次文本调用"。审查现在已经是一个带工具、带引文校验的多回合循环
（`src/host/plan-review.ts:475` 的 `FOREMAN_SYSTEM_PROMPT` 要求对着真实仓库取证），前提已经不成立。
本计划需要一条 ADR/文档修订记录：**扩展 `Role` 增加 `'foreman'`，允许第二个子会话，其工具面只读。**

## 5. 预算语义

| 预算 | 所在位置 | 处置 |
| --- | --- | --- |
| 每请求 idle watchdog | DSH 内建（如 `packages/llm/llm-deepseek/src/adapter.ts:68`） | **保留**。这是活性检查：区分"还在想"和"线路死了" |
| 静默窗口 | `foremanStallBudgetMs`（`src/host/plan-review.ts`） | **保留**（并入子会话后由 idle watchdog 承担） |
| 单条命令上限 120 s | `FOREMAN_COMMAND_TIMEOUT_MS`（`src/host/plan-review-tools.ts:57`） | **保留**，搬到子会话的 shell 上限 |
| 工具调用上限 60 | `FOREMAN_MAX_TOOL_CALLS`（`src/host/plan-review.ts:41`） | **保留但改语义**：接近上限时触发"强制交卷"，不再直接丢弃；阈值上调 |
| 任务级总时长 600 s / 900 s | `timeoutMs`（`src/profile/foreman.ts:28`） | **默认取消**。仅显式配置时作为"耐心"；到点前发一次无工具请求强制交卷 |
| token 预算 | `src/host/native-budget.ts` | 可选，作为真正的成本边界 |

原则：**时间是活性信号，不是工作量信号。** 判断一次审查该不该继续，看它"还在不在动"和
"还要读多少"，不看"已经过了几分钟"。

## 6. 分阶段实施

### 阶段 0 — 契约先定（0.5 天）

- `fusion_delegate` 返回值分两种：`review-dispatched` 与 `dispatched`（复用 `block?: boolean`，
  `src/host/coordinator.ts:319`）。默认后台；`block: true` 保留同步模式一个月供脚本与测试。
- 循环终止条件：沿用 `FOREMAN_MAX_REVIEW_ROUNDS`（`src/host/coordinator.ts:2468`），并规定
  **每轮 `candidateDigest` 必须变化**，否则拒绝重审，防止"循环到审查完毕"退化成无限重审同一份。
- 补一条文档修订，说明第 4 节撤销的决定与理由。

**验收**：工具 schema、返回文案、错误文案定稿；`/fusion foreman-retry` 的语义（同一候选、新 round）写清楚。

### 阶段 1 — 审查脱离 Lead 的 turn（1.5 天，核心）

**实施形态（1.5.0）**：审查作为 Host 自己的后台任务运行，不是独立子会话。理由是它保住了
现有不变量：审查工具仍由 Host 执行（只读、工作区守卫、单条命令上限）、引文仍由 Host 校验、
不需要第二份 prompt/role 装配。代价是没有独立的 transcript 与独立取消按钮——取消通过停止任务
或任务级停止入口完成。子会话形态留作后续（见第 11 节）。

改动点：

- 新增 `src/host/plan-review-jobs.ts`：按 `taskId` 的进程内注册表，`start`/`finish`/`cancel`，
  挂在 Host 的 `Context` 上（HMR 换 coordinator 仍能看到运行中的审查）。
- `#runPlanReview` 拆成"请求 / 派发 / 结算"三段：`plan-review/requested` 与
  `foreman-input` 在任何模型调用之前落账；后台分支只调度任务并返回 `dispatched`。
- 结算 `#recordPlanReviewOutcome` 统一写 `plan-review/completed|unavailable`，后台路径另外唤醒 Lead。
- 停止任务时 `#stopJobs` 中止运行中的审查，由结算路径写成显式不可用。

**验收**：`pnpm typecheck`、`pnpm exec vitest run`（860 通过，含
`tests/plan-review-jobs.spec.ts`）。

### 阶段 2 — 派发即返回（1 天）

- 拆 `#runPlanReview`（`src/host/coordinator.ts:2660`）为两个方法：
  - `#dispatchPlanReview`：append `requested`、写 `pendingPlanReview`、启动 child、返回 dispatched。
  - `#settlePlanReview`：取 child 最后一条 assistant 文本 → `parseForemanAssessment`
    （`src/plan-review.ts:534`）→ `verifyForemanCitations` → append `completed`/`unavailable` → 清 pending。
- `pendingPlanReview` 期间的 gate 行为保持不变（`src/host/coordinator.ts:2178`），避免并发派工。
- **格式不合格不算失败**：先给同一个 child 补发一次"只返回 JSON"的 follow-up（最多 2 次），
  再判 `unavailable`。比整次重审便宜一个数量级。

**验收**：`fusion_delegate` 在同一步内返回，不再有 600 s 级别阻塞；结算只发生一次（幂等）。

### 阶段 3 — 结论回到 Lead（0.5 天）

- 结算后 `agent.send(notice, 'next-turn')`，内容：verdict、findings 摘要、`blocking-concern` 数、
  下一步指令（派工 / `fusion_resume_plan` 再审）。
- notice 归档为 artifact，历史里只留摘要（与 `NativeWorkerNotices` 一致）。
- 唤醒失败（会话已关闭、用户切走）时结论仍可从 `plan-review/completed` 与 `fusion_read_state` 读到。

**验收**：空闲会话被 notice 唤醒后能正确续跑；重复投递不会产生两次派工。

### 阶段 4 — 循环与派工（0.5 天）

- `concerns` → Lead 修订 → 新一轮 dispatch。
- `ready` → 现有 Sidekick dispatch 路径不变。
- `fusion_read_state` 的 `review` 字段补 `pending: { round, route, startedAt, childId }`。

**验收**：`concerns → 修订 → ready → 派工` 全链路跑通；超过轮数上限时交回用户。

### 阶段 5 — 恢复与对账（1 天）

当前重启会把 `pendingPlanReview` 一律判 `interrupted plan review`（`src/host/coordinator.ts:763`）。
改为三态：

1. child 会话仍在 → 恢复等待（继续 settle）。
2. child 不在但 `foreman-input` 在 → 用原候选重跑（新 round）。
3. 都没有 → 判 `unavailable`，沿用现有恢复文案（`src/host/coordinator.ts:128`）。

另外：

- 取消/停止只中断 child，保留候选与 `foreman-input`，可直接 retry。
- 启动对账时清理僵尸 child，避免旧 settle 推送误唤醒。

**验收**：kill -9 后重启，三种情形各走对分支；不出现双结算或永久 pending。

### 阶段 6 — UI / 状态（0.5 天）

**实施（1.5.0）**：

- `fusion_read_state` 的任务事实新增 `planReview.pending` / `planReview.latest`（轮次、线路、
  请求时间、最近结论与不可用原因），Lead 不必读日志就知道"正在审 / 审完 / 失败"。
- Fusion 设置的工长超时字段改为可留空（= 不设上限），文案与校验同步。
- `fusion_delegate` 在后台派发时返回"计划审查已派发（第 N 轮…）"，并说明收到通知后调用
  `fusion_resume_plan`。

未做（留作后续）：状态面板上的"审查中"徽标与单独取消按钮（当前取消入口是停止任务）。

### 阶段 7 — 预算收敛（0.5 天）

- 删除 `FOREMAN_DEFAULT_TIMEOUT_MS` 作为默认上限（`src/profile/foreman.ts:28`），
  `timeoutMs` 改为可选字段。
- 保留"到点强制交卷"路径：无工具请求 + 明确要求返回 JSON；被强制的结论同样要过引文校验。
- 前端字段同步：超时改为可选配置，文案说明它是"耐心"不是"上限"。

**验收**：默认组合下，长审查不会被时间掐断；显式配置上限时仍按上限收尾。

## 7. 测试计划

- 改写 `tests/plan-review.spec.ts` 中的时钟用例：删除"到点丢弃"，新增
  "到点强制交卷且 verdict 可解析""交卷结论的 citations 仍被 Host 校验"。
- 新增集成用例：
  1. dispatch 返回 dispatched → child settle → notice 唤醒 → Lead 读到 verdict；
  2. `concerns` → 第二轮 dispatch → `ready` → Sidekick dispatch；
  3. 重启三态对账（阶段 5）；
  4. 格式不合格 → follow-up → 合格；
  5. 取消审查后候选仍可 retry；
  6. 同 digest 连续送审被拒。
- 基线：`pnpm typecheck`、`pnpm test`（当前 854 用例）、`pnpm test:host`（333 用例）。

## 8. 风险与待决策

1. **交互变化**：审查期间 Lead 的那一轮会提前结束，界面表现为"已派发审查"。
   需要确认接受这个形态。
2. **工具语义变化**：审查从 Host 托管的 `executeForemanTool` 换到子会话原生工具。
   写权限靠 ceiling 关闭，但 shell 本身仍能写（与今天一样是提示级约束）。
   是否要给审查单独一个只读沙箱？
3. **重启策略**：中断的审查默认"用原候选重跑"，还是"判失败等用户决定"？
4. **同步模式保留多久**：`block: true` 保留一个月，还是直接删？
5. **成本归属**：审查 token 单独计量（foreman 预算）还是记在 Lead 头上？
6. **每轮换 digest**：这条会不会挡住 `/fusion foreman-retry`？建议 retry 走"同一候选、新 round"，不受限制。

## 9. 必须保持的不变量

1. Lead 是唯一计划决策者和最终验收者。
2. Worker 是唯一持有委派写租约的模型角色。
3. Host 是唯一权限、状态和证据真相源。
4. Foreman 不产生任何工作区副作用；写工具从 ceiling 层面就不给它。
5. Foreman 故障不能绕过 Host 的确定性保护，也不能静默放行——只能显式失败并交回用户。
6. 每项 Foreman 成本、意见与轮次必须可归因、可回放。
7. 审查结论必须绑定真实文件范围，引文由 Host 校验。

## 10. 工期

| 阶段 | 内容 | 估时 |
| --- | --- | --- |
| 0 | 契约与文档修订 | 0.5 天 |
| 1 | Foreman 子会话 | 1.5 天 |
| 2 | 派发即返回 | 1 天 |
| 3 | 结论回 Lead | 0.5 天 |
| 4 | 循环与派工 | 0.5 天 |
| 5 | 恢复与对账 | 1 天 |
| 6 | UI / 状态 | 0.5 天 |
| 7 | 预算收敛 | 0.5 天 |
| 合计 | | **6 天** |

阶段 1–3（约 3 天）构成一个可独立验收的垂直切片：**派发即返回 + 子会话审查 + 通知回 Lead**，
先把"卡 10 分钟"从根上去掉。阶段 4–7 再补循环、恢复与 UI。

## 11. 实施记录（1.5.0）

已实现：

| 计划项 | 状态 |
| --- | --- |
| 阶段 0 契约（`block: true` 保留同步、后台为默认） | 完成 |
| 阶段 1 审查脱离 Lead 的 turn | 完成，形态为 Host 后台任务（非子会话） |
| 阶段 2 派发即返回 + 异步结算 + 幂等 | 完成 |
| 阶段 3 结论回 Lead（`agent.send` notice） | 完成 |
| 阶段 4 循环与派工（`concerns` → 再审 → `ready` → Sidekick） | 完成，复用既有 rounds 与 gate |
| 阶段 5 恢复与对账（重启后同候选重派、不同候选记 interrupted） | 完成 |
| 阶段 6 UI/状态（任务事实、可留空超时） | 部分完成（无独立取消按钮） |
| 阶段 7 预算收敛（默认无 ceiling、到点强制交卷、上限 120） | 完成 |

与计划的偏差，以及原因：

1. **没有引入 `Role = 'foreman'` 与第二个子会话。** 子会话会重写审查的工具装配与权限边界
   （Host 执行的对读工具、工作区守卫、单条命令上限、`markForemanReview` 标记），而这些正好
   是现在保证"只审不改、引文可验"的部分。用进程内后台任务拿到同样的用户可见行为，
   风险小一个数量级。子会话仍然值得做——它的收益是独立 transcript 与独立取消——但应该作为
   单独一次改动，带自己的不变量与测试。
2. **"重启三态"落成了两态 + 按需重派。** 重启后没有内存中的任务，Host 也不会替用户起审查：
   下一次同一候选的 `fusion_resume_plan` / `fusion_delegate` 会复用已记录的那一轮重新派发；
   不同候选则记为 `interrupted plan review`。这避免了"开机自动起一次审查"在会话未加载时无法
   拿到 Agent 的问题。
3. **子会话取消按钮未做**，取消入口是任务停止（`#stopJobs`），结算会把被中止的审查写成
   显式不可用。

后续若要补子会话形态，最小路径是：给 `NativeWorkerTransport` 加一个 foreman 角色的
`start`（persona = `FOREMAN_SYSTEM_PROMPT`、ceiling = `READ_TOOLS + shell`），把
`#startPlanReviewJob` 的 promise 换成"启动子会话 + 等它的 `subagent-settled`"，结算与通知
保持不变。
