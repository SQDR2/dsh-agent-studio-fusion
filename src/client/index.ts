import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { FusionSettings } from './FusionSettings.js'
import { FusionPanelIcon } from './FusionPanelIcon.js'
import { FusionHint } from './FusionHint.js'
import { FusionTool, fusionControlTools } from './FusionTool.js'
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
  ctx.inject(['locale'], scope => { scope.effect(() => bindLocale((scope as unknown as { locale: Parameters<typeof bindLocale>[0] }).locale)) })
  for (const tool of fusionControlTools) ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview', key: tool,
  }, FusionTool))
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: FUSION_PANEL_ID,
  }, FusionSettings))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: FUSION_PANEL_ID, order: 40, label: () => 'Fusion',
  }, FusionPanelIcon))
  ctx.inject(['modelDirectories'], scope => {
    scope.slots.inject('conversation.input.dock', () => scope.slots.register({
      name: 'conversation.input.dock', id: 'fusion-configuration', order: 20,
      inject: sessionId => {
        const directory = scope.modelDirectories.directoryFor(sessionId)
        return { sessionId, directory: directory.store, load: () => { void directory.load().catch(() => undefined) } }
      },
    }, FusionHint))
  })
}
