import { FusionHistory } from './FusionHistory.js'
import { FusionCache } from './FusionCache.js'
import { useEffect, useState } from 'react'
import type { PhysicalRoute } from '../contracts.js'
import type { PairChoice, SettingsCatalog } from '../host/settings.js'
import { settingsChanged } from './settings-events.js'
import { tr, useLang } from './i18n.js'
import { FUSION_API_PATH } from '../identity.js'

/** One saved combo as the page shows it: its id, its label and its pair. */
export interface SavedPairView { id: string; name: string; pair: PairChoice; authorized: boolean; reason?: string }
interface SettingsState {
  revision: number
  catalog: SettingsCatalog
  pairs: SavedPairView[]
  maxPairs: number
  authorized: boolean
  managedAuthorization?: boolean
  reason?: string
}
/** A row being edited. `id` is absent until the list is saved for the first time. */
interface DraftCombo { key: string; id?: string; name: string; pair: Partial<PairChoice> }
const styles = `
.fusion-page{box-sizing:border-box;width:100%;height:100%;min-width:0;min-height:0;flex:1 1 auto;overflow:auto;display:flex;flex-direction:column;align-items:center;scrollbar-gutter:stable;padding:0 clamp(24px,4vw,48px) 48px;--dsh-scrollbar-width:9px;--dsh-scrollbar-thumb-border:2px}
.fusion-settings{box-sizing:border-box;width:100%;max-width:680px;margin:0 auto;color:var(--dsw-alias-label-primary);display:flex;flex-direction:column;gap:18px}
.fusion-settings h2{margin:0;font-size:22px;line-height:30px;font-weight:600}
.fusion-settings p{margin:0;font-size:13px;line-height:21px;color:var(--dsw-alias-label-secondary)}
.fusion-settings header{display:flex;flex-direction:column;gap:8px;padding-top:28px}
[data-platform='darwin'] .fusion-settings header{padding-top:calc(28px + var(--dsh-frame-top-clearance,0px))}
.fusion-settings .fusion-card{padding:20px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;display:flex;flex-direction:column;gap:20px;background:var(--dsw-alias-bg-module-platform)}
.fusion-settings fieldset{padding:0;margin:0;border:0;min-inline-size:0;display:flex;flex-direction:column;gap:10px}
.fusion-settings legend{font-size:15px;font-weight:600;padding:0 0 4px}
.fusion-settings label{display:grid;grid-template-columns:85px minmax(0,1fr);align-items:center;gap:12px;font-size:13px}
.fusion-settings :is(select,option,optgroup){background-color:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);color-scheme:inherit}
.fusion-settings select{box-sizing:border-box;min-width:0;width:100%;min-height:36px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;padding:5px 9px;font:inherit}
.fusion-settings .fusion-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.fusion-settings button{border:1px solid var(--dsw-alias-border-l2);border-radius:18px;background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary));color:var(--dsw-alias-label-primary-foreground,#fff);padding:7px 18px;font:inherit;font-size:13px;cursor:pointer}
.fusion-settings button:disabled{opacity:.5;cursor:default}
.fusion-settings :is(button,select):focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.fusion-settings [role=alert]{color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere}
.fusion-settings details{font-size:13px;line-height:21px}
.fusion-settings summary{cursor:pointer;font-weight:500}
.fusion-settings .fusion-limits{display:flex;flex-direction:column;gap:12px;padding-top:14px}
.fusion-settings :is(input[type=number],input[type=text]){min-width:0;width:100%;box-sizing:border-box;background-color:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:7px;padding:8px;font:inherit}
.fusion-settings .fusion-consent{display:flex;align-items:flex-start;gap:8px;font-size:12px;line-height:18px}
.fusion-combos{display:flex;flex-direction:column;gap:8px}
.fusion-settings .fusion-combo{display:flex;align-items:stretch;padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background-color:var(--dsw-alias-bg-layer-1);font-size:13px;overflow:hidden;transition:border-color .15s ease,background-color .15s ease}
.fusion-settings .fusion-combo:hover{background-color:var(--dsw-alias-interactive-bg-hover)}
.fusion-settings .fusion-combo[data-active=true]{border-color:var(--dsw-alias-brand-primary);background-color:var(--dsw-alias-interactive-bg-hover-accent)}
.fusion-settings .fusion-combo-main{flex:1 1 auto;display:flex;align-items:center;gap:10px;min-width:0;padding:11px 12px;background:none;border:0;border-radius:0;color:inherit;font:inherit;text-align:left;cursor:pointer}
.fusion-settings .fusion-combo-main:hover{background:none}
.fusion-settings .fusion-combo :is(.fusion-combo-main,.fusion-combo-actions):focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.fusion-settings .fusion-combo-check{position:relative;flex:none;width:14px;height:14px;border:1.5px solid var(--dsw-alias-border-l2);border-radius:50%;transition:border-color .15s ease}
.fusion-settings .fusion-combo:hover .fusion-combo-check{border-color:var(--dsw-alias-label-tertiary)}
.fusion-settings .fusion-combo[data-active=true] .fusion-combo-check{border-color:var(--dsw-alias-brand-primary)}
.fusion-settings .fusion-combo[data-active=true] .fusion-combo-check::after{content:'';position:absolute;inset:2.5px;border-radius:50%;background:var(--dsw-alias-brand-primary)}
.fusion-settings .fusion-combo-text{display:flex;flex-direction:column;gap:2px;min-width:0}
.fusion-settings .fusion-combo-name{font-weight:600;overflow-wrap:anywhere}
.fusion-settings .fusion-combo-routes{color:var(--dsw-alias-label-secondary);font-size:12px;overflow-wrap:anywhere}
.fusion-settings .fusion-combo-actions{flex:none;align-self:stretch;display:flex;align-items:center;padding:0 14px;border:0;border-left:1px solid var(--dsw-alias-border-l1);border-radius:0;background:none;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;transition:color .15s ease,background-color .15s ease}
.fusion-settings .fusion-combo-actions:hover:not(:disabled){color:var(--dsw-alias-state-error-primary);background-color:var(--dsw-alias-interactive-bg-hover-danger)}
.fusion-settings .fusion-combo-actions:disabled{opacity:.4;cursor:default}
.fusion-settings .fusion-combo-add{align-self:flex-start;padding:8px 16px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:none;color:var(--dsw-alias-label-secondary);font-size:13px}
.fusion-settings .fusion-combo-add:hover:not(:disabled){background-color:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.fusion-cache{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-module-platform);padding:16px;display:flex;flex-direction:column;gap:12px}
.fusion-cache h3{margin:0}
.fusion-cache-summary{cursor:pointer;font-weight:600;font-size:14px;display:flex;align-items:center;justify-content:space-between;list-style:none;user-select:none;padding:2px 0}
.fusion-cache-summary::-webkit-details-marker{display:none}
.fusion-cache-summary:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;border-radius:4px}
.fusion-cache-title{display:inline-flex;align-items:center;gap:6px}
.fusion-cache-title h3{margin:0;font-size:15px;font-weight:600}
.fusion-cache-indicator{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:400;color:var(--dsw-alias-label-secondary)}
.fusion-cache-chevron{display:inline-block;width:7px;height:7px;border-right:2px solid var(--dsw-alias-label-secondary);border-bottom:2px solid var(--dsw-alias-label-secondary);transform:rotate(-45deg);transition:transform .15s ease;margin-left:2px}
.fusion-cache[open] .fusion-cache-chevron{transform:rotate(45deg)}
.fusion-cache-content{display:flex;flex-direction:column;gap:12px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l2);margin-top:4px}
.fusion-cache-model{display:flex;flex-direction:column;gap:8px;padding:14px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px}
.fusion-cache-model small{display:block;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.fusion-cache-controls{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr) auto;gap:10px;align-items:end}
.fusion-cache-controls label{grid-template-columns:1fr;gap:4px}
.fusion-cache a{color:var(--dsw-alias-brand-primary)}
@media(max-width:560px){.fusion-cache-controls{grid-template-columns:1fr}}
.fusion-history{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-module-platform);padding:16px;display:flex;flex-direction:column;gap:12px}
.fusion-history-summary{cursor:pointer;font-weight:600;font-size:14px;display:flex;align-items:center;justify-content:space-between;list-style:none;user-select:none;padding:2px 0}
.fusion-history-summary::-webkit-details-marker{display:none}
.fusion-history-summary:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;border-radius:4px}
.fusion-history-title{display:inline-flex;align-items:center;gap:6px}
.fusion-history-title h3{margin:0;font-size:15px;font-weight:600}
.fusion-history-indicator{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:400;color:var(--dsw-alias-label-secondary)}
.fusion-history-chevron{display:inline-block;width:7px;height:7px;border-right:2px solid var(--dsw-alias-label-secondary);border-bottom:2px solid var(--dsw-alias-label-secondary);transform:rotate(-45deg);transition:transform .15s ease;margin-left:2px}
.fusion-history[open] .fusion-history-chevron{transform:rotate(45deg)}
.fusion-history-content{display:flex;flex-direction:column;gap:12px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l2);margin-top:4px}
.fusion-history-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
.fusion-history-panel{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-module-platform);padding:16px;display:flex;flex-direction:column;gap:12px}
.fusion-history-usage h3{margin:0;font-size:14px;font-weight:600}
.fusion-history table{width:100%;border-collapse:collapse;font-size:12px;text-align:left}
.fusion-history :is(th,td){padding:8px;border-bottom:1px solid var(--dsw-alias-border-l2);font-weight:400;vertical-align:top}
.fusion-history caption{text-align:left;font-size:13px;margin-bottom:8px}
.fusion-history small{display:block;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.fusion-history ol{padding-left:20px;margin:0}
.fusion-history li{padding:10px 0;border-bottom:1px solid var(--dsw-alias-border-l2)}
.fusion-history li:last-child{border-bottom:0}
.fusion-history h3{margin:0;font-size:14px;font-weight:600}
.fusion-history p{overflow-wrap:anywhere}
.fusion-history-tasks-summary{cursor:pointer;font-weight:600;font-size:14px;display:flex;align-items:center;justify-content:space-between;list-style:none;user-select:none;padding:2px 0}
.fusion-history-tasks-summary::-webkit-details-marker{display:none}
.fusion-history-tasks-summary:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;border-radius:4px}
.fusion-history-tasks-title{display:inline-flex;align-items:center;gap:6px}
.fusion-history-count{font-size:13px;font-weight:400;color:var(--dsw-alias-label-secondary)}
.fusion-history-tasks-indicator{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:400;color:var(--dsw-alias-label-secondary)}
.fusion-history-tasks-chevron{display:inline-block;width:7px;height:7px;border-right:2px solid var(--dsw-alias-label-secondary);border-bottom:2px solid var(--dsw-alias-label-secondary);transform:rotate(-45deg);transition:transform .15s ease;margin-left:2px}
.fusion-history-tasks[open] .fusion-history-tasks-chevron{transform:rotate(45deg)}
.fusion-history-tasks-content{display:flex;flex-direction:column;gap:12px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l2);margin-top:4px}
.fusion-history-item-header{display:flex;align-items:center;justify-content:space-between;gap:12px}
.fusion-history-item-header h3{margin:0;font-size:14px;font-weight:600}
.fusion-history-actions{display:flex;align-items:center;gap:8px;flex-shrink:0}
.fusion-history-actions button{padding:3px 12px;font-size:12px;border-radius:14px}
.fusion-history-actions button.fusion-btn-subtle{background:transparent;color:var(--dsw-alias-label-primary)}
.fusion-history-confirm-text{font-size:12px;color:var(--dsw-alias-label-secondary)}
@media(max-width:480px){.fusion-page{padding:0 16px 32px}.fusion-settings label{grid-template-columns:1fr;gap:6px}.fusion-settings .fusion-card{padding:16px}}
`

const key = (route: PhysicalRoute | undefined) => route ? JSON.stringify([route.provider, route.model]) : ''

export function ModelChoice({ role, route, catalog, onChange }: {
  role: 'Lead' | 'Sidekick' | 'compactor'; route?: PhysicalRoute; catalog: SettingsCatalog; onChange(route: PhysicalRoute | undefined): void
}) {
  const lang = useLang()
  const name = role === 'compactor' ? tr(lang, '压缩', 'Compaction') : role
  const model = catalog.groups.find(group => group.id === route?.provider)?.models.find(model => model.id === route?.model)
  return <fieldset>
    <legend>{name}</legend>
    <p>{role === 'Lead' ? tr(lang, '回答问题、制定方案并审查结果。', 'Answers, plans and reviews.') : role === 'Sidekick' ? tr(lang, '执行命令和修改，接收反馈后继续。', 'Runs commands and makes changes, then continues with feedback.') : tr(lang, '整理较早的上下文，供 Lead 或 Worker 继续工作。', 'Summarises older context so the Lead or Sidekick can continue.')}</p>
    <label>{tr(lang, '模型', 'Model')}<select aria-label={tr(lang, `${name} 模型`, `${name} model`)} value={key(route)} onChange={event => {
      if (!event.target.value) { onChange(undefined); return }
      const [provider, model] = JSON.parse(event.target.value) as [string, string]
      onChange({ provider, model })
    }}>
      <option value="" disabled={role !== 'compactor'}>{role === 'compactor' ? tr(lang, '使用当前角色模型', 'Use the role\'s own model') : tr(lang, '选择已连接的模型', 'Choose a connected model')}</option>
      {catalog.groups.map(group => <optgroup key={group.id} label={group.name}>
        {group.models.map(model => <option key={model.id} value={key({ provider: group.id, model: model.id })}>{model.name}</option>)}
      </optgroup>)}
    </select></label>
    {model?.reasoning && route && <label>{tr(lang, '推理强度', 'Reasoning')}<select aria-label={tr(lang, `${name} 推理强度`, `${name} reasoning`)} value={route.reasoningEffort ?? ''} onChange={event => {
      const { reasoningEffort: _old, ...physical } = route
      onChange({ ...physical, ...(event.target.value ? { reasoningEffort: event.target.value } : {}) })
    }}>
      <option value="">{tr(lang, '模型默认', 'Model default')}{model.reasoning.defaultEffort ? ` · ${model.reasoning.defaultEffort}` : ''}</option>
      {model.reasoning.efforts.map(effort => <option key={effort.id} value={effort.id}>{effort.name}</option>)}
    </select></label>}
  </fieldset>
}

let draftKeys = 0
const toDraft = (pairs: readonly SavedPairView[]): DraftCombo[] => pairs.map(({ id, name, pair }) => ({ key: id, id, name, pair }))

export function FusionSettings() {
  const lang = useLang()
  const [state, setState] = useState<SettingsState>()
  const [draft, setDraft] = useState<DraftCombo[]>([])
  const [active, setActive] = useState(0)
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [saving, setSaving] = useState(false)
  const current = draft[Math.min(active, draft.length - 1)]
  const routeName = (route?: PhysicalRoute) => route
    ? state?.catalog.groups.find(group => group.id === route.provider)?.models.find(model => model.id === route.model)?.name
      ?? `${route.provider}/${route.model}` : '—'
  const update = (change: (combo: DraftCombo) => DraftCombo) => setDraft(value => value.map((combo, index) =>
    combo.key === current?.key ? change(combo) : combo))
  const chooseModel = (role: 'lead' | 'worker', route: PhysicalRoute) => update(combo => ({ ...combo, pair: { ...combo.pair, [role]: route,
    ...(combo.pair.cacheKeepalive ? { cacheKeepalive: { ...combo.pair.cacheKeepalive, [role]: role === 'lead' ? 'auto' : false } } : {}) } }))
  useEffect(() => {
    const abort = new AbortController()
    void fetch(`${FUSION_API_PATH}?view=settings`, { credentials: 'same-origin', cache: 'no-store', signal: abort.signal })
      .then(async response => { if (!response.ok) throw new Error(tr(lang, '无法读取 Fusion 设置', 'Cannot read Fusion settings')); return response.json() as Promise<SettingsState> })
      .then(value => { setState(value); setDraft(toDraft(value.pairs)); setActive(0) })
      .catch(error => { if (!abort.signal.aborted) setError(String(error)) })
    return () => abort.abort()
  }, [])
  const addCombo = () => {
    draftKeys += 1
    setDraft(value => [...value, { key: `new-${draftKeys}`, name: tr(lang, `组合 ${value.length + 1}`, `Combo ${value.length + 1}`), pair: {} }])
    setActive(draft.length)
  }
  const removeCombo = (index: number) => {
    setDraft(value => value.filter((_, position) => position !== index))
    setActive(Math.max(0, Math.min(active > index ? active - 1 : active, draft.length - 2)))
  }
  const save = async () => {
    if (!state) return
    const invalid = draft.findIndex(combo => !combo.pair.lead || !combo.pair.worker || !combo.name.trim())
    if (invalid >= 0) { setError(tr(lang, `第 ${invalid + 1} 个组合还不完整：需要名称、Lead 和 Sidekick。`, `Combo ${invalid + 1} is incomplete: it needs a name, a Lead and a Sidekick.`)); return }
    setSaving(true); setError(undefined); setNotice(undefined)
    try {
      const pairs = draft.map(({ id, name, pair }) => {
        const { outputTokens, ...rest } = pair
        const limits = Object.fromEntries(Object.entries(outputTokens ?? {}).filter(([, tokens]) => Number.isSafeInteger(tokens) && Number(tokens) > 0))
        return { ...(id ? { id } : {}), name: name.trim(), pair: { ...rest, ...(Object.keys(limits).length ? { outputTokens: limits } : {}) } }
      })
      const response = await fetch(FUSION_API_PATH, { method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'configure', revision: state.revision, pairs }) })
      const result = await response.json() as { revision: number; error?: string }
      if (!response.ok) throw new Error(result.error ?? tr(lang, '保存失败，请刷新后重试', 'Save failed; refresh and try again'))
      const confirmed = await fetch(`${FUSION_API_PATH}?view=settings`, { credentials: 'same-origin', cache: 'no-store' })
      if (!confirmed.ok) throw new Error(tr(lang, '配置已提交，但暂时无法确认，请刷新', 'Saved, but not confirmed yet; refresh'))
      const next = await confirmed.json() as SettingsState
      setState(next); setDraft(toDraft(next.pairs)); setActive(0)
      settingsChanged()
      setNotice(tr(lang, '组合已保存。模型菜单中每个组合各占一项，不同会话可以同时使用不同组合。', 'Combos saved. Each one is its own model-menu entry, so different conversations can use different combos at the same time.'))
    } catch (error) { setError(error instanceof Error ? error.message : String(error)) }
    finally { setSaving(false) }
  }
  const dirty = state ? JSON.stringify(draft.map(({ id, name, pair }) => ({ id, name, pair })))
    !== JSON.stringify(state.pairs.map(({ id, name, pair }) => ({ id, name, pair }))) : false
  const blocked = state?.pairs.filter(pair => !pair.authorized) ?? []
  return <div className="fusion-page">
    <style>{styles}</style>
    <div className="fusion-settings">
      <header data-window-drag><h2>Fusion</h2>
        <p>{tr(lang, '每个组合是一对 Lead 和 Sidekick，会作为单独的一项出现在模型菜单里。开启多个会话时，可以为每个会话选择不同的组合。', 'Each combo is a Lead and a Sidekick pair, listed as its own entry in the model menu. With several conversations open, each one can use a different combo.')}</p>
        <p>{tr(lang, 'Lead 处理日常请求、安排工作并审查结果；Sidekick 执行委派的任务。', 'The Lead handles requests, plans and reviews; the Sidekick does the delegated work.')}</p>
        <p><b>{tr(lang, '搭配建议', 'Pairing tip')}</b>: {tr(lang, 'Fusion 省钱靠的是 Sidekick 比 Lead 便宜得多。选一个强的前沿模型当 Lead，再选一个价格低很多（最好 5 倍以上）的模型当 Sidekick；两者价格越接近，越省不了钱。',
          'Fusion saves money because the Sidekick is much cheaper than the Lead. Pick a strong frontier Lead and a Sidekick that costs far less (ideally 5× or more); the closer their prices, the smaller the saving.')}</p></header>
      {error && <p role="alert">{error}</p>}
      {!state && !error && <p role="status">{tr(lang, '正在读取模型…', 'Loading models…')}</p>}
      {state && <>
        <section className="fusion-card" aria-label={tr(lang, '组合列表', 'Combo list')}>
          <div className="fusion-combos">
            {draft.map((combo, index) => {
              const selected = combo.key === current?.key
              const label = combo.name.trim() || tr(lang, '未命名组合', 'Untitled combo')
              // The whole row is the selection target: the button spans the row up to the Delete
              // button, so the padding and the empty space beside the text select the combo too.
              return <div className="fusion-combo" key={combo.key} data-active={selected}>
                <button type="button" className="fusion-combo-main" aria-pressed={selected}
                  onClick={() => setActive(index)}>
                  <span className="fusion-combo-check" aria-hidden="true" />
                  <span className="fusion-combo-text">
                    <span className="fusion-combo-name">{label}</span>
                    <span className="fusion-combo-routes">{`${routeName(combo.pair.lead)} → ${routeName(combo.pair.worker)}`}</span>
                  </span>
                </button>
                <button type="button" className="fusion-combo-actions" disabled={saving || draft.length <= 1}
                  aria-label={tr(lang, `删除组合 ${label}`, `Delete combo ${label}`)}
                  onClick={event => { event.stopPropagation(); removeCombo(index) }}>{tr(lang, '删除', 'Delete')}</button>
              </div>
            })}
            {!draft.length && <p>{tr(lang, '还没有组合。新增一个，选择 Lead 和 Sidekick 后保存。', 'No combos yet. Add one, choose a Lead and a Sidekick, then save.')}</p>}
          </div>
          <button type="button" className="fusion-combo-add" disabled={saving || draft.length >= state.maxPairs} onClick={addCombo}>{tr(lang, '＋ 新增组合', '+ Add combo')}</button>
          <p>{tr(lang, `最多保存 ${state.maxPairs} 个组合；模型菜单中的名称是「Fusion · 组合名称」。`, `Up to ${state.maxPairs} combos; the model menu shows them as “Fusion · name”.`)}</p>
        </section>
        {current && <fieldset className="fusion-card" disabled={saving}>
          <label>{tr(lang, '名称', 'Name')}<input type="text" maxLength={40} aria-label={tr(lang, '组合名称', 'Combo name')}
            value={current.name} onChange={event => update(combo => ({ ...combo, name: event.target.value }))} /></label>
          <ModelChoice role="Lead" route={current.pair.lead} catalog={state.catalog} onChange={route => { if (route) chooseModel('lead', route) }} />
          <ModelChoice role="Sidekick" route={current.pair.worker} catalog={state.catalog} onChange={route => { if (route) chooseModel('worker', route) }} />
          <details><summary>{tr(lang, '上下文压缩模型 · 可选', 'Compaction model · optional')}</summary>
            <div className="fusion-limits">
              <p>{tr(lang, '默认由当前角色模型压缩。也可以单独选择已连接的模型；请求由所选账号计费。', 'By default each role compacts with its own model. You can pick another connected model; its account is billed.')}</p>
              <ModelChoice role="compactor" route={current.pair.compactor?.route} catalog={state.catalog} onChange={route => update(combo => {
                const { compactor, ...rest } = combo.pair
                return { ...combo, pair: route ? { ...rest, compactor: { route, maxOutputTokens: compactor?.maxOutputTokens ?? 8192 } } : rest }
              })} />
              {current.pair.compactor && <label>{tr(lang, '输出 Token 上限', 'Output token limit')}<input aria-label={tr(lang, '压缩输出 Token 上限', 'Compaction output token limit')} type="number" min="1" max="128000"
                value={current.pair.compactor.maxOutputTokens} onChange={event => { const maxOutputTokens = Number(event.target.value)
                  update(combo => combo.pair.compactor ? { ...combo, pair: { ...combo.pair, compactor: { ...combo.pair.compactor, maxOutputTokens } } } : combo) }} /></label>}
            </div>
          </details>
        </fieldset>}
        <div className="fusion-actions"><p>{tr(lang, '已选中的会话保留原组合；新选择使用新组合。额度耗尽后要换当前任务的 Sidekick，用该会话的 Fusion 恢复面板，而不是只改这里。', 'Conversations already using Fusion keep their pair; new selections use the new one. After a quota stop, switch this conversation\'s Sidekick from its Fusion recovery panel, not only here.')}</p>
          <button disabled={saving || !dirty || !draft.length} onClick={() => { void save() }}>{saving ? tr(lang, '正在保存…', 'Saving…') : tr(lang, '保存组合', 'Save combos')}</button>
        </div>
        {notice && <p role="status">{notice}</p>}
        <p>{tr(lang, '输出参数跟随原生模型设置，Fusion 不额外限制请求次数或任务轮数。', 'Output settings follow the native model settings; Fusion adds no request or round limits.')}</p>
        <p>{tr(lang, '保存即表示允许 Fusion 使用所选模型的现有账号；费用由这些账号计入，当前未提供可靠的实际账单金额。', 'Saving lets Fusion use the chosen models\' existing accounts; they are billed there, and no reliable billed amount is available here.')}</p>
        {blocked.map(pair => <p key={pair.id} role="status">{`${pair.name}: ${tr(lang, '尚未就绪，需要重新保存这个组合', 'not ready yet; save this combo again')}${pair.reason ? `: ${pair.reason}` : ''}`}</p>)}
        {state.managedAuthorization && <p>{tr(lang, '运行额度由外部授权配置管理。', 'Run limits are managed by an external authorization file.')}</p>}
      </>}
      <FusionCache refresh={state?.revision ?? 0} />
      <FusionHistory />
    </div>
  </div>
}
