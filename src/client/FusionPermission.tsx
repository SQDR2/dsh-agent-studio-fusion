import { useEffect, useSyncExternalStore } from 'react'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { PermissionIconFullAccessRegular, PermissionIconReadOnlyRegular,
  PermissionIconWorkspaceWriteRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Role, SandboxMode } from '../contracts.js'
import { tr, useLang, type Lang } from './i18n.js'
import { useFusionStatus } from './status-polling.js'
import { catalogModelName } from './model-label.js'

const styles = `
.fusion-permission{display:inline-flex;align-items:center;gap:4px;height:28px;min-width:0;max-width:260px;padding:0 6px;border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;font-weight:500}
.fusion-permission svg{width:14px;height:14px;flex:none}
.fusion-permission .fusion-permission-role{flex:none;color:var(--dsw-alias-label-caption)}
.fusion-permission .fusion-permission-model{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-caption)}
.fusion-permission .fusion-permission-mode{flex:none}
`

const modeOf = (lang: Lang, mode: SandboxMode) => mode === 'read-only' ? tr(lang, '仅可查看', 'Read Only')
  : mode === 'workspace-write' ? tr(lang, '工作区内修改', 'Workspace Write') : tr(lang, '完全权限', 'Full access')
const iconOf = (mode: SandboxMode) => mode === 'read-only' ? <PermissionIconReadOnlyRegular />
  : mode === 'workspace-write' ? <PermissionIconWorkspaceWriteRegular /> : <PermissionIconFullAccessRegular />

export interface FusionPermissionProps { sessionId: string; directory: ObservableSnapshot<ModelDirectoryState>; load(): void }

/**
 * The role, model and permission of the work happening now.
 *
 * Additive: the composer's native permission control keeps its slot, its state and its own
 * meaning. That control follows the conversation (Lead) session, which Fusion confines to
 * read-only, and the confinement matches no configured preset — so it reads Custom while a
 * task runs. This chip names the role, its model and its mode, so the tool row never shows
 * an unexplained Custom alone.
 *
 * Visibility follows the durable task, never the composer's current selection. While a turn
 * runs, Fusion pins the pair's physical route as the recorded `model/selection`, so the
 * native selection is the Lead's route — reading it as "not Fusion" hid this chip for the
 * whole pinned turn, which is exactly when it is wanted. An explicit switch away from Fusion
 * clears the binding, and the chip goes with it.
 */
export function FusionPermission({ sessionId, directory, load }: FusionPermissionProps) {
  const state = useSyncExternalStore(directory.subscribe, directory.getSnapshot)
  const lang = useLang()
  // The acting role is the whole point of this chip, so it always wants fresh polls.
  const snapshot = useFusionStatus(sessionId, undefined, false, true)
  useEffect(() => { load() }, [load])
  // A failed or not-yet-answered poll reports no task, so nothing appears on a session this
  // window cannot confirm; a bound task shows as soon as its status arrives.
  const task = snapshot?.status?.selected === true ? snapshot.status.task : undefined
  const permissions = task?.permissions
  if (!permissions) return null
  const role: Role = permissions.active === 'worker' ? 'worker' : 'lead'
  const mode = role === 'worker' ? permissions.worker : permissions.lead
  const route = task.models[role]
  // The catalog name of the route that is answering; the exact id when this client cannot
  // resolve one (an unloaded or renamed catalog still has to say which model is working).
  const model = catalogModelName(state.groups, route) ?? route.model
  const roleName = role === 'worker' ? 'Sidekick' : 'Lead'
  const hint = tr(lang,
    `Fusion 按角色分离权限：Lead ${modeOf(lang, permissions.lead)}，Sidekick ${modeOf(lang, permissions.worker)}。输入框的权限控件属于对话会话（Lead），运行期间可能显示 Custom。`,
    `Fusion separates permissions by role: Lead ${modeOf(lang, permissions.lead)}, Sidekick ${modeOf(lang, permissions.worker)}. The permission control belongs to the conversation (Lead) session, so it may read Custom while a task runs.`)
  return <span className="fusion-permission" title={`${roleName} · ${model} · ${modeOf(lang, mode)} — ${hint}`}
    aria-label={`${roleName} · ${model} · ${modeOf(lang, mode)}`} data-ud-check="fusion-permission">
    <style>{styles}</style>
    {iconOf(mode)}
    <span className="fusion-permission-role">{roleName}</span>
    <span className="fusion-permission-model">{model}</span>
    <span className="fusion-permission-mode">{modeOf(lang, mode)}</span>
  </span>
}
