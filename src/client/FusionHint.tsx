import { tr, useLang } from './i18n.js'
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import { onSettingsChanged } from './settings-events.js'
import { FusionStatus } from './FusionStatus.js'
import { FUSION_API_PATH, isFusionSelection } from '../identity.js'
import { useFusionStatus } from './status-polling.js'

export interface FusionHintProps { sessionId: string; directory: ObservableSnapshot<ModelDirectoryState>; load(): void }

/**
 * Additive composer hint. The original selector and its selection state stay native.
 *
 * Whether this conversation is Fusion's is read from the durable task first and from the
 * native selection second. While a turn is pinned the native selection is the pair's
 * physical route, so the selection alone would call the session non-Fusion for the whole
 * turn and take the hint (and the attention status beside it) away exactly then.
 */
export function FusionHint({ sessionId, directory, load }: FusionHintProps) {
  const selected = useSyncExternalStore(directory.subscribe, directory.getSnapshot).current
  const lang = useLang()
  const snapshot = useFusionStatus(sessionId, undefined, false, false)
  const bound = snapshot?.status?.selected === true
  // A session that selected Fusion before the rename stored the old route, and a pinned
  // turn stores the pair's Lead: the bound combo is the identity both cases need.
  const virtual = snapshot?.status?.selection
    ?? (isFusionSelection(selected ?? undefined) ? selected ?? undefined : undefined)
  const fusion = bound || isFusionSelection(selected ?? undefined)
  const [message, setMessage] = useState<string>()
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!fusion || virtual === undefined) { setMessage(undefined); return }
    let active = true
    const abort = new AbortController()
    const refresh = () => {
      void fetch(`${FUSION_API_PATH}?view=settings`, { credentials: 'same-origin', cache: 'no-store', signal: abort.signal })
        .then(async response => { if (!response.ok) throw new Error('unavailable'); return response.json() as Promise<{ pairs: { id: string; authorized: boolean; reason?: string }[] }> })
        .then(state => {
          if (!active) return
          // The hint speaks for this conversation's combo, not for the first one.
          const combo = state.pairs.find(pair => pair.id === virtual.model)
          if (!state.pairs.length) setMessage(tr(lang, 'Fusion 尚未配置模型，请打开左侧边栏的 Fusion 面板选择 Lead 和 Sidekick。', 'Fusion has no models yet: open the Fusion panel in the left sidebar and choose a Lead and a Sidekick.'))
          else if (!combo) setMessage(tr(lang, '当前组合已被删除，请在模型菜单中选择其他组合。', 'This combo was removed; pick another one in the model menu.'))
          else if (!combo.authorized) setMessage(tr(lang, 'Fusion 当前配置未就绪，请在左侧边栏的 Fusion 面板查看。', 'The Fusion setup is not ready: see the Fusion panel in the left sidebar.'))
          else setMessage(undefined)
        })
        .catch(() => { if (active) setMessage(tr(lang, '暂时无法确认 Fusion 配置，请在左侧边栏的 Fusion 面板查看。', 'Cannot confirm the Fusion setup right now: see the Fusion panel in the left sidebar.')) })
    }
    refresh()
    const off = onSettingsChanged(refresh)
    return () => { active = false; abort.abort(); off() }
  }, [fusion, lang, virtual?.model])
  if (!fusion) return null
  return <>
    {message && <p role="status" style={{ margin: '8px 12px', color: 'var(--dsw-alias-label-secondary)', fontSize: 12, lineHeight: '18px' }}>{message}</p>}
    <FusionStatus sessionId={sessionId} attentionOnly />
  </>
}
