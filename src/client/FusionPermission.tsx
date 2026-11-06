import { useEffect, useSyncExternalStore } from 'react'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { PermissionIconFullAccessRegular, PermissionIconReadOnlyRegular,
  PermissionIconWorkspaceWriteRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SandboxMode } from '../contracts.js'
import { isFusionSelection } from '../identity.js'
import { tr, useLang, type Lang } from './i18n.js'
import { useFusionStatus } from './status-polling.js'

const styles = `
.fusion-permission{display:inline-flex;align-items:center;gap:4px;height:28px;min-width:0;max-width:220px;padding:0 6px;border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;font-weight:500}
.fusion-permission svg{width:14px;height:14px;flex:none}
.fusion-permission .fusion-permission-role{flex:none;color:var(--dsw-alias-label-caption)}
.fusion-permission .fusion-permission-mode{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`

const modeOf = (lang: Lang, mode: SandboxMode) => mode === 'read-only' ? tr(lang, '仅可查看', 'Read Only')
  : mode === 'workspace-write' ? tr(lang, '工作区内修改', 'Workspace Write') : tr(lang, '完全权限', 'Full access')
const iconOf = (mode: SandboxMode) => mode === 'read-only' ? <PermissionIconReadOnlyRegular />
  : mode === 'workspace-write' ? <PermissionIconWorkspaceWriteRegular /> : <PermissionIconFullAccessRegular />

export interface FusionPermissionProps { sessionId: string; directory: ObservableSnapshot<ModelDirectoryState>; load(): void }

/**
 * The permission of the model working now. The composer's native permission control
 * belongs to the conversation (Lead) session, which Fusion confines to read-only, and
 * that confinement matches no configured preset — so the control reads Custom while a
 * task runs. This additive chip names the role and its mode, so the tool row never
 * shows an unexplained Custom alone.
 */
export function FusionPermission({ sessionId, directory, load }: FusionPermissionProps) {
  const selected = useSyncExternalStore(directory.subscribe, directory.getSnapshot).current
  const fusion = isFusionSelection(selected ?? undefined)
  const lang = useLang()
  // The acting role is the whole point of this chip, so it always wants fresh polls.
  const snapshot = useFusionStatus(sessionId, undefined, false, true)
  useEffect(() => { load() }, [load])
  const permissions = fusion ? snapshot?.status?.task?.permissions : undefined
  if (!permissions) return null
  const role = permissions.active === 'worker' ? 'Sidekick' : 'Lead'
  const mode = permissions.active === 'worker' ? permissions.worker : permissions.lead
  const hint = tr(lang,
    `Fusion 按角色分离权限：Lead ${modeOf(lang, permissions.lead)}，Sidekick ${modeOf(lang, permissions.worker)}。输入框的权限控件属于对话会话（Lead），运行期间可能显示 Custom。`,
    `Fusion separates permissions by role: Lead ${modeOf(lang, permissions.lead)}, Sidekick ${modeOf(lang, permissions.worker)}. The permission control belongs to the conversation (Lead) session, so it may read Custom while a task runs.`)
  return <span className="fusion-permission" title={hint} aria-label={`${role} · ${modeOf(lang, mode)}`} data-ud-check="fusion-permission">
    <style>{styles}</style>
    {iconOf(mode)}
    <span className="fusion-permission-role">{role}</span>
    <span className="fusion-permission-mode">{modeOf(lang, mode)}</span>
  </span>
}
