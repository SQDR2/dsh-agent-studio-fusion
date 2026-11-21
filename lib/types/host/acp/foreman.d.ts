import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { AcpAgentProcess } from './agent-process.js';
import type { ContextWindows } from './context-windows.js';
import type { PermissionTurn } from './permission.js';
import type { AcpAgentProfile } from './types.js';
/**
 * Run one Foreman audit turn on an ACP route in an isolated ephemeral session.
 *
 * Isolation properties:
 * - Opens a fresh ACP session in a newly created empty temporary directory (`cwd`), never in
 *   the project workspace, and removes that directory and closes the session on exit.
 * - Passes an empty `mcpServers: []` list so the session receives no Host-tool bridge, and
 *   never touches or revokes any Lead/Sidekick binding on the same route.
 * - Overrides the turn's permission policy to `'reject'`, and immediately cancels and fails
 *   closed with `ACP_AUDIT_PROTOCOL` if the agent emits any `tool_call` or `tool_call_update`
 *   event.
 * - Uses the same text-encoded `{"foremanTool":...}` protocol as Antigravity Foreman so all
 *   workspace inspections are executed and citation-verified by the Fusion Host.
 */
export declare function streamAcpForeman(options: GenerateOptions, profile: AcpAgentProfile, agent: AcpAgentProcess, turns: Map<string, PermissionTurn>, contextWindows: ContextWindows): AsyncIterable<StreamChunk>;
