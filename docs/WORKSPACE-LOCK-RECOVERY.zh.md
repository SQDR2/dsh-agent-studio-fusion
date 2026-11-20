# 工作区写租约的回收（Workspace Lease Recovery）

> 状态：已实施（1.5.1）
> 日期：2026-11-20
> 证据场次：`session-20b3fa52-3af8-4484-8e55-4f9c0679e63b`（写租约持有者随 Host 进程消失）、
> `session-11691513-60d2-4820-bbc3-0a7e5b82d1ef`（下一个会话的 `fusion_delegate` 被同一份租约拒绝）

## 1. 一句话结论

写租约是**持久锁**，但它的持有者是一个**会消失的进程**。记录还在、进程没了，这把锁就再也
没人能解开：之后每个会话在这个工作区的第一次写入都会被拒，工长审查连派发的机会都没有。

## 2. 一次真实失败的账

| 项 | 数值 |
| --- | --- |
| 租约获取 | 2026-11-19T08:22:12Z，持有者 `session-20b3fa52`，pid 775175 |
| Host 进程结局 | pid 775175 已不存在（非优雅退出，未走到 `#release`） |
| 该任务未收尾的原生操作 | 0（46 条 `native-effect` 全部 `returned`） |
| 之后 | 新 Host（pid 1927305）启动；`session-11691513` 的 `fusion_delegate` 返回
  `workspace is held by session-20b3fa52; reconcile before handoff` |
| 结果 | 任务没有 work order、没有派工、没有工长审查；用户只看到"工作区被占用" |

第二个缺陷让这次失败**不可重试**：`#acquire` 在 `work-order/prepared` 之后调用。租约被拒时，
订单已经落账、outbox 已有 `prepared` 行，而没有任何 Worker 拥有它。于是后续每次
`fusion_delegate` 都答 "A Worker already owns this task"，工作区就算空出来也回不去了。

## 3. 现在的语义

| 情形 | 行为 |
| --- | --- |
| 记录里的进程还活着（同一进程世代） | 拒绝，报文中带上持有者、pid 与获取时间 |
| 记录里的进程已消失 | 启动对账释放；或下一次 `#acquire` 用 CAS 接管，并写 `lease/reclaimed` |
| 记录里的进程已消失，但它启动的命令还没收尾 | **不释放**。任务仍需人工 `/fusion recover` |
| pid 被内核复用给新进程 | 按"已消失"处理（见第 4 节） |
| 记录在检查与接管之间被别的进程改过 | CAS 失败，保持拒绝 |
| 同一进程（HMR 换 coordinator） | 视为活着，不受影响 |

释放或接管都会留在账本里：启动对账写 `lease/released`，运行中接管写 `lease/reclaimed`
（含 `priorHolder` / `priorOwner` / `priorPid` / `basis`），紧接着是新的 `lease/acquired`。

## 4. 为什么"pid 死了"不再等于"可以直接抢"

pid 只是内核复用的编号，不是身份。旧实现只做 `kill(pid, 0)`：

- 记录里的 pid 被别的进程占用 → 永远判定"还活着"，工作区永久卡死；
- 反过来，只看 pid 也证明不了旧进程启动的命令已经停下。

现在记录里多存一个 `ownerStartedAt`（Linux 读 `/proc/<pid>/stat` 的 starttime + `/proc/stat btime`），
存活判断是"同一 pid **且** 同一启动时刻"。没有这个字段的旧记录按单向规则判断：如果当前占用该
pid 的进程启动得比租约写入时间还晚，它不可能是写者。反过来（写者可能就在其中）一律当作还活着。

即便写者确实消失，只要它所属的任务还有未收尾的原生操作（`dispatch-started` / `outcome-unknown` /
残留的 retained runtime），租约也不释放——那条命令的进程可能还在写。此时仍然只有人工核对能开锁。

## 5. 改动点

- `src/execution/write-lease.ts`：新增 `processIncarnation()`、`alive()`、`reclaim()`（CAS）；
  `acquire()` 记录 `ownerStartedAt`；拒绝文案带上持有者、pid 与获取时间。
- `src/host/coordinator.ts`：
  - `#abandonedLease()` 把"进程消失"与"没有未收尾操作"合成一个判断；
  - `#acquire()` 在 `LEASE_BUSY` 时对该记录尝试接管，成功后写 `lease/reclaimed` 并 `warn` 一行日志；
  - 启动对账对每个绑定释放被遗弃的租约，并把这种租约从"需要恢复"的证据里剔除，让没有任何其他
    遗留物的任务自动解开恢复闸门（`#healStaleRecovery`）；
  - `reconcile()` 改用同一套存活判断，pid 复用不再让 `/fusion recover` 永远失败；
  - `delegate()` 把 `#acquire` 移到 `work-order/prepared` **之前**，被拒时不再留订单；直接接管
    （`directHandoff`）的 Lead 在被拒后重新取回自己的租约。
- `src/contracts.ts`、`contracts/fusion.ts`、`src/task/reducer.ts`：新增 `lease/reclaimed` 事件。

## 6. 验证

- `pnpm typecheck`
- `pnpm exec vitest run` → 864 通过（`tests/lease.spec.ts` 新增 4 例：接管已死写者、写者仍存活时拒绝、
  写者消失但记录了仍存活的进程时拒绝、pid 复用与旧记录的单向判断、CAS 冲突）。
- `DSHX_HARNESS=… pnpm test:host` → 336 通过 / 1 跳过，其中新增 2 例：
  - 写者仍存活：`fusion_delegate` 报出持有者，且**没有**落下 `work-order/prepared`；
  - 写者已消失：同一个任务接管成功（`lease/reclaimed`，generation 7 → 8）并走完派工与验收。

未验证：没有在真实重启中跑过整个流程（本机修复要等下一次 Host 启动）；Windows 上没有
`/proc`，存活判断退化为 `kill(pid, 0)`，旧记录的 pid 复用仍可能误判为存活。
