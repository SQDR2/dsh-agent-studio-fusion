# Devin CLI 的 Fusion 是怎么做的 —— 二进制取证与 dsh-fusion 逐项对比

> 取证对象：`devin 3000.12.32`（`/home/zlw/.local/share/devin/cli/_versions/current/bin/devin`）
> SHA-256 `9f9c08774f928ef1b4c7d1a77d3d185318921c79a9a5b6e04b7c0663bc416ab5`，209,703,784 字节，ELF x86-64 static-pie，已 strip。
> 对比对象：本仓库（dsh-fusion 0.3.8）。
> 本文所有偏移都是 ELF 文件偏移；该二进制的 `.rodata` 段 `p_offset == p_vaddr`（0x84a1000），所以偏移可以直接当 `.rodata` 虚拟地址用。

---

## 0. 结论先说

Devin 的 Fusion 在**机制上很薄、在提示词上很厚**：一个配对模型 + 一个"整个会话只有一个、上下文和运行时都跨 handoff 存活"的 sidekick 子代理，角色分离几乎全部靠系统提示词和运行时提醒来维持。价格、模型配对、可委派边界全部由后端元数据（`isFusion` / `isFusionCompatible` / `AssignModel`）决定。

dsh-fusion 走的是相反的路：把角色分离下沉到**工具表 + 沙箱 + 宿主执行验收命令**。所以在两件事上它比 Devin 硬：

- **Lead 真的写不了东西**（Devin 的 Lead 能写，只是会被提醒别写）；
- **验收命令由宿主在真实环境跑，结果由宿主记录**（Devin 是 sidekick 自己跑、自己汇报，Lead 只审"它交回来的产物"）。

但有 4 处 dsh-fusion 明确缺东西，且都不是"再加一句话"能补的：

| # | 缺口 | 严重度 | 一句话 |
|---|---|---|---|
| G1 | 没有权威动作分界 | **高** | Worker 持写租约 + 完整 shell，可以 `git commit` / `git push`；Devin 明写 sidekick "does not own commits, pushes, pull requests or CI" |
| G2 | 常驻进程不能跨 handoff | **高** | Worker 提示词要求"所有命令收尾后才能提交报告"，后台 job 又占着写租约；Devin 明写 dev server / DB 连接"usually survive between handoffs"并要求每份 brief 带一行 runtime state |
| G3 | 没有"不可委派"红线 | **高** | Devin 定义了一类 brief 直接 INVALID（查询原文、rubric/grader/eval harness、scoring/threshold/sampling/pipeline 配置）；dsh-fusion 只说"简报写必须成立什么" |
| G4 | 简报措辞与 Devin 的实测结论相反 | 中 | Devin：**"Specify the code, don't describe it"**、要给 fenced snippet；dsh-fusion lead.md："不替 Worker 逐行写实现" |

另外 3 项是中等/低优先：缺"委派失败模式"清单（含反重复规则）、配对没有经济性/兼容性校验、用户中途插话没有显式策略。

**本分支的状态（2026-11-11）**：G1 已改为宿主强制（`src/host/authority.ts` + `coordinator.ts` 的 Worker shell 守卫，工作单可用 `authority` 显式授权具体动作）；G3/G4/G5 的提示词部分与 G7 已落进四份提示词；G2 经实测确认**在插件层不可达**——障碍在 Host 的 job 生命周期，不在本仓库（见 §9）。细节见 §7、§8、§9。

---

## 1. 取证方法与边界（先说清楚什么没做到）

REA 在本机只有 artifact 类 provider 可用，反编译器全部缺失：

| Provider | 状态 | 原因 |
|---|---|---|
| Ghidra | unavailable / `not_configured` | `GHIDRA_INSTALL_DIR` 未设置，`analyzeHeadless` 不存在 |
| Hopper | unavailable / `executable_missing` | `/opt/hopper/bin/Hopper` 不存在 |
| IDA | unavailable / `not_configured` | `REA_IDA_MCP_CONFIG` 未设置 |
| Kuna | unavailable / `not_configured` | `REA_KUNA_COMMAND` 未设置 |
| rust-auditable | **available** | 已调用，得到 `ev_023ff7e7…31af4cc` |

`inspect_rust_binary` 的实际结论是**有界否定**：没有 `.dep-v0`（Devin 不是 cargo-auditable 构建），所以拿不到 crate 依赖图；只推断出 rustc commit `b940084d7eb6a299eb4bfeb8e34901bc051e7ac4`（唯一的 `/rustc/<40-hex>/` 只读路径）。

因此本文的证据分三层，每条结论都标注来源：

- **[观察·文档]** 随二进制一起发布的 `share/devin/docs/*.mdx`；
- **[观察·静态]** `.rodata` 里的字符串、`struct … with N elements` 的 serde 形状描述、以及 Rust panic 泄漏的源码路径；**未反编译，未执行目标**；
- **[观察·运行]** 宿主自己写的 `~/.local/share/devin/cli/sessions.db`；
- **[推断]** 以上三层的合理推论，本文会明说。

未解决项已写入 REA 的 residual unknown（见 §6）：`unk_de3879c…`（后端配对规则）、`unk_08ba65…`（Lead 的工具表是否真含写工具）、`unk_999a36…`（sidekick 的上下文/压缩预算）。
证据包已导出：`/tmp/devin-re/rea-evidence.json`（3 条 evidence、3 条 unknown）。

---

## 2. Devin Fusion 的机制

### 2.1 入口：`/fusion` 就是过滤版 `/model`

斜杠命令表里就一对<string,描述>（偏移 `0x8553c16`）：

```
fusion        Choose a Fusion model (same as /model fusion)
```

随包文档 `docs/fusion.mdx` 补上了选择面：**"Run `/fusion` during a session to open the Fusion model picker and choose your lead, effort, and sidekick."** 以及可以随时 `/model` 换走。

哪些模型能进这个 picker 是后端元数据决定的。模型清单条目里带一串 `cognition.ai/*` 字段（偏移 `0x85510e6`）：

```
cognition.ai/isFusion
cognition.ai/isFusionCompatible
cognition.ai/isFastSpeedVariantOf
cognition.ai/isBaseSpeedVariantOf
cognition.ai/pickerLabel  …/section  …/group  …/badge  …/tooltip  …/internalOnly
```

也就是：**"这个模型能不能当 lead / 能不能当 sidekick"不是客户端判断的**。

### 2.2 配对是会话级属性，且被持久化

session 里有一个 chisel 键（偏移 `0x85e7767`）：

```
chisel/fusion_lead_model_uid
```

对应错误文案（同一片区域）：

```
The sidekick is not available: the session is not running a paired model.
```

也就是说，一旦会话不是"配对态"，sidekick 工具就直接不可用——配对身份跟着 session 走，不跟配置文件走（`docs/reference/configuration/config-file.mdx` 里完全没有 fusion 相关键，只有 `agent.subagent_model`）。

### 2.3 sidekick 的模型是后端路由分配的

客户端会打一个 gRPC：`/exa.api_server_pb.ApiServerService/AssignModel`（偏移 `0x866fec5` 附近），请求/响应形状从字符串可以直接读出来：

```
model_uid
ModelAssignment { assignment_jwt, harness_uids }
AssignModelResponse { assignment, layout, summary_file_path? }
```

三条日志/错误文案把流程说完了：

```
Fusion lead router '<router>' assigned sidekick '<uid>'
Fusion lead router '<router>' resolved to no sidekick model
Local Fusion: sidekick model assignment failed: … the sidekick model could not be assigned. Please retry the handoff.
```

**[推断]** 用户选的是 lead + effort（+ picker 里的 sidekick），最终落地由后端按 lead 计算出一个 `ModelAssignment`（带 JWT 和 harness uid 列表）回来。客户端只信这张"票"。这也是为什么 `isFusionCompatible` 是服务端字段。

### 2.4 整个会话只有一个 sidekick，且跨 handoff 存活

工具描述原文（偏移 `0x85db1c6` 起）：

> Hand off work to your persistent Devin sidekick subagent. **There is exactly one sidekick for the whole session: its conversation context and runtime persist across handoffs**, and it runs on the same machine (shared filesystem and repos). With `block: true` (the default) the call waits and returns the sidekick's report directly, streaming progress. With `block: false` it returns immediately and the report arrives later in a subagent completion notification …

子代理 profile 的注册描述（偏移 `0x85d62e7`）：

> Persistent subagent. Keeps its conversation context across handoffs, so follow-up tasks build on what it already knows. Spawned via the dedicated `sidekick` tool.

实现层面在 `sessions.db` 的 schema 注释里写得很直接（偏移 `0x85fe58c`）：

```sql
-- Chain heads for persistent subagents (e.g. the Local Fusion sidekick),
-- keyed by deterministic agent id. A subagent's chain is its own tree in
-- the forest, unreachable from `sessions.main_chain_id`; lazy loads seed
-- their walk from these heads too.
CREATE TABLE IF NOT EXISTS subagent_heads (
    session_id TEXT, agent_id TEXT, chain_node_id INTEGER, updated_at INTEGER, …);
```

**运行记录（不是文档）**：本机 `sessions.db` 有 51 个 session、`subagent_heads` 26 行，`agent_id` 全部是 `sidekick`：

```
$ sqlite3 sessions.db "select count(*) from sessions; select agent_id,count(*) from subagent_heads group by 1;"
51
sidekick|26
```

子代理侧的元数据键（同一片 `0x85e7767` 区域）：

```
subagent/agent_id   subagent/profile_name   subagent/model   subagent/chain_node_id
```

所以 sidekick 不是"主对话里的一个角色"，而是**一棵独立的对话链**，懒加载时从 chain head 续走。

### 2.5 工具协议：`sidekick{message, block}` + `read_subagent`

serde 类型形状（偏移 `0x85ca385`）：

```
struct SidekickInput with 2 elements
struct SubagentInput with 5 elements
struct ReadSubagentInput with 3 elements
```

行为全在文案里：

| 场景 | 文案（偏移） |
|---|---|
| 第一次 handoff | `This is the sidekick's first handoff, so it starts fresh.` |
| 后续 handoff | `The sidekick is continuing from its previous context.` |
| 开始 | `#Sidekick handoff started (agent_id=…)` / `Sidekick handoff started.` |
| 后台跑 | `Sidekick is still working; handoff continues in the background.` |
| 运行中再次调用 | `The new brief was injected into the sidekick's already-running handoff.` / `Local Fusion: injected mid-handoff brief into running sidekick` |
| 注入时刚好结束 | `Local Fusion: sidekick finished during injection; brief not delivered` |
| 前台/后台切换失败 | `Local Fusion: failed to move sidekick to the background` / `… to the foreground` |
| 阻塞等待被打断 | `Local Fusion: dropped blocking wait could not restore the sidekick to the background (channel full, no runtime)` |
| spawn 失败 | `Local Fusion: sidekick spawn failed:` / `Local Fusion: sidekick spawn returned error:` |

**[推断]** `block=false` 不是"另起一个子代理"，而是把同一个 sidekick 的链**移到后台**；阻塞调用则是把它移回前台并等。这几个 `failed to move … to the background/foreground` 文案说明这里有一个显式的本地调度状态机，且它会有状态不同步的失败面。

### 2.6 角色分工写在提示词里，不在权限里

Lead 的 system prompt 有一个 `## Sidekick` 段，起点偏移 `0x85d6c5a`，**长度 10,189 字节**；到 `### Known failure patterns when delegating` 结束一共 **17,267 字节**。核心几句（偏移 `0x85d6d6b`）：

> You have a `{SIDEKICK_TOOL}` tool: a persistent subagent that works alongside you on the same machine … **You are the lead: you own the outcome and the user-facing and authority actions — talking to the user, planning, and directing the sidekick. The user interacts with one {LEAD_IDENTITY}: you.** ... **When you redirect or cancel work in flight, say what you decided, never the fact that you told someone to make it.**

必须委派：`Implementation` / `Verification & environment`（构建、lint、typecheck、测试套件）/ `{DELEGATE_EXPLORATION}`（宽泛探索）/ 环境修复。

留给自己的：`{LEAD_EXPLORATION}`、`Planning and design decisions`、`Reviewing the sidekick's diff before it lands`、`{LEAD_AUTHORITY}`（发言 / PR 创建更新 / review 回复）、以及"看起来无害但其实错了"的正确性关键工作。

sidekick 的**权威上限**（与工具描述同区，偏移 `0x85db4a5`）：

> The sidekick cannot talk to the user and **does not own commits, pushes, pull requests or CI**; user-facing and authority actions stay with you.

还有一条很硬的"绝不交接"：sidekick 看不到用户消息和 Lead 的对话，只有 brief 和它自己看到的东西——"pass along relevant user requirements, decisions, and constraints explicitly in the handoff"。

### 2.7 Lead 仍然能写，只被"提醒"

这是两边最大的哲学差异。Devin 里有一条运行时提醒（偏移 `0x85c1322` 前后的 `<system_guidance>` 块）：

> **You made a direct edit yourself instead of delegating to Sidekick.** This is a reminder that implementation and verification are to be delegated by default. **ONLY implement a step yourself if it's trivially small (1-2 turns)** … or complex rendered-browser work …

配套开关：`DEVIN_LOCAL_FUSION_NO_FIRST_EDIT_REMINDER` / `DEVIN_LOCAL_FUSION_FORCE_FIRST_EDIT_REMINDER`。

**[推断]** 这条提醒只有在 Lead 真的能编辑时才会被触发，因此 Devin 的 Lead **保留写工具**；控制手段是提示词 + 事后提醒。另一段印证同一取向：

> Fix something yourself only if it's truly one or two of your own turns including any verification (revert a churned lockfile, drop a stray import); anything that needs tests run or might cascade goes back to the sidekick as one consolidated brief.

> 该结论已记为 unknown `unk_08ba65…`：没有反编译，无法确认工具表是否真的按角色裁剪。

### 2.8 不可委派红线（brief 直接 INVALID）

同一片区域（sidekick 工具描述的尾部）定义了**一类 brief 是无效的**：

> Correctness-critical authoring is NOT delegable through this tool: **any query against a shared/production data system, any prompt/rubric/grader/eval-harness text, and any scoring/threshold/sampling/pipeline configuration must be authored by YOU before the handoff** (to a file, or verbatim in the brief). A message that asks the sidekick to write, port, adapt, rewrite, or design any of those artifacts is an INVALID brief. **Size is irrelevant: a 20-turn rubric or 200-line query is still yours to write.** The sidekick executes lead-authored artifacts and reports results; it never composes them.

配套解释在 Lead prompt 里：

> **Queries against shared/production systems … the exact query text is always yours.** This applies to read-only queries too: the risk is not mutation, **it is a wrong number delivered to the user as fact** …

还有一类显式的"不可委派实现"：渲染型浏览器工作（dashboard / 面板 / 可视化报告 / 多步 GUI 流程），理由是"computed styles 和 DOM 检查全过、屏幕上却不对"。

### 2.9 反漂移与接地

| 标签 | 内容（偏移 `0x85c1322`） |
|---|---|
| `sidekick_grounding_note` | `<system_note>Because of sidekick delegation, you may be asked about low-level details that you're unsure of. Always find the grounded answer first rather than guessing.</system_note>` |
| `report_first_guidance` | sidekick 正停在长任务 wait loop 时，若要转述结果就让它立刻回报，事后再 re-brief 恢复等待 |
| `first_message_reminder` | 首条消息的委派提醒（有 `FORCE_/NO_` 开关） |
| `first_edit_reminder` | 直接编辑后的提醒（同上） |

### 2.10 「已知失败模式」清单

这是 dsh-fusion 最该抄的一段，约 7KB，标题就是 `### Known failure patterns when delegating`：

1. **Premature implementation briefing** —— 一有想法就开始写实施简报；单干时错误假设会在过程中自然暴露，委派时 sidekick 会照着错的执行。要求"plan 依赖的每条 claim 必须已验证或显式标成假设"。
2. **把委派来的假设升格成结论** —— 报告给的是候选排序，不是结论；没有"该代码路径确实在报告场景里被执行"的证据就不能说 root cause。**"Agreement on the symptom … is never evidence for a particular mechanism."**
3. **未 settled 就委派** —— `{UNSETTLED_ASK}`：任何还需要探索/审计/用户同意的部分先自己 settle。
4. **描述而不是给代码** —— `Specify the code, don't describe it`：简报要带"确切文件 + 位置 + fenced snippet"；"Don't leave alternatives for the sidekick to pick; **it will guess, and a wrong guess costs an extra delegation round**"。
5. **用非阻塞调用做热身** —— `One blocking handoff beats a non-blocking warm-up`：别在还在调查/设计时用 `block: false` 派环境检查、baseline、脚手架。
6. **碎片化返工** —— "You tend to send the sidekick multiple small rework handoffs … **batch all feedback into a single consolidated handoff**"。
7. **Lead-only 动作被长等待压住** —— 承诺给用户的发言 / review 回复 / PR 标题描述，必须在代码 handoff 返回的那一刻就做掉，"never leave one parked behind a long blocking wait"。
8. **反重复（双向）** —— `Never make the sidekick redo work you already did`；已经交付的推导结果视为 frozen data，后续只能读它、不能重跑推导。

### 2.11 成本口径

`FusionPricing` / `FusionUsage`（偏移 `0x855e397` 起，`TokenPrices` → `FusionPricing` → `FusionUsage` 连排）：

```
struct TokenPrices with 4 elements      struct FusionPricing with 4 elements
struct TokenUsage with 4 elements       struct FusionUsage with 2 elements
leadModelUid  leadPricesUsdPerMillion  sidekickPricesUsdPerMillion
fusionUsage { pricing, tokens }
```

UI 里（偏移 `0x867469e`）：

```
Fusion Savings
Estimated by sidekick tokens at lead prices
```

也就是**一个估算口径**：把 sidekick 的 token 按 lead 的单价折算，差额即"省下的钱"。没有 priced/unpriced/incomplete 的分层。

### 2.12 每个角色有独立旋钮

| 环境变量 | 作用 |
|---|---|
| `DEVIN_SIDEKICK_PREFER_EXEC_TOOL` | sidekick 单独的 exec-vs-专用工具偏好（对应 `DEVIN_PREFER_EXEC_TOOL`） |
| `DEVIN_SIDEKICK_COMPACTION_THRESHOLDS` | sidekick 独立的压缩阈值（对应 `DEVIN_COMPACTION_THRESHOLDS`） |
| `DEVIN_HARNESS_LEAD_ONLY` / `DEVIN_HARNESS_SIDEKICK_ONLY` | 把 `--harness` 只作用于其中一个角色（两者互斥，有专门报错） |
| `DEVIN_LOCAL_FUSION_BROAD_EXPLORATION` | 切换"宽泛探索是否委派"的提示词变体 |
| `DEVIN_LOCAL_FUSION_{NO,FORCE}_FIRST_{MESSAGE,EDIT}_REMINDER` | 提醒开关/强制 |

最后一组是**线上做提示词 A/B** 的证据：提示词片段是运行时可切的，不是编译死的。

### 2.13 源码模块地图（panic 路径泄漏）

```
chisel-agent/src/local_fusion/mod.rs
chisel-agent/src/local_fusion/guidance.rs          ← 各类 <system_guidance>/<system_note>
chisel-agent/src/local_fusion/sidekick_tool.rs     ← 24 处 panic 点，:176 … :617
chisel-agent/src/local_fusion/sidekick_inheritable.rs
chisel-agent/src/local_fusion/lead_framings         ← 按模型族分叉的 Lead 提示词
chisel-agent/src/local_fusion/handoff_history      ← handoff 历史
chisel-agent/src/acp_server/agent_impl.rs          （306 处）
```

`lead_framings`（偏移 `0x85d62bd`）是复数，说明 Lead 的框架有多个变体——和 §2.12 的 A/B 开关对得上。

---

## 3. dsh-fusion 现在做到的（对齐或更强）

| Devin 的能力 | dsh-fusion 状态 | 依据 |
|---|---|---|
| 一个持久 sidekick | **对齐** | `bindings.workerId`，且 identity 不可变：`Persistent Worker identity cannot change within a Fusion selection`（`src/host/bindings.ts:73`）；`src/host/coordinator.ts:1584` 只有没有 workerId 时才新建 `fusion-worker-<uuid>` |
| 跨 handoff 继续上下文 | **对齐** | rework 继续同一个 Worker（`fusion_rework` 描述与 `src/host/coordinator.ts:2340`） |
| `block` 阻塞/非阻塞 | **对齐** | `fusion_delegate` 描述：`By default wait for its report and native checks; block=false returns while the Worker runs`（`src/host/coordinator.ts:2331`） |
| 运行中追加简报 | **对齐** | `src/host/coordinator.ts:2340`：`Active generation and native job waits can be replaced without restarting a tracked job` |
| 每角色独立模型 / 推理强度 | **对齐** | `PhysicalRoute{provider,model,reasoningEffort}`，lead/worker 各一份（`contracts/fusion.ts`） |
| 每角色独立上下文预算 | **更强** | `LEAD_DEFAULT` / `WORKER_DEFAULT`（`src/profile/resolve.ts:50,64`）：`compactToFraction` 0.5 vs 0.55、`evidenceReadTokens` 4k vs 8k、`maxToolVisibleTokens` 6k vs 8k |
| 独立压缩模型 | **对齐** | `profile.compactor` + `routeNativeCompaction`（`src/host/native-compaction.ts`） |
| 角色分离 | **更强（机制化）** | Lead 工具表被裁剪 + 沙箱只读 + 错误码 `FUSION_LEAD_READ_ONLY`（`src/host/native-role-sandbox.ts:144`、`src/host/coordinator.ts:1301`） |
| 验收 | **更强（宿主执行）** | 宿主在真实环境跑冻结命令：parser 计数、`definitionPaths` 字节冻结、`independent` 并发、`baseline: no-new-failures`、`timeoutSeconds`（`prompts/lead.md` L19–L26、`src/host/native-checks.ts`） |
| 用户硬要求逐条核对 | **更强（Devin 没有）** | `fusion_delegate` 强制 `requirements` 逐字引用（`src/host/coordinator.ts:1682`），accept 必须 `{index, met, evidence}`，另有 `literalSpansMissing` |
| 成本核算 | **更强** | `computeSavings` 分出 `basis / priced / unpriced / incomplete / unknown`（`src/usage/cost.ts`、`src/host/status.ts:161`）；Devin 只有一个"按 lead 价折算"的估算 |
| 并发/恢复/证据 | **更强** | recovery gate、`reconcile`、store migration、outbox、changeManifest 带前后内容（`src/host/change-evidence.ts`） |

**关键结构性优势**：Devin 的验收是 sidekick 自己跑、自己写在报告里，Lead 只能"审它交回来的产物"（原文：`Its prose is a claim, the artifacts are the evidence`）。dsh-fusion 把验收搬到宿主，报告和检查结果物理分离——这正是它不需要 Devin 那么多"review 纪律"提示词的原因。

---

## 4. 差距与缺陷

### G1（高）没有权威动作分界：Worker 可以 commit / push

**Devin**（偏移 `0x85db4a5`）：

> The sidekick **cannot talk to the user and does not own commits, pushes, pull requests or CI**; user-facing and authority actions stay with you.

Lead prompt 里把"PR 创建/更新、review 回复"归到 `{LEAD_AUTHORITY}`，并要求"code-review 回复的代码改动批量交给 sidekick（implement + verify + **push to the branch**）"——注意这里 push 是 Lead 授权后才做的动作。

**dsh-fusion 现状**：

- `prompts/worker.md` 通篇没有 commit/push/PR 的约束；`prompts/lead.md`、`prompts/model-lead.md` 也没有。
- 全仓 `grep -rn "commit\|push"` 在 `prompts/` 里 **0 命中**；`src/` 里唯一的 `git` 调用是 `git -C <root> ls-files`（`src/host/workspace.ts:68`，用于工作区快照）。
- Worker 拿到的是用户选定的沙箱模式 + 完整 shell，写租约期间可以在 `allowedPaths` 之外的**仓库级**动作上动手（`git commit`、`git push`、`git rebase` 不受 `allowedPaths` 约束，那是文件路径白名单，不是 git 权限）。

**影响**：一次委派就可能把改动推上远端或改写历史，而 Lead 的 accept 发生在事后。这与 dsh-fusion 自己的定位（"Lead 拥有最终验收"）直接冲突：`changeManifest` 用的是**委派时的文件字节快照**（`src/host/change-evidence.ts` 的 `ChangeBase.contents`），不是 git HEAD，所以 diff 证据不会因为 commit 而失效——**恰恰因为不失灵，push 出去才会毫无痕迹**。

**建议**：在 `worker.md` 加一条硬约束（"不得 commit / push / 建 PR；需要时在报告里提出"），并在宿主侧对 Worker 的 shell 命令做**名称级拦截**（`git commit|push|tag|reset --hard|rebase` → `FUSION_WORKER_GIT_DENIED`），与 `FUSION_LEAD_READ_ONLY` 同级。提示词一条、拦截一条，缺一不可。

### G2（高）常驻进程不能跨 handoff

**Devin**（偏移 `0x85d6d6b` 之后的第 3 个 bullet）：

> The same goes for its runtime state: **background shells and processes it started (dev servers, DB connections, in-flight long-running commands) usually survive between handoffs.** Every brief that involves servers or long-running processes must include one line on runtime state — e.g. "the server from the previous handoff may still be running; check and reuse it, restart only if it's gone or the code changed" — and, when a later handoff may need them, **tell it to leave those processes running at the end instead of tearing them down.** Restarting a still-live server or re-running an in-flight long command from scratch wastes the whole wait.

**dsh-fusion 现状**：

- `prompts/worker.md` L19 的方向相反：**"所有命令收尾后才能提交报告。"**
- 后台 job 在结算前占着写租约（`src/host/native-effects.ts` 注释：`the job must own the write lease until it settles`）。
- `#stopJobs(taskId) → effects.stopJobs(taskId)` 在暂停（`coordinator.ts:2092`）、接管（`2260`）、恢复（`2150`）、宿主运行期被替换（`2379`）、更换 Worker（`1661`）时都会终止该任务的本地 job。

**影响**：`改代码 → 起服务 → 看一眼` 这类循环，每轮都要重起服务、重跑迁移、重连 DB；长任务（构建、e2e）在 handoff 边界上被丢弃或被迫串行到报告之前。这也解释了 README 里那个 **"耗时约为 Devin 的 3.4 倍"** 的观察——至少是一部分原因，而且是可测的。

**建议**：把"工作单结束时是否保留后台进程"变成工作单字段（如 `keepRuntime: boolean`），允许在 `keepRuntime` 为真时不要求命令收尾、并把租约从"持有到 job 结束"改成"持有到报告 + 显式 runtime state 记录"；brief 里自动注入上一单的 runtime state（job id、端口、启动命令）。

### G3（高）没有"不可委派"的红线

**Devin** 有明确的 INVALID brief 定义（§2.8）：共享/生产数据系统的查询原文、prompt/rubric/grader/eval-harness 文本、scoring/threshold/sampling/pipeline 配置，**size is irrelevant**。

**dsh-fusion 现状**：`prompts/lead.md` L13 只说"简报写必须成立什么，不替 Worker 逐行写实现"；没有"哪些东西必须你亲自写"。全仓 `grep` 不到同类约束。

**影响**：Fusion 的价值主张是"前沿模型的判断 + 便宜模型的执行"。而"看起来合理却错"的输出（一个少 join 了表的指标、一个把 sampled 当 full 的评测脚本）恰恰是**判断本身**，不是执行。把它委派出去，省下的钱是拿正确性换的，而验收命令（单测）通常抓不到这类错——`baseline: no-new-failures` 也抓不到。

**建议**：在 `lead.md` 增加一节「不可委派（brief 直接无效）」，措辞照 Devin 会比自己发明更保险；并在 `fusion_delegate` 的 `requirements` 之外加一个可选的 `leadAuthored: {path, digest}[]`——把"这份 rubric/query 是我写的"变成可核对的证据，而不是模型自律。

### G4（中）简报措辞与 Devin 的实测结论相反

**Devin**（偏移 `0x85d9d38`）：

> **Specify the code, don't describe it.** The sidekick is there to implement your decisions, not to make them: once you have settled an edit, the brief carries it as code — **the exact file and location plus a fenced snippet of the new or replaced lines** (signature, body, test case, docstring) — rather than a sentence about it. … This doesn't move the work to you: the sidekick still does the reading, editing, running, and fixing; you supply the shape so it doesn't have to guess it.

它自己也给了反面理由：`Don't leave alternatives for the sidekick to pick; it will guess, and a wrong guess costs an extra delegation round.`

**dsh-fusion**：`prompts/lead.md` L13 —— **"简报写"必须成立什么"，不替 Worker 逐行写实现"**。

这两句其实不必然矛盾（"给 snippet" ≠ "替它写整个实现"），但中文这句读起来是**禁止给代码**。在一个按 token 计价的产品里，这个措辞偏差的代价是"多一轮返工"——正好是 Devin 点名的那一类失败。

**建议**：改成"简报写'必须成立什么'；一旦你已定下这个具体的编辑，就把确切文件、位置和 fenced snippet 一起给出去——给形状不等于替它写实现"。并补一句 Devin 的判据：**"不要让 Worker 在几个方案里挑。"**

### G5（中）缺"委派失败模式"清单和反重复规则

Devin 有 §2.10 那 8 条，约 7KB。dsh-fusion 的 `lead.md` 只有零散的"先看结果再看 diff"、"按风险审查"。**`grep` 不到**的具体缺失：

- **反重复（双向）**：`Never make the sidekick redo work you already did`；已交付的推导结果视为 frozen data。dsh-fusion 只有"不把 Worker 的原始日志塞进你的历史"（`lead.md` L38），这是省 token，不是防重复。
- **一条阻塞 > 非阻塞热身**（`One blocking handoff beats a non-blocking warm-up`）。
- **Lead-only 动作不要被长等待压住**。
- **"把委派来的候选排序当结论"** 这条在本项目特别相关，因为 `fusion_explore` 的报告会直接进 Lead 的规划。
- **提前写实施简报**（plan 依赖的 claim 必须已验证或标成假设）。

**建议**：把 `prompts/lead.md` 的 L13/L34 之间插一节「委派常见失败」，逐条照抄并本地化（尤其"假设 → 结论"和"方案留给 Worker 猜"这两条，和本项目现有的证据/审查体系能直接咬合）。

### G6（中）配对没有经济性/兼容性校验

**Devin**：`isFusion` / `isFusionCompatible` + 后端 `AssignModel`，配对不合法在选之前就被挡住；picker 里还有 `sectionTooltip` / `groupBadge` 解释为什么。

**dsh-fusion**：`validatePairChoice`（`src/host/settings.ts:51`）只校验三件事——role 必须选、模型此刻存在、`reasoningEffort` 该模型支持。**没有**价差检查、没有"lead 应强于 worker"检查、没有"这个组合历史上不省钱"的提示。

**证据（本仓库自己的数据）**：README 的实测表里 `GPT-6 Astra + Grok 4.6` 是 13/18 但 **$41.27（不省钱）**，而 `Astra + GLM-5.3-Flash` 是 11/18 / $18.07。也就是说存在"选得出、但产品承诺（更便宜）不成立"的组合，UI 只会说"建议 5 倍价差"。

**建议**：在 `validatePairChoice` 之后加一个**警告级**（不是拒绝级）检查：用 `src/usage/price-cards.ts` 的价目算 `leadPrice / workerPrice`，低于阈值时在设置页和 `fusion_delegate` 的第一次调用上提示"这个组合可能不省钱"；并把 `computeSavings` 的 `savedPercent` 做成会话内的可见信号，而不是只在统计里。

### G7（低-中）用户中途插话没有显式策略

**Devin**：

> **A user message that arrives while a handoff is in flight is yours to act on before you do anything else** … judge what it means for the work the sidekick is doing right now, and act on that judgment — handle lead-only work yourself in that same turn, and for anything that concerns the running handoff, **call `{SIDEKICK_TOOL}` again with a new `message`: it is injected into the running handoff as an interrupt** … **Waiting out a brief the user has already moved past wastes the whole handoff.**

**dsh-fusion**：机制上支持（`fusion_rework` 可在 Worker 运行时追加简报），但 `prompts/lead.md` 与 `model-lead.md` 里都没有这条策略。只有 `coordinator.ts:1982` 里有一处 inbox 判断（`!agent.inbox.nextStep.some(message => message.source.kind === 'user')`）属于宿主调度，不是给 Lead 的行为指导。

**影响**：用户中途改主意时，Lead 最可能的默认行为是"等这一轮跑完再说"——正是 Devin 点名的浪费。

**建议**：`lead.md` 的"委派"一节加一段，明确"用户在 Worker 运行时说的话优先处理；要改方向就立即 `fusion_rework` 追加，不要等它跑完"。

### G8（低）没有运行期的行为纠偏（可选）

Devin 在 Lead 真的自己动手时注入 `first_edit_reminder`。dsh-fusion 用更硬的手段（工具表 + `FUSION_LEAD_READ_ONLY`），所以**不需要**这条。但剩下两类漂移没有对应物：

- Lead 草率 `fusion_finish_direct` 收尾（`coordinator.ts:488` 只在"有被拒效果"时插入指令）；
- Lead 反复碎片化 rework 而不批量反馈（`lead.md` L38 只有"不要每轮重新创建执行者"）。

**建议**（低成本）：对同一 work order 的 rework 轮次计数，超过阈值时在 Lead 的下一轮注入一句"合并你的反馈"；这不需要新机制，`runtime` 记录里已经有 `reworkRounds`。

---

## 5. 建议的最小改动（按性价比排序）

1. **`prompts/worker.md` 加 git 权威约束 + 宿主名称级拦截**（G1）。这版就能上，风险最低，堵的是最不可逆的一类。
2. **`prompts/lead.md` 加「不可委派」+「委派常见失败」两节**（G3、G4、G5 的提示词部分）。纯文本改动，`prompts/*.md` 是运行时读盘，不用重新 build。
3. **`prompts/lead.md` 加"用户中途插话优先"一段**（G7）。一行。
4. **工作单加 `keepRuntime` + runtime state 注入**（G2）。这条要动 `contracts/fusion.ts`、`native-effects.ts` 的租约语义和 brief 生成，属于真设计改动——但它是 README 里"耗时 3.4 倍"最可能的结构性来源。
5. **配对的经济性警告**（G6）。读 `price-cards.ts` 即可，不必新增数据。

---

## 6. 未解决项与复现

### REA residual unknowns

| id | 问题 |
|---|---|
| `unk_de3879c57c7e297adfa056f9999b5b571b303a34da474e7c74879c8d14532bb5` | 后端如何决定配对（`AssignModel` / `assignment_jwt` / `isFusionCompatible`），客户端是否本地复核 |
| `unk_08ba6543f931de27ac60836461bc0862be79ea2b8026cc087fbe8d34880b28bb` | Lead 的请求工具表是否真的含写工具（决定 §2.7 是"提示词约束"还是"工具表约束"） |
| `unk_999a361acc291f1c6e3ec59d3b9ef857867991cb91c75f67a907e88fb73295ba` | sidekick 的上下文/压缩预算（`DEVIN_SIDEKICK_COMPACTION_THRESHOLDS` 默认值）与首轮 handoff 共享多少 Lead 对话 |

证据包：`/tmp/devin-re/rea-evidence.json`（3 条 evidence + 3 条 unknown）。

### 复现命令

```bash
B=/home/zlw/.local/share/devin/cli/_versions/current/bin/devin

# 1) 身份与打包方式
sha256sum "$B"; file "$B"; readelf -S "$B" | grep -E '\.text|\.rodata'

# 2) 按文件偏移取一段上下文（保留换行，非可打印字节替换为空格）
python3 - "$B" <<'PY'
import sys
d=open(sys.argv[1],'rb').read()
s,e=0x85d6c5a,0x85db0c0          # ## Sidekick 段
out=[]
for b in d[s:e]:
    out.append('\n' if b==10 else (chr(b) if 32<=b<127 else ' '))
print(''.join(out))
PY

# 3) 索引式检索：先建字符串表，再按偏移定位
strings -n 4 "$B" > /tmp/devin-re/strings.txt
grep -n 'sidekick' /tmp/devin-re/strings.txt | cut -c1-200 | head

# 4) 运行记录：持久 sidekick 的 chain head
sqlite3 ~/.local/share/devin/cli/sessions.db \
  "select count(*) from sessions;
   select agent_id, count(*) from subagent_heads group by 1;
   select session_id, agent_id, chain_node_id from subagent_heads limit 5;"
```

### 关键偏移索引

| 偏移 | 内容 |
|---|---|
| `0x8553c16` | `/fusion` 命令描述 |
| `0x85510e6` | `cognition.ai/isFusionCompatible` 等模型元数据 |
| `0x866fec5` | `Fusion lead router … assigned sidekick …` / `AssignModel` |
| `0x855e397` | serde 形状：`TokenPrices` / `FusionPricing` / `FusionUsage` |
| `0x85c1322` | "The sidekick is available for delegating mechanical work…" + `sidekick_grounding_note` |
| `0x85c8692` | `local_fusion/sidekick_inheritable.rs` |
| `0x85ca385` | `struct SidekickInput with 2 elements`（工具输入形状） |
| `0x85d6c5a` | `## Sidekick` 段起点（10,189 字节，到 `### Known failure patterns` 共 17,267 字节） |
| `0x85d9d38` | "Specify the code, don't describe it" |
| `0x85db1c6` | "There is exactly one sidekick for the whole session…" |
| `0x85db4a5` | "does not own commits, pushes, pull requests or CI" |
| `0x85e7767` | `chisel/fusion_lead_model_uid` + 配对错误文案 |
| `0x85fe58c` | `subagent_heads` schema 注释 |
| `0x8553908` | `DEVIN_SIDEKICK_COMPACTION_THRESHOLDS` 等开关 |
| `0x85ca606` | `DEVIN_LOCAL_FUSION_*` A/B 开关 |
| `0x867469e` | `Fusion Savings` / `Estimated by sidekick tokens at lead prices` |

---

## 7. 效率侧证据：为什么 Devin 更快，以及本仓库的实测差距

§2 讲的是"Devin 怎么分工"，这一节讲它**为什么同样正确率下更快**。证据有三层：Devin 提示词里的工程规则、本仓库自己的 SWE-rebench 对照数据、以及一次真实会话的链级计数。

### 7.1 Devin 提示词里的三条效率规则（静态提取）

| 规则 | 原文（偏移见 §6） | 作用 |
|---|---|---|
| **校验防抖** | `Known failure pattern: Performing checks (e.g. verification runs and git status/diff inspections) prematurely or too frequently—especially when repeatedly inserted between small related edits—creates unnecessary tool calls and delays. While you still have edits planned … keep editing: do not run tests, lint, typecheck, builds, or other verification commands or read-only git checks between edits. Verify once: after your last planned edit, run one consolidated pass covering all your changes.` | 一次任务只付一次验证成本 |
| **不做重复检查** | `Never re-run a verification command (e.g. tests, lint, typecheck, format check, build, git status/diff) whose inputs have not meaningfully changed.` | 去掉"求安心"式重跑 |
| **批量返工** | `You tend to send the sidekick multiple small rework handoffs after its initial pass, which slows down task completion. Instead, review the full output YOURSELF, then batch all feedback — defects, incomplete items, and other gaps — into a single consolidated handoff.` | 每个任务少 1–2 轮交接 |

另外 `## Parallel tool calls` 段（`core/parallel-tool-calls`）要求"下一次要什么先私下列清，然后把互不依赖的调用放进同一个响应"，并明确"同一条响应里的调用按顺序执行，所以编辑和验证它们的检查放在一起"。

### 7.2 本仓库的实测差距（`benchmark/rebench/results-devin-r1`）

四个在所有条件下都干净的 SWE-rebench 任务（n=1/格，方向性观测，不是排行榜）：

| 条件 | resolved | 费用 | 平均耗时 | Sidekick 调用 | fresh-input 占比 |
|---|---|---|---|---|---|
| **S_F — dsh-fusion** | **4/4** | **$2.73** | 20.1 min | 基准 ×1 | 5.1% |
| D_F — Devin Fusion | 3/4 | $4.81 | **6.0 min** | 基准 ÷4.4 | 18.8% |
| D_X — Devin 单模型 | 3/4 | $8.13 | 5.1 min | — | — |
| S_X — dsh-fusion 单模型 | 3/4 | $10.11 | 5.8 min | — | — |

三个可直接读出的结论：

1. **正确率不落后**（4/4，且解掉了其他条件都没解的 `sqlfluff-7615`），**成本更低**（比 Devin Fusion 低 43%）。
2. **耗时 3.4×、调用 4.4×** —— 差距几乎全在 Worker 的执行节奏上，不在 Lead 的推理上。
3. **缓存命中已是优势**（fresh-input 5.1% vs 18.8%），所以"减少 token"不是主要空间，"减少轮次"才是。

### 7.3 一次真实会话的链级计数（`sessions.db`，`super-garlic`）

同一个 Lead/Sidekick 会话里：Lead 链 116 个节点、57 次工具调用；Sidekick 链 638 个节点、**330 次工具调用**（`exec` 262、`read` 35、`get_output` 30）。也就是说付出代价的是执行侧，而且高度集中在 shell 往返上。这与 §7.1 三条规则的针对性一致：防抖、去重跑、批量化，直接打在这 330 次上。

### 7.4 A/B 协议（改 Prompt 之前先钉住的口径）

任何优化都要用同一口径复测，避免"看起来更快"：

- **固定**：任务集与基提交、模型对与 reasoning effort、历史/上下文策略、验收命令、评分器、每格独立工作树。
- **记录**：resolved、wall time、Lead/Worker 请求数、Worker 工具调用数、多命令 shell 调用数、rework 轮数、input/cache-read/output token、费用、越权与污染计数。
- **重复**：≥3 次/格（预算允许 5 次），报中位数与原始值，不用单次最优。
- **硬门槛**：resolved 不低于基线；不新增污染、越权写入、未验证的成功声明。
- **效率门槛**：Worker 工具调用中位数 −30%、wall time −25%、费用 −15%、rework 轮数不增加。
- **归因**：Prompt 变化与宿主安全改动分两个提交、两组条件测，避免混淆。

---

## 8. 本分支实现了什么（2026-11-10）

### 8.1 G1：权威动作由宿主强制

- 新增 `src/host/authority.ts`：把 shell 文本切成命令段，识别 `git commit/push`、创建 tag、`gh pr|release|workflow`、`npm|pnpm|yarn|bun|cargo|poetry publish`、`twine upload`、`goreleaser`。看穿常见启动器（`sudo/env/xargs/time/nice/nohup/stdbuf/command/exec`）、`VAR=value` 前缀、`git -C <dir>` 这类带值全局参数，并**递归检查** `bash -c "…"`、`sh -c '…'` 与 `$(…)`；引号里的字面文本（`grep -r 'git push' docs`）不算命令。
- `src/host/coordinator.ts` 在 Worker 的 shell 调用上返回 `FUSION_WORKER_AUTHORITY_DENIED`，并说明"改完代码、报告里写明待办"。
- 工作单新增可选 `authority: AuthorityAction[]`（`contracts/fusion.ts` + `src/contracts.ts`）：只有 Lead 在 `fusion_delegate` 里显式授权的动作才放行，且**冻结进工作单**，返工不能扩权；未授权时 `forbiddenActions` 里写明这条禁令。
- 边界（明确不声称）：这是命令文本守卫，不是沙箱。运行时拼接命令（`python -c`、脚本从 stdin 读）超出文本可见范围，因此 Worker 提示词同时写死规则；`run_code` 等非 shell 工具不在本次拦截范围。

### 8.2 G3/G4/G5/G7：提示词

- `prompts/lead.md`、`prompts/model-lead.md`：简报从"只写必须成立什么"改为"给形状、不给选项"（fenced snippet + 不让 Worker 在方案间挑 + 疑点先自己 settle）；新增「权威动作与不可委派」一节；审查改为"整轮看完再一次性返工"；补上"用户在交接中途改主意时立刻 `fusion_rework`"。
- `prompts/worker.md`、`prompts/model-worker.md`：新增发布边界（含 `FUSION_WORKER_AUTHORITY_DENIED` 与"报告为待办"）与校验防抖（编辑期间不跑 status/diff/lint/测试，收尾一次最窄验证，不重跑输入未变的命令）。

### 8.3 验证

- `tests/authority.spec.ts`（7 例）：只读命令放行、七类动作识别、启动器/赋值/分段/嵌套 shell/替换、引号数据不误伤、授权只放行被授权项。
- `native-tests/coordinator.spec.ts`「Sidekick authority boundary」（2 例）：未授权 commit/push 被拒且工作单仍能完成；被授权动作照常执行。
- `tests/prompts.spec.ts`（7 例）：四份提示词的关键规则（权威边界、不可委派、fenced snippet、批量返工、防抖、中途插话）在两个语言变体里都存在。

### 8.4 未做 / 未声称

- **G2（常驻进程跨 handoff）**：见 §9——实测确认在插件层不可达（Host 的 job 绑定 owner Agent 的 scope，Worker 交接结束即销毁）。已交付有界版本：不阻塞报告、记录身份与用途、下次简报明确告知，而不是假装进程还活着。
- **没有跑新的 A/B**：§7.4 的协议与门槛已固定，但本轮没有新模型调用，所以"这次提示词改动让调用数下降 X%"没有被测量，不能这样声称。
- `authority` 授权依赖 Lead 自觉只在用户要求时使用；宿主不解析用户原话来判断"用户是否真的要求 push"，这是有意的边界（避免关键词误判）。

---

## 9. 阶段 3：常驻进程跨 handoff —— 实测为什么做不到，以及做到了什么

计划里 G2 的目标是让 dev server / watcher 跨 Worker handoff 存活（Devin 的 `runtime persist across handoffs`）。实现并测量之后，结论是：**插件层做不到，卡点不在本仓库**。这一节记录证据，因为它决定了后续该往哪儿改。

### 9.1 结论

Host 的 job（`ctx.jobs`）**绑定 owner Agent 的 scope 生命周期**，而不是绑定任务。Worker 的后台命令以 `owner: exec.agent.id` 注册（`tool-bash` 的 `startJob`），而 Worker 子代理在 handoff 结束时被销毁，它的 scope 一 dispose，`jobs-local` 就把该 owner 名下所有仍活着的 job 一起取消：

```
jobs-local/src/index.ts:647   owner.ctx.effect(() => async () => {
                                this.ownerCleanups.delete(owner); await this.disposeOwned(owner) })
jobs-local/src/index.ts:655   private async disposeOwned(owner) {
                                const owned = [...this.store.values()].filter(job => job.owner === owner)
                                this.cancelForTeardown(owned, 'owner disposed')
```

所以「保留进程」不是"少杀一次"的问题：进程的生存期和"谁拥有它"是同一个事实。要让 dev server 跨 handoff 活着，只能换掉 owner（或换成无 owner 的 Host 自有进程），而这需要另起一条进程启动路径。

### 9.2 实测证据（本分支的临时实现 + 探针）

按计划实现了 `WorkOrder.preserveRuntime`、Worker 工具 `fusion_declare_runtime`、`NativeEffects.retain()`（把 journal 行从 `dispatch-started` 改成 `retained`，因此不再是 pending、不阻塞报告），以及 `runtime-handle` 文档。实测：

| 观察 | 值 |
|---|---|
| `fusion_declare_runtime` 返回 | `{"status":"runtime-declared","jobId":"bash-…","deadlineAt":…}`（声明成功） |
| 随后 `#settled` 收到的 job 快照 | `status: killed`, `detail: "signal: SIGTERM"` |
| 触发者 | `coordinator.#stopJobs` 的调试日志**没有**触发 → 不是 Fusion 杀的 |
| Lead 发 rework 时的子代理 | `ctx.agents.get(acceptedChild)` → `undefined`（已销毁），`#retainedNote` 因此读到 0 个存活 runtime |
| 任务结束时 job 查询 | `ctx.jobs.get(id)` 抛 `unknown job`（已被 owner 清理 drop 掉） |

旁证：仓库里原本就有一个通过的产品级用例，标题即 **"native cancellation of a blocking handoff stops the Worker job with no replay"** —— 交接边界上停掉 Worker 的 job 是既定行为，不是缺陷。

### 9.3 因此保留了哪些、放弃了哪些

**保留（有独立价值，且不依赖跨 handoff 存活）**

- `WorkOrder.preserveRuntime`（`contracts/fusion.ts`、`src/contracts.ts`）+ `fusion_delegate` 的参数：**允许 Worker 带着仍在跑的后台进程提交报告**，而不是先 `job_kill` 再报告。这在同一次 handoff 内消掉一次"停掉再重起"的循环。
- `fusion_declare_runtime`（只发给 Worker，不进入 Lead 的固定工具目录，因此不改变 Lead 的 prompt 缓存前缀）：校验 job 属于本任务与本 Agent、仍在运行；记录 `purpose`、命令**摘要**（不是命令原文，可能含 token）、`cwd`、上限寿命。
- `NativeEffects.retain()` 把 journal 行改成 `retained`：不阻塞提交，但保留 `processId` / `startedAt` 身份，**新 Host 永不认领**。死掉的旧 Host 留下的 `retained` 行会进 `strandedRetained()`，install 时的恢复扫描据此记录 `recovery/needed`，`assertInspection` 要求用户先停掉那个进程（按 PID 存活探测）才能恢复。这是计划第 4 条"Host 恢复后必须验证进程身份"的落地。
- `runtime-handle:<taskId>:<jobId>` 文档：下一个 handoff 的简报会写明"上一轮声明过什么进程、现在是什么状态"，把"悄悄被杀掉"变成"明确告诉我它没了，要不要重起"。`#retainedNote` 生成这段文本，`delegate`/`rework` 都会注入。
- 清理：任务完成（accept）、暂停、接管、检查、Host 关闭都经 `#stopJobs` 杀掉声明过的进程；未声明的进程仍然阻塞提交（错误文案会直接点名 `fusion_declare_runtime`）。

**放弃（并说明为什么不在本仓库解决）**

- 进程跨 handoff 真正存活。两条可行路线，都需要 Host 侧契约：
  1. **job 所有权转移**：`JobRegistry.start()` 之外再加一个 reassign/不动 owner 的"延期 drop"语义；
  2. **Host 自有启动器**：Fusion 用 `ctx.shell.resolve()/execute()` 自己起进程（无 owner 或 owner=Lead），再暴露一个读输出的工具给 Worker。这条会在插件里开出**第二条进程启动路径**，绕过 `tool-bash` 的审批与按会话 sandbox 模式；本仓库的原则是"插件永不放宽 mode"（`native-role-sandbox.ts`），所以不做半成品。
- 因此 §8.4 里"G2 未实现"升级为"G2 在插件层不可达"。

### 9.4 验证

- 单测：`tests/authority.spec.ts`（7）、`tests/prompts.spec.ts`（7）不变。
- Host：`native-tests/coordinator.spec.ts` 新增 `retained runtime across handoffs` 两条：
  - **declared**：后台 job 在跑 → 声明 → 报告落库（`phase: COMPLETED`，未被 pending 阻塞）→ journal 有 `retained.purpose`/`deadlineAt` → `runtime-handle` 有 `commandDigest` 且状态 `ended` → 下一次 Worker 请求里出现 "Processes the previous handoff declared" 与该 purpose → 结束时 job 已不在运行；
  - **undeclared**：未开 `preserveRuntime` 时报告被拒，文案点名 `fusion_declare_runtime` 或"先收尾"。
- 全量：`pnpm test` 503/503；`pnpm test:host` 282 通过 / 1 跳过（仅 Windows ACL）。
