import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { bi } from '../bilingual.js'
import type { PhysicalRoute } from '../contracts.js'
import { FUSION_SOURCE_KIND } from '../message-source.js'
import type { FusionCoordinator } from './coordinator.js'

export async function runPlanningCommand(
  invocation: CommandInvocation,
  controller: FusionCoordinator,
  validateRoute: (route: PhysicalRoute) => Promise<void>,
): Promise<CommandResult | undefined> {
  const input = invocation.rawInput.trim()
  const action = input.split(/\s+/, 1)[0]
  const detail = input.slice(action?.length ?? 0).trim()
  if (action === 'allow-explore') {
    controller.authorizeExploration(invocation.agent, invocation.commandId, detail)
    return { kind: 'success', text: bi('已授权一次限定范围的只读取证。继续时把授权范围原文发给 Lead；关键证据仍由 Lead 亲自核验。', 'One bounded read-only survey was authorized. Send the exact scope to Lead when continuing; Lead still verifies the decisive evidence.') }
  }
  if (action !== 'foreman-retry' && action !== 'foreman-model' && action !== 'foreman-skip') return
  let route: PhysicalRoute | undefined
  if (action === 'foreman-model') {
    const separator = detail.indexOf('/')
    if (separator <= 0 || separator === detail.length - 1 || /\s/.test(detail)) throw new Error('Use /fusion foreman-model <provider/model>')
    route = { provider: detail.slice(0, separator), model: detail.slice(separator + 1) }
    await validateRoute(route)
  } else if (action === 'foreman-retry' && detail) throw new Error('Use /fusion foreman-retry without arguments')
  invocation.signal.throwIfAborted()
  controller.authorizeForemanRecovery(invocation.agent, invocation.commandId, action === 'foreman-skip' ? 'skip' : 'retry', { route, note: detail })
  invocation.agent.send(createUserMessage({ source: { kind: FUSION_SOURCE_KIND, form: 'notice', summary: bi('工长审查恢复决定', 'Foreman review recovery decision') }, content: [{ type: 'text',
    text: 'The user recorded a recovery decision for the failed Foreman review. Call fusion_resume_plan to reuse the exact finalized plan. Do not send a new candidate.' }] }), 'next-turn', true)
  return { kind: 'success', text: bi('已记录本份计划的恢复决定，Lead 将重新提交原方案。', 'Recovery decision recorded for this candidate. Lead will resubmit the same plan.') }
}
