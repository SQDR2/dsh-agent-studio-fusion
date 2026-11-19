# Foreman 工作流设计与实施计划

> 历史设计提案。现行规则以 [README 的工长审查章节](../README.md#工长审查可选) 为准：Lead 定稿后才送审、取证不送审、审查不可用时暂停派工。下文的「每份探索单都审」和 `fail-open` 仅保留为历史方案。
>
> 目标：在不改变 Lead 最终决策权、不扩大 Sidekick 权限的前提下，引入独立审查视角，减少错误开工、无效返工和错误验收。

## 1. 结论

Foreman 不应成为第三个持续 Agent，也不应成为第二个 Lead。

推荐把 Foreman 实现为一个按检查点调用的辅助审查模块：

- Lead 负责理解用户、调查仓库、做出决定、形成工作单并最终验收。
- Sidekick（代码中的 Worker）负责执行冻结工作单、修改文件、运行命令并提交证据。
- Host 负责确定性校验、权限控制、状态持久化、检查执行和证据绑定。
- Foreman 负责独立质疑、验收盲点审计和失败归因，不拥有写权限、派工权、预算权或最终验收权。

v1 使用一次性文本模型调用，不扩展 `Role = 'lead' | 'worker'`，不创建第二个持久子会话，不读取整个仓库。

## 2. 要解决的问题

现有工作流存在三类相关性风险：

1. Lead 刚做出的决定，会倾向于继续证明原决定正确。
2. Lead 同时定义验收方式并最终验收，可能出现“自己出题、自己判卷”的盲区。
3. Lead 与 Sidekick 多轮返工后，双方可能被同一个错误假设锚定。

Foreman 的价值不是能力等级必然高于 Lead，而是拥有不同目标、独立上下文和严格受限的输出契约。

## 3. 角色与术语

| 名称 | 类型 | 当前状态 | 职责 |
| --- | --- | --- | --- |
| Lead | 模型角色 | 已存在 | 理解需求、做决定、形成工作单、采纳或覆盖审查意见、最终验收 |
| Sidekick / Worker | 模型角色 | 已存在；两个名称指同一角色 | 按冻结工作单执行修改、命令和测试，提交报告与证据 |
| Host | 确定性程序 | 已存在 | 校验、权限、租约、状态机、检查运行、证据持久化 |
| Foreman | 辅助模型用途 | 待实现 | 独立质疑、验收盲点审计、失败归因 |
| Compactor | 辅助模型用途 | 已存在 | 压缩历史上下文，不参与计划、执行或验收 |

代码中的角色联合目前只有 `lead | worker`。v1 保持该契约不变。

## 4. Host 与 Foreman 的分工

### 4.1 判定原则

满足以下条件的检查进入 Host：

- 能写成稳定、可复现的代码规则；
- 不依赖业务语义判断；
- 失败后必须无条件阻断；
- 不值得消耗模型 token。

满足以下条件的检查进入 Foreman：

- 需要理解用户意图；
- 需要寻找反例或替代解释；
- 需要判断证据是否足够；
- 结论允许合理分歧；
- Lead 可以采纳或给出理由后覆盖。

### 4.2 Host 检查

Host 检查候选工作单是否可以安全进入审查和执行：

- 必填字段和字段类型合法；
- requirements 确实逐字来自用户消息；
- allowedPaths 合法、位于工作区内且没有不支持的通配符；
- acceptance 命令和 parser 合法；
- 命令程序存在，definition paths 可访问；
- authority 没有越权；
- Worker 当前可接收工作，工作区租约状态正确；
- 步骤、返工和预算字段符合策略。

Host 只证明“输入合法、过程安全、证据真实”，不判断计划在业务语义上是否足够。

### 4.3 Foreman 检查

Foreman 检查候选工作单是否足以完成用户目标：

- 每条硬要求是否被计划覆盖；
- checks 全部通过时，是否仍可能不满足用户要求；
- Lead 的关键决定是否存在足以推翻它的反例；
- 工作单是否把未验证假设当成事实；
- brief、constraints、allowedPaths 和 acceptance 是否语义冲突；
- 是否存在会产生不同外部行为的实质性需求歧义。

Foreman 不负责验证可由 Host 确定判断的格式、路径和权限规则。

### 4.4 能力下沉

Foreman 反复发现且可以稳定形式化的缺陷模式，应下沉到 Host。

例如，Host 可以确定性检查 requirement 是否关联了 acceptance；Foreman 仍负责判断该 acceptance 在语义上是否真的能证明 requirement。

## 5. 目标工作流

```text
用户请求
  ↓
Lead：调查、形成候选决定和候选工作单
  ↓
Host：候选工作单基础校验
  ├─ 不合法 → 返回确定性错误，Lead 修正
  └─ 合法
       ↓
Foreman（启用时）：独立语义审计
  ├─ ready → 继续
  ├─ concerns → Lead 修订或逐条说明覆盖理由
  └─ unavailable → 记录并 fail-open
       ↓
Host：重新校验并冻结最终 WorkOrder
  ↓
Sidekick / Worker：执行、运行命令、提交证据
  ↓
Host：运行冻结 checks、整理真实证据
  ↓
Lead：检查 diff、报告和证据，最终 accept / rework / needs-decision
  ↓
异步归因：分析失败类别及 Foreman 命中率
```

Foreman 调用必须发生在候选 `WorkOrder` 和 checks 已构造完成之后、`work-order/prepared` 持久化和 Worker dispatch 之前。这样 Foreman 审查的内容与 Sidekick 即将收到的内容一致，但不持有写租约。

## 6. Foreman 能力范围

### 6.1 v1 在线能力

#### 验收契约对抗审计

检查“所有 checks 都通过”是否仍可能出现假通过：

- `uncoveredRequirements`：没有实施或验收映射的硬要求；
- `weakOracles`：能够运行但不能证明目标完成的检查；
- `falseGreenScenarios`：所有检查为绿但需求仍未满足的具体场景。

这是 v1 的首要能力。

#### 关键决策反例挑战

针对 Lead 显式提交的决定检查：

- 证据是否足以支持决定；
- 是否存在另一种同样解释现象的机制；
- 决定错误后的返工半径；
- 是否应该先验证某个前提。

Foreman 只提出反例和所需证据，不生成替代计划。

#### 高阈值需求歧义检测

仅报告会导致不同外部行为的歧义，最多 1–3 项。每项必须说明：

- 两种合理解释；
- 可观察行为差异；
- 能否依据仓库约定自行解决；
- 是否需要询问用户。

### 6.2 v1 离线能力

#### 失败归因与校准

任务失败、发生返工或 benchmark 完成后，异步输出：

- `failureClass`：`plan-defect | execution-defect | acceptance-gap | lead-review-miss | environment-failure | missing-user-decision`；
- `preventableAtPlanTime`；
- Foreman 对该缺陷是 `hit | miss | false-positive | not-applicable`；
- 置信度和证据。

离线归因不阻塞用户流程，用于判断 Foreman 是否值得保留和在哪类任务上启用。

### 6.3 v2 候选能力

数据证明有收益后再评估：

- 第二次返工后的根因诊断与止损建议；
- 高风险任务的交付结果盲审；
- 文本审查发现具体疑点后的有界只读事实核验；
- 语义范围和兼容性审计。

这些能力应作为独立检查点模块复用 Foreman route，不扩张 Foreman 的权限。

### 6.4 明确排除

Foreman 不得：

- 直接改写 Lead 的计划后自动派工；
- 修改文件或执行写命令；
- 获取工作区写租约；
- 调度、暂停、继续或替换 Worker；
- 扩大 allowedPaths 或授予 commit、push、publish 等 authority；
- 选择模型、批准预算或切换路由；
- 直接询问用户或承诺结果；
- 独立执行最终 accept / rework；
- 无上限地持续监督 Worker。

## 7. 数据契约

### 7.1 候选输入

Foreman v1 接收：

- 用户原始消息；
- 冻结 requirements；
- `goal`；
- `brief`；
- constraints；
- allowedPaths；
- acceptance/check definitions；
- Lead 的 `decisions`；
- Lead 的 `uncertainties`；
- 已有探索证据的摘要和引用。

不提供 Lead 的长篇自我辩护或隐藏思维过程，避免审查被锚定。

当前 `WorkOrder` 已有 `decisions` 和 `uncertainties`，但 coordinator 构造工作单时固定写入空数组。实施 v1 前应给 Lead 提供显式填充路径。

### 7.2 在线输出

```ts
interface ForemanAssessment {
  schemaVersion: 1
  candidateDigest: string
  verdict: 'ready' | 'concerns'
  acceptanceAudit: {
    uncoveredRequirements: ForemanFinding[]
    weakOracles: ForemanFinding[]
    falseGreenScenarios: ForemanFinding[]
  }
  decisionChallenges: {
    unsupportedDecisions: ForemanFinding[]
    counterexamples: ForemanFinding[]
    unresolvedCriticalAssumptions: ForemanFinding[]
  }
  materialAmbiguities: ForemanFinding[]
}

interface ForemanFinding {
  id: string
  category:
    | 'requirement-coverage'
    | 'acceptance-gap'
    | 'decision-counterexample'
    | 'unresolved-assumption'
    | 'scope-contradiction'
    | 'material-ambiguity'
  severity: 'warning' | 'blocking-concern'
  requirementIndexes: number[]
  decisionIndexes: number[]
  message: string
  suggestedCorrection: string
}
```

`blocking-concern` 表示 Lead 必须处理，不表示 Foreman 拥有最终否决权。

### 7.3 Lead 处理结果

每个 finding 必须有 disposition：

```ts
type ForemanDisposition =
  | { findingId: string; action: 'accepted'; changeSummary: string }
  | { findingId: string; action: 'overridden'; reason: string }
```

Lead 可以修订候选工作单，也可以覆盖意见，但覆盖理由必须进入持久记录，供离线校准。

## 8. 调用和失败策略

### 8.1 调用方式

v1 使用 purpose-tagged 的一次性辅助模型调用：

- 不创建 Foreman Agent；
- 不新增 `Role`；
- 不创建第二个 Worker child；
- 不获得工具表或工作区权限；
- token、费用和耗时按 `foreman` purpose 单独归因。

### 8.2 循环上限

- 首次候选工作单最多调用一次 Foreman；
- Lead 接受 concerns 并实质修订后，最多再调用一次；
- 第二次仍存在分歧时，Lead 必须覆盖、询问用户或终止派工；
- Foreman 循环不计入 Sidekick 的 rework rounds。

### 8.3 故障语义

Foreman 是质量增强，不是安全授权模块：

- 超时、额度不足、route 不可用、输出无法解析时 fail-open；
- Host 记录 `unavailable` 原因；
- Lead 和 UI 能看到本次计划未完成 Foreman 审查；
- Host 自己的确定性校验仍然 fail-closed。

## 9. 配置与产品界面

建议在每个模型组合中增加可选配置：

```ts
interface ForemanChoice {
  route: PhysicalRoute
  maxOutputTokens: number
  timeoutMs: number
}

interface PairChoice {
  lead: PhysicalRoute
  worker: PhysicalRoute
  foreman?: ForemanChoice
}
```

规则：

- `foreman` 缺失表示关闭，不增加独立布尔值；
- per-combo 配置，随 profile 冻结到会话；
- 默认关闭；
- route 必须是当前 catalog 中存在的真实模型；
- Foreman 与 Lead/Worker 使用同一模型时提示但不拒绝，同模型独立上下文仍是有效实验臂；
- 不以价格硬校验“中档模型”，价格和能力目录只用于提示；
- 设置页使用开关控制可选区域，开启后显示模型、推理强度、输出上限和超时；
- **没有审查策略开关**：`foreman` 存在即表示每一份候选工作单（explore、text、implement 都算）都必须先通过审查。早期的 shadow / 全量 / 风险触发三种策略已废弃，理由见 §12 阶段 4。

## 10. 持久化与可观测性

计划审查记录按候选 digest 绑定，不能覆盖现有 Lead review ticket/result：

- `plan-review/requested`；
- `plan-review/completed`；
- `plan-review/resolved`；
- `plan-review/unavailable`；
- `foreman-attribution/completed`。

至少记录：

- task、candidate digest 和调用轮次；
- route、purpose、token、费用、耗时；
- assessment 和 dispositions；
- 最终任务结果；
- Foreman 的 hit/miss/false-positive 分类。

现有状态索引只把 `lead` 和 `worker` 放入 `byRole`，其他用途进入 `other`。v1 应增加按 purpose 的 Foreman 统计，而不是扩展 Role 后静默丢失归因。

## 11. 模块设计

建立一个深模块，Coordinator 只了解小接口：

```ts
interface PlanReviewModule {
  review(candidate: PlanReviewCandidate, signal: AbortSignal): Promise<PlanReviewOutcome>
}

type PlanReviewOutcome =
  | { kind: 'ready'; assessment: ForemanAssessment }
  | { kind: 'concerns'; assessment: ForemanAssessment }
  | { kind: 'unavailable'; reason: string }
```

模块内部隐藏：

- 确定性 lint；
- prompt 构造和输入去锚定；
- route 调用；
- JSON schema 校验；
- 最多两轮策略；
- assessment/disposition 持久化；
- usage purpose 和成本归因；
- timeout、取消和 fail-open。

Coordinator 的 seam 位于候选 order/checks 构造完成后、`work-order/prepared` 之前。

## 12. 实施阶段

### 阶段 0：基线与观测

实施：

- 定义失败类别和 Foreman 指标；
- 记录当前 rework、verification gap、Lead accept 后失败等基线；
- 建立 Foreman purpose 的用量归因。

完成标准：现有任务可以不调用 Foreman，但所有后续 A/B 指标均可计算。

### 阶段 1：候选工作单和确定性 lint

实施：

- 为 Lead 提供填充 `decisions`、`uncertainties` 的输入；
- 建立 requirement 到实施说明和 acceptance 的显式映射；
- 把可以确定判断的规则留在 Host；
- 对候选内容计算 digest。

完成标准：同一候选输入得到稳定 lint 结果，非法候选在任何模型调用前被拒绝。

### 阶段 2：Shadow 文本审查

实施：

- 增加 per-combo Foreman route；
- 实现一次性调用和严格结构化输出；
- 仅记录 assessment，不改变派工；
- 异步计算命中、漏检、误报和成本。

完成标准：Foreman 故障不影响派工；每次意见均可与最终任务结果关联。

### 阶段 3：软门禁

实施：

- `concerns` 要求 Lead 修订或逐条覆盖；
- 实现最多两轮和 fail-open；
- 重新校验修订后的候选工作单；
- 在 UI 中显示当前审查状态。

完成标准：Lead 无 disposition 不能派工；Foreman 本身不能直接拒绝任务或修改候选。

### 阶段 4：风险触发 —— 已否决

曾计划实现确定性触发规则（多个硬要求、多路径、authority 动作、checks 缺失、Lead 声明的 uncertainty 等），只在触发时才调用 Foreman。

该方向已放弃，原因是它有一个结构性盲区：**explore 工作单永远触发不了任何一条规则**。只读调查单按定义没有用户需求（`#requirements` 对 explore 直接返回空）、没有 `allowedPaths`、没有 authority、也没有 uncertainties 参数，于是风险函数恒为"未触发"，而它在整个调查阶段是唯一存在的工作单 —— 用户配置了工长，却在最需要独立审查的那一段完全没有审查，看起来与"工长坏了"无法区分（session-0a8d7fbf）。

现在的规则更简单也更可验证：**配置了工长，就必须审查**。没有 shadow、全量、风险触发之分，也就没有"跳过"这个状态需要解释。代价是每次派工多一次审查调用；需要省这次调用的用户直接关闭工长。

### 阶段 5：v2 实验

分别实验返工诊断、交付盲审和有界只读事实核验。每项使用独立 schema、触发条件和指标，不扩张 v1 接口。

完成标准：每项能力单独证明收益后才能进入默认工作流。

## 13. 测试计划

### 单元测试

- 候选 digest 稳定；
- Host lint 和 Foreman concerns 的职责不重叠；
- Foreman schema 拒绝自由散文和未知字段；
- disposition 覆盖完整性；
- 两轮上限；
- timeout、取消和 invalid output 均 fail-open；
- profile 冻结和旧配置兼容；
- purpose 用量单独归因。

### 集成测试

- Foreman 关闭时，工作流与当前行为一致；
- `ready` 后只派工一次；
- `concerns` 后未处理不能 dispatch；
- 修订后 Host 重新 lint；
- override 理由持久化；
- Foreman route 故障不会阻断 Worker；
- 中断恢复不会重复调用或重复派工；
- Foreman 永远没有写租约和 Worker 工具。

### UI 测试

- 开关关闭时不要求模型；
- 开关开启后模型必填；
- stale route 能定位到具体组合和 Foreman；
- 状态展示 ready / concerns / unavailable；
- token、费用和耗时不混入 Lead/Worker 两栏。

## 14. A/B 验证与保留门槛

先在现有 SWE-rebench 任务上比较：

- Foreman 关闭；
- Shadow；
- 软门禁；
- 可选的同模型独立上下文实验臂。

指标：

- resolved 数；
- 首轮执行成功率；
- rework rounds；
- 错误 accept 数；
- Foreman concerns 率；
- Lead override 率；
- false-positive 和 miss；
- 总 token、总费用、每个 resolved 的费用；
- 总完成时间和首次有效修改时间。

初始保留门槛：

- Astra + Flash 从 11/18 提升到至少 13/18；
- 配对成本比仍不超过 0.60；
- 不显著增加错误阻断和用户澄清；
- Foreman 的可预防命中数高于误报导致的额外 Lead 往返。

未达到门槛时保持默认关闭，并保留实验结论；不要把未证明收益的调用变成永久关键路径成本。

## 15. 关键代码落点

以下是当前代码中的主要 seam，行号以本提案编写时为准：

- `src/contracts.ts`：`Role`、`WorkOrder`、review/event contracts；
- `src/host/settings.ts`：`PairChoice`、route 校验和 profile 转换；
- `src/profile/compactor.ts`：可选辅助 route 的现有先例；
- `src/host/native-auxiliary.ts`：辅助请求跟踪；
- `src/host/native-usage.ts`：usage purpose 归因；
- `src/host/coordinator.ts`：候选 order/checks 构造、派工和最终 review；
- `src/task/state.ts`、`src/task/reducer.ts`：任务状态与事件折叠；
- `src/task/status-index.ts`：purpose/role 状态和用量投影；
- `src/client/FusionSettings.tsx`：per-combo Foreman 配置；
- `src/client/FusionHistory.tsx`：历史 assessment、disposition 和成本展示；
- `src/benchmark/native-run.ts`：Foreman benchmark 条件。

## 16. 不变量

实施中必须保持：

1. Lead 是唯一计划决策者和最终验收者。
2. Worker 是唯一持有委派写租约的模型角色。
3. Host 是唯一权限、状态和证据真相源。
4. Foreman 输出 concerns，不产生工作区副作用。
5. Foreman 故障不能绕过 Host 的确定性保护，也不能阻断整个任务。
6. 每项 Foreman 成本和意见必须可归因、可回放、可淘汰。
7. 新增能力先证明收益，再进入默认关键路径。
