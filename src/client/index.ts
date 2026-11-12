import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { FusionSettings } from './FusionSettings.js'
import { FusionPanelIcon } from './FusionPanelIcon.js'
import { FusionHint } from './FusionHint.js'
import { FusionPermission } from './FusionPermission.js'
import { FusionTool, fusionControlTools } from './FusionTool.js'
import { AGY_TOOL_VIEWS, installAgyToolViewStyles } from './agy/toolview.js'
import { NS as AGY_LOCALE_NS } from './agy/locales.js'
import { bindAgyLocale, type AgyLocaleSource } from './agy/locale.js'
import { FUSION_SIDEBAR_LABEL } from './studio-brand.js'
import { bindLocale } from './i18n.js'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'main': { kind: 'keyed'; scope: 'root' }
    'sidebar.panellist': {
      kind: 'list'
      scope: 'root'
      owner: { size: number; active: boolean }
    }
  }
}

export const name = 'dsh-fusion/client'
export const inject = ['slots']
export const FUSION_PANEL_ID = 'fusion'

export { FusionPanelIcon } from './FusionPanelIcon.js'

export function apply(ctx: Context): void {
  // Follow DSH's language setting (Chinese or English) when the locale service is present.
  ctx.inject(['locale'], scope => {
    const locale = (scope as unknown as { locale: Parameters<typeof bindLocale>[0] }).locale
    scope.effect(() => bindLocale(locale))
    // The ported Antigravity console carries its own dictionaries and follows the
    // same language setting; one service, two readers.
    scope.effect(() => bindAgyLocale(locale as unknown as AgyLocaleSource))
  })
  for (const tool of fusionControlTools) ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview', key: tool,
  }, FusionTool))
  // The built-in Antigravity route's tool cards. Exactly two keyed views, as the
  // standalone plugin registered them: `agy_tool` (the bridge transport's mirror
  // step) and `run_code` (Code Mode's wrapper). A keyed entry takes over that
  // name, so the `run_code` view renders the generated AGY mirror wrapper as an
  // Antigravity card and every other program as the ordinary code card.
  // Fusion's own activity rows keep rendering through `FusionTool`/`ActivityCard`;
  // nothing here touches them.
  // `tool.call.toolview` is a keyed slot: `key` IS the wire tool name, and the
  // only other fields are `priority`, `locale` and `registrant`. The standalone
  // plugin also passed `id`/`label`; those belong to list slots and are rejected
  // here, so the key is the whole identity — which is what dispatch reads anyway.
  for (const view of AGY_TOOL_VIEWS) ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview', key: view.key, locale: AGY_LOCALE_NS,
  }, view.component))
  ctx.effect(() => installAgyToolViewStyles())
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: FUSION_PANEL_ID,
  }, FusionSettings))
  // The one sidebar entry. Its label is the short product name (the page header
  // carries the full `DSH Agent Studio With Fusion` title); the panel id stays
  // `fusion`, which is what the main-panel key and the route names use.
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: FUSION_PANEL_ID, order: 40, label: () => FUSION_SIDEBAR_LABEL,
  }, FusionPanelIcon))
  ctx.inject(['modelDirectories'], scope => {
    const sessionProps = (sessionId: Parameters<typeof scope.modelDirectories.directoryFor>[0]) => {
      const directory = scope.modelDirectories.directoryFor(sessionId)
      return { sessionId, directory: directory.store, load: () => { void directory.load().catch(() => undefined) } }
    }
    scope.slots.inject('conversation.input.dock', () => scope.slots.register({
      name: 'conversation.input.dock', id: 'fusion-configuration', order: 20, inject: sessionProps,
    }, FusionHint))
    // Additive: the native permission control keeps its slot and its selection state.
    scope.slots.inject('conversation.input.left', () => scope.slots.register({
      name: 'conversation.input.left', id: 'fusion-permission', order: 10, inject: sessionProps,
    }, FusionPermission))
  })
}
