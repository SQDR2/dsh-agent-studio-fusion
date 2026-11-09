import { isRouteTransportName } from '../host/route-transport.js'
import { mirrorStepInvocation } from '../activity.js'

/**
 * One activity row as the parent conversation can honestly present it.
 *
 * A bridge route reports a step it already executed through its own transport;
 * the recorded payload only carries the inner tool name and its input, so the
 * row is unwrapped here. Nothing is replayed, executed or inferred: `tool` is the
 * recorded operation, `arguments` are the recorded arguments, and an unreadable
 * payload falls back to the raw call arguments shown by the renderer.
 */
export interface PresentedCall {
  /** The operation to name in the row: the unwrapped inner tool, or the recorded name. */
  tool: string
  /** Set when the row is a bridge transport replay rather than a direct Worker tool. */
  transport?: string
  /** Arguments describing the presented operation; `{}` when the payload is unreadable. */
  arguments: Record<string, unknown>
  /** MCP server the inner tool belonged to, when the route reported one. */
  server?: string
  /** True when the recorded arguments were not a JSON object and must stay raw. */
  malformed: boolean
  /** The recorded call arguments, unchanged. */
  raw: string
}

const CODE_WRAPPER = 'run_code'
const META_MCP = /^(call_mcp_tool|callMcpTool|call_mcp|mcp_call)$/i

/** The agy tools that run a shell command and therefore get a terminal card. */
const AGY_TERMINAL_TOOLS: ReadonlySet<string> = new Set([
  'run_command', 'bash', 'execute_command', 'ops_bash', 'sh', 'shell',
])

/** The Host's own shell tools; their output ends with the exit marker this Host writes. */
const HOST_TERMINAL_TOOLS: ReadonlySet<string> = new Set(['bash', 'pwsh'])

function pickString(input: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = input[key]
    if (typeof value === 'string' && value !== '') return value
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return undefined
}

function parseObject(raw: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed as Record<string, unknown>
  } catch { /* Raw call arguments remain inspectable in the renderer. */ }
  return undefined
}

/** agy serializes some tool args as a JSON string; presenters get an object. */
function innerArguments(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value === 'string') {
    let text = value.trim()
    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
      try {
        const unquoted: unknown = JSON.parse(text)
        if (typeof unquoted === 'string') text = unquoted.trim()
      } catch { /* keep the quoted text */ }
    }
    try {
      const parsed: unknown = JSON.parse(text)
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed as Record<string, unknown>
      return { value: parsed }
    } catch { return { value: value } }
  }
  return { value }
}

function unwrapMcp(tool: string, input: Record<string, unknown>): { tool: string; server?: string; input: Record<string, unknown> } {
  if (META_MCP.test(tool)) {
    const server = pickString(input, ['ServerName', 'server_name', 'serverName', 'server'])
    const inner = pickString(input, ['ToolName', 'tool_name', 'toolName', 'name', 'tool'])
    if (inner !== undefined) {
      const raw = input.Arguments ?? input.arguments ?? input.args ?? input.parameters ?? input.params ?? input.input
      return { tool: inner, ...(server === undefined ? {} : { server }), input: innerArguments(raw) }
    }
  }
  if (tool.startsWith('mcp__')) {
    const parts = tool.slice(5).split('__')
    if (parts.length >= 2) return { tool: parts.slice(1).join('__'), server: parts[0]!, input }
  }
  return { tool, input }
}

/**
 * Describe one recorded call without inventing anything. Only a registered route
 * transport or the exact generated Code Mode wrapper is unwrapped, matching the
 * host-side projection predicate in `presentsActivity`.
 */
export function presentedCall(name: string, rawArguments: string): PresentedCall {
  const parsed = parseObject(rawArguments)
  const raw = parsed ?? {}
  if (isRouteTransportName(name)) {
    const reported = typeof raw.tool === 'string' ? raw.tool.trim() : ''
    if (reported === '') return { tool: name, transport: name, arguments: raw, malformed: parsed === undefined, raw: rawArguments }
    const server = typeof raw.server === 'string' && raw.server !== '' ? raw.server : undefined
    const unwrapped = unwrapMcp(reported, innerArguments(raw.input))
    const owner = unwrapped.server ?? server
    return { tool: unwrapped.tool, transport: name, arguments: unwrapped.input,
      ...(owner === undefined ? {} : { server: owner }), malformed: parsed === undefined, raw: rawArguments }
  }
  if (name === CODE_WRAPPER && parsed !== undefined && typeof parsed.code === 'string') {
    const step = mirrorStepInvocation(parsed.code)
    if (step !== undefined) {
      const description = typeof parsed.description === 'string' ? parsed.description : undefined
      return { tool: step.tool, transport: name, arguments: description === undefined ? {} : { Description: description }, malformed: false, raw: rawArguments }
    }
  }
  return { tool: name, arguments: raw, malformed: parsed === undefined, raw: rawArguments }
}

/** The command line this call ran, when it reported one. agy also uses `Command`. */
export function presentedCommand(call: PresentedCall): string | undefined {
  return pickString(call.arguments, ['CommandLine', 'command_line', 'Command', 'command', 'Cmd', 'cmd'])
}

/** The file path this call addressed, when it reported one. */
export function presentedPath(call: PresentedCall): string | undefined {
  return pickString(call.arguments, ['AbsolutePath', 'absolute_path', 'TargetFile', 'target_file', 'path', 'file_path',
    'filename', 'Path', 'FilePath', 'FileName', 'targetFile'])
}

/** A human preview the route attached (agy's `Description`/`toolAction`). */
export function presentedDescription(call: PresentedCall): string | undefined {
  return pickString(call.arguments, ['Description', 'description', 'toolAction', 'toolSummary', 'Instruction', 'instruction'])
}

/** A search pattern or directory this call reported. */
export function presentedQuery(call: PresentedCall): string | undefined {
  return pickString(call.arguments, ['pattern', 'Pattern', 'query', 'Query', 'regex', 'Regex', 'QueryString', 'SearchDirectory', 'directory'])
}

/** The working directory the route reported, when it was not the session's own. */
export function presentedCwd(call: PresentedCall): string | undefined {
  return pickString(call.arguments, ['Cwd', 'cwd', 'WorkingDirectory', 'working_directory', 'workdir', 'WorkDir'])
}

/** Whether this call is a shell command, so the renderer uses a terminal card. */
export function presentsTerminal(call: PresentedCall): boolean {
  return AGY_TERMINAL_TOOLS.has(call.tool) || HOST_TERMINAL_TOOLS.has(call.tool)
}

/**
 * The exit code a terminal step really reported, in that producer's own format:
 * agy writes `The command exited with code N` / `[exit code N]` inside the
 * recorded output; this Host's shell tools end the output with `[exit code: N]`.
 * Anything else — a read/view/search result quoting such a line — has no terminal
 * status, so the card falls back to `isError` and never invents a failure.
 */
export function presentedExitCode(call: PresentedCall, output: string): number | undefined {
  // A bridge route reports steps from its own agent, so its inner shell tool keeps
  // agy's format even when it is named like a Host tool; the adapter reads exactly
  // these two shapes.
  if (call.transport !== undefined) {
    if (!AGY_TERMINAL_TOOLS.has(call.tool)) return undefined
    const match = /The command exited with code (\d+)/i.exec(output) ?? /\[exit code (\d+)\]/i.exec(output)
    return match?.[1] === undefined ? undefined : Number(match[1])
  }
  // Host tools keep their original rule: this Host appends the marker as the last
  // line, so a quoted marker inside command output is not mistaken for the status.
  if (HOST_TERMINAL_TOOLS.has(call.tool)) {
    const match = /\n\[exit code: (\d+)\]\s*$/.exec(output)
    return match?.[1] === undefined ? undefined : Number(match[1])
  }
  return undefined
}
