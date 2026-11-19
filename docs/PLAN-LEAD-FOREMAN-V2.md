# Lead / 工长 流程改造计划（v2）

> 状态：待批准执行
> 目标：Lead 与工长都按「Devin Fusion Lead」的方式工作——权限放开、纪律靠提示词；工长必须对着真实代码审，而不是只读计划文本。

## 1. 目标流程

```
用户请求
  │
  ├─(互动型 skill，如 /grill-me) → 先与用户讨论，讨论未完成不许定稿
  │
Lead：自己读代码/跑命令形成判断（用户权限）→ 定稿计划
  │
  ├──► 工长审查（独立上下文，可读代码、可跑命令，提示词规定只审不改）
  │        │
  │        ├─ 有意见 → 回到 Lead 修改 → 重新定稿 → 再送审（最多 3 轮）
  │        └─ 无意见（且引用能对上真实文件）→ 放行
  │
  └──► 宿主派 Sidekick 执行 → 宿主跑验收 → Lead 审查结果 →（不通过）同一 Sidekick 返工
```

不可用（超时/线路失败/输出解析失败/引用对不上）→ **停在未派工**，由用户选择
`/fusion foreman-retry`、`/fusion foreman-model <线路/模型>`、`/fusion foreman-skip <理由>`。

## 2. 角色与权限模型（核心变化）

| 项 | 现在 | 目标 |
|---|---|---|
| Lead 沙箱 | 不持写租约时强制 `read-only`，跑测试/构建基本失败 | 使用用户自己的沙箱模式；**只在 Sidekick 持写租约期间**拒绝写（并发保护，非能力限制） |
| Lead 工具 | 只读工具 + 受限 shell + `fusion_*` | 不变（本就要能读、能跑命令） |
| 工长工具 | `tools: []`（只能读计划文本） | `read` / `grep` / `glob` / shell，跑在用户模式；「只审不改」由提示词约束 |
| 角色纪律 | 工具表 + 沙箱硬拦 | 提示词（贵模型遵守度高）+ 下列硬约束 |

**保留的硬约束（属防伪与并发，不是权限阉割）**

1. 工长的每条阻断意见与「通过」都必须带 `path:行段`，宿主按真实文件核对，核不上 → 作废并记为不可用。
2. 审查不可用 → 不派工。
3. 最多 3 轮；阻断意见只能改，不能由 Lead 覆盖；`warning` 可带理由覆盖。
4. Sidekick 持写租约期间，Lead 写入被拒（并发写保护）。
5. 只读探索（`/fusion allow-explore`）不送工长。

## 3. 分阶段实施

### S1 工长：按代码审查（已过半）

- [x] 循环：多次 `llm.stream`，模型决定读什么；`tools` 提供 `read`/`grep`/`glob`
- [x] 引用核对：`verifyForemanCitations`（路径在仓库内、行号存在、记录文件摘要）
- [x] 工具集加 **shell**（`nativeShellTool`），运行在**用户沙箱模式**
- [x] 「只审不改」改为提示词条款（`FOREMAN_SYSTEM_PROMPT`）
- [x] 防跑飞保险（每轮工具调用上限），超出记 `unavailable` 并写明原因
- [x] 3 轮上限；`blocking-concern` 拒绝 `overridden`
- 测试：循环可发起 shell 并据输出给结论；引用不存在 → 不可用；第 3 轮可达；阻断覆盖被拒且不派工
- 关键文件：`src/host/plan-review.ts`、`src/host/plan-review-tools.ts`、`src/plan-review.ts`、`src/host/coordinator.ts`

### S2 Lead：解除强制只读

- [x] `src/host/native-role-sandbox.ts`：Lead 不再被降级为 `read-only`，改用用户模式
- [x] 写入拒绝只发生在「Worker 持有写租约」时；错误信息相应改写（不再是 `FUSION_LEAD_READ_ONLY` 的笼统说法）
- [x] 相关测试改写：`tests/lead-write-boundary.spec.ts`、`tests/native-scopes.spec.ts`、`native-tests/coordinator.spec.ts` 中「Lead 只读」用例
- [x] 新增用例：Worker 持租约时 Lead 写入被拒；Worker 交回后 Lead 可写
- 风险：Lead 与 Worker 同时改同一文件的窗口仍存在（提示词 + 租约共同约束）

### S3 提示词与文档

- [x] `prompts/model-lead.md` / `prompts/lead.md`：改写成 Devin 风格——你负责结果、用户沟通与权威动作；实现与验证默认委派；一两轮内的小事可自己做；可以读、搜、跑命令来形成判断；不得留下半成品
- [x] `README.md`（2026-11-19 重写为单一中文版）：角色权限、工长审查、3 轮、不可用不派工
- [x] `docs/DEVIN-LOCAL-FUSION.md`：补记「Devin 的 Lead 未被沙箱化」的新证据（`3000.14.30821`）

### S4 入口闸门（已完成，复核即可）

- [x] `fusion_plan_discussion(open/finalize)`；`/grill-me` 自动开启讨论
- [x] `/fusion allow-explore <范围>` 授权 + 范围一致校验；探索不送审、不派工
- [x] 未定稿不许提交实施计划；`fusion_finish_direct` 不许提前结案

### S5 构建与加载

- [x] 一次性重建 `lib/`（`DSHX_HARNESS=… pnpm build`）
- [ ] 重启 `pnpm dsh web`（需用户放行；会中断当前会话这一轮）
- [ ] 校验：`/fusion status` 出现 `planReview`；`fusion_plan_discussion` 在新会话工具表里可见

### S6 端到端实测（新会话）

1. **有 `/grill-me`**：讨论未完成时提交实施计划 → 被拒且不送审；讨论完成定稿 → 送审 → 派工
2. **无 `/grill-me`**：直接定稿 → 送审 → 派工（不额外插确认）
3. **审查失败**：工长指到 Antigravity（fail-closed）→ `unavailable` → 无 `child/accepted` → `/fusion foreman-model` 换线路 → 同一份计划重审通过 → 派工
4. **阻断不可覆盖**：构造 `blocking-concern` → Lead 试图 `overridden` → 被拒
5. 证据：Fusion 账本中 `plan-review/requested|unavailable|completed`、`plan-review/skip-authorized`、`work-order/prepared`、`child/accepted` 的先后顺序

### S7 成本与回滚

- 成本：3 轮 × 每轮多次读/命令，明显高于当前单轮调用；先按默认 3 轮观察，必要时降为 2 轮或缩减工具集
- 回滚：`git revert` 本分支提交；`lib/` 与源码同提交，回滚后需重建；不涉及数据库结构变更（仅新增事件类型 `plan-review/skip-authorized`）

## 4. 验收标准

1. `pnpm typecheck`、`pnpm exec vitest run`、`pnpm test:host` 全绿
2. S6 五条实测全部符合预期，账本事件顺序可复核
3. Lead 能在不持租约时跑通一次测试命令（证明沙箱放开生效）
4. 工长在一次审查中至少一次真实读取或执行，并在结论里引用真实行号
5. 审查不可用时，账本中不存在 `child/accepted`

## 5. 未决问题

- Lead 与 Worker 并发写的兜底是否需要更强（例如 Lead 写前必须显式 `fusion_takeover`）
- 工长执行命令的副作用（例如跑测试写入缓存/快照）是否需要在跑完后比对工作区并报告漂移
- 3 轮上限是否暴露到组合配置面板
