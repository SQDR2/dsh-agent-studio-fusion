/**
 * The Foreman's inspection surface.
 *
 * A plan review is worth something only when the reviewer has looked at the repository the
 * plan talks about: a verdict reached from the plan text alone cannot tell a correct brief
 * from a confident one. So the reviewer gets the same inspection tools the Lead uses (`read`,
 * `grep`, `glob`), executed by the Host itself against the frozen workspace root, plus the
 * Host's own shell so it can check an acceptance claim by running it.
 *
 * The Host runs the file tools, not a model, and it runs them with no writer: there is no
 * write, edit or patch tool here, and every path is resolved through the workspace guard,
 * which refuses `..`, absolute paths outside the root, and any link that would leave it.
 * Nothing bounds how much the reviewer may read; the real limits are the review timeout and
 * the model's own context window. The shell runs in the session's own sandbox mode, the user's,
 * exactly like the Sidekick's: "audit, do not modify" is a prompt rule for a model that
 * follows instructions, not a second sandbox.
 */
import { lstatSync, readdirSync, readFileSync, statSync } from 'node:fs'
import type { Stats } from 'node:fs'
import { isAbsolute, join, relative, sep } from 'node:path'
import type { ToolSchema } from '@deepseek-ai/dsh-llm'
import type { ForemanAssessment, ForemanCitation, ForemanFinding } from '../contracts.js'
import { sha256Hex } from '../digest.js'
import { nativeShellTool } from './shell.js'
import { executeSingleTool, type ScopedToolService } from './tool-seam.js'
import { workspacePath, workspaceRelative } from './workspace.js'

/**
 * Directories that are never source evidence for a review.
 *
 * The same judgement the workspace snapshot makes: version-control internals, installed
 * dependencies and tool caches hold no code the plan is about, and walking them would turn
 * one `grep` into a filesystem-wide scan. This is a scoping rule, not a content cap.
 */
const SEARCH_EXCLUSIONS: readonly string[] = [
  '.git', 'node_modules', '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache',
  '.venv', 'venv', '.tox', '.nox', '.eggs', '.gradle', '.next', '.turbo', '.cache',
]

/** The default window of one `read`, matching the Lead's own default. */
export const FOREMAN_READ_DEFAULT_LIMIT = 2000

/**
 * How long one command may run inside a review.
 *
 * The reviewer is given the Host's shell so it can check an acceptance claim instead of
 * trusting it, and until now nothing bounded a single command: the review's wall clock was the
 * only thing that could end one, so an accidental `find /` or a command waiting on input ran
 * until the whole review was killed — taking the completed turns with it.
 *
 * The clock now grows with the work a review demonstrates, which makes that gap worse rather
 * than better: a command that produces nothing would be paid for by the calls around it. So
 * each command gets its own ceiling, and the review says which limit stopped it. Two minutes is
 * generous against the observed work: the reviews that completed their checks ran `pnpm build`
 * in 4.9s, and the one runaway command was a filesystem-wide `find` measured at 52.5s.
 */
export const FOREMAN_COMMAND_TIMEOUT_MS = 120_000

/** A file larger than this is inspected as a binary candidate, not parsed as source. */
const BINARY_PROBE_BYTES = 8192

/**
 * The reviewer's whole tool table: three inspectors and the Host's shell.
 *
 * The shell is what lets a review check an acceptance claim instead of trusting it — run the
 * test, run the linter, read the exit status. It runs in the session's own sandbox mode, the
 * one the user chose, exactly like the Sidekick's; "audit only, never modify" is a prompt-level
 * rule for a model that follows instructions, not a second sandbox.
 */
export function foremanToolSchemas(): readonly ToolSchema[] {
  return [
    {
      name: 'read',
      description: 'Read a UTF-8 text file and return line-numbered content. Use offset and limit to read a line range or continue a large file.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['file_path'],
        properties: {
          file_path: { type: 'string', description: 'Workspace-relative path to read; an absolute path must be inside the workspace.' },
          offset: { type: 'integer', minimum: 1, description: 'First line to return, 1-based. Defaults to 1.' },
          limit: { type: 'integer', minimum: 1, description: `Maximum number of lines to return. Defaults to ${FOREMAN_READ_DEFAULT_LIMIT}.` },
        },
      },
    },
    {
      name: 'grep',
      description: 'Search file contents with a regular expression. Returns matching lines with line numbers, grouped by file.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['pattern'],
        properties: {
          pattern: { type: 'string', description: 'Regular expression to search for.' },
          path: { type: 'string', description: 'File or directory to search, workspace-relative. Defaults to the workspace root.' },
          include: { type: 'string', description: 'One glob filter for which files to search (e.g. "*.ts"). Not a list; negation is not supported.' },
        },
      },
    },
    {
      name: 'glob',
      description: 'Find files, not directories, whose workspace-relative paths match a glob pattern. Returns paths in modification-time order.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['pattern'],
        properties: {
          pattern: {
            type: 'string',
            description: 'Glob pattern (e.g. "**/*.ts", "src/**/*.test.js"). A pattern with no "/" matches the basename at any depth.',
          },
          path: { type: 'string', description: 'Directory to search in, workspace-relative. Defaults to the workspace root.' },
        },
      },
    },
    {
      name: nativeShellTool,
      description: 'Run a shell command in the project root and return its output and exit code. Use it to check an acceptance claim: run the test, the linter, the build. '
        + 'You are auditing, not repairing: do not use it to change the workspace.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['command', 'description'],
        properties: {
          command: { type: 'string', description: 'The command to execute.' },
          description: { type: 'string', description: 'Clear, concise description of what this command does in active voice, 5-10 words.' },
        },
      },
    },
  ]
}

/** One settled tool call, in the shape a tool-result message needs. */
export interface ForemanToolResult {
  readonly text: string
  readonly isError: boolean
}

/** Everything a tool call needs: the frozen root, the Host runtime for the shell, and the caller's identity. */
export interface ForemanToolHost {
  /** Realpath of the frozen workspace root; undefined when the session has no workspace. */
  readonly root: string | undefined
  /** `ctx.tools`, used only for the shell tool the Host itself registers. */
  readonly tools: ScopedToolService | undefined
  readonly agent: unknown
  readonly signal: AbortSignal | undefined
  /** Call id prefix, so a shell dispatch is attributable in the Host's own logs. */
  readonly callIdPrefix: string
  /** Monotonic counter for shell call ids. */
  readonly nextCallId: () => string
  /**
   * Override for {@link FOREMAN_COMMAND_TIMEOUT_MS}.
   *
   * Only a test passes this: the limit is the Host's, not the model's, and a test cannot wait
   * two minutes to observe it. Production calls leave it unset.
   */
  readonly commandTimeoutMs?: number
}

class ForemanToolError extends Error {}

/** Strict JSON-object argument read: a tool call is data, never a place to guess. */
function argumentObject(raw: string): Record<string, unknown> {
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch (error) {
    throw new ForemanToolError(`arguments must be a JSON object: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new ForemanToolError('arguments must be a JSON object')
  return parsed as Record<string, unknown>
}

function assertKeys(args: Record<string, unknown>, allowed: readonly string[], tool: string): void {
  for (const key of Object.keys(args)) {
    if (!allowed.includes(key)) throw new ForemanToolError(`${tool}: unknown argument "${key}"; allowed: ${allowed.join(', ')}`)
  }
}

function requiredString(args: Record<string, unknown>, key: string, tool: string): string {
  const value = args[key]
  if (typeof value !== 'string' || value.trim() === '') throw new ForemanToolError(`${tool}: ${key} must be a non-empty string`)
  return value
}

function optionalPositiveInteger(args: Record<string, unknown>, key: string, tool: string): number | undefined {
  const value = args[key]
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new ForemanToolError(`${tool}: ${key} must be a positive integer`)
  }
  return value
}

/**
 * Resolve one model-supplied path against the frozen root.
 *
 * Three rejections, each for a reason a review depends on: a path that escapes the root is
 * not part of the plan's workspace; an absolute path outside it is the same escape spelled
 * differently; a non-regular file (a directory, a socket, a device, a symlink) is not bytes
 * a citation can point at.
 */
function resolveForemanPath(root: string, raw: string, kind: 'file' | 'directory' | 'any', tool: string): string {
  if (raw.includes('\0')) throw new ForemanToolError(`${tool}: path contains a NUL byte`)
  const rel = isAbsolute(raw) ? workspaceRelative(root, raw) : raw
  if (rel === undefined) throw new ForemanToolError(`${tool}: path "${raw}" is outside the review workspace`)
  let absolute: string
  try { absolute = workspacePath(root, rel) } catch (error) {
    throw new ForemanToolError(`${tool}: path "${raw}" is rejected: ${error instanceof Error ? error.message : String(error)}`)
  }
  let stat: Stats
  try { stat = lstatSync(absolute) } catch { throw new ForemanToolError(`${tool}: path "${raw}" does not exist in the review workspace`) }
  if (stat.isSymbolicLink()) throw new ForemanToolError(`${tool}: path "${raw}" is a symlink, not a regular file`)
  if (kind === 'file' && !stat.isFile()) throw new ForemanToolError(`${tool}: path "${raw}" is not a regular file`)
  if (kind === 'directory' && !stat.isDirectory()) throw new ForemanToolError(`${tool}: path "${raw}" is not a directory`)
  if (kind === 'any' && !stat.isFile() && !stat.isDirectory()) throw new ForemanToolError(`${tool}: path "${raw}" is not a regular file or directory`)
  return absolute
}

/** Lines of one UTF-8 file, with a trailing newline not counted as an extra empty line. */
function fileLines(text: string): string[] {
  const lines = text.split('\n')
  if (lines.at(-1) === '') lines.pop()
  return lines
}

/** `read`: the same line-numbered window and footer the Lead's own read tool returns. */
function readFile(root: string, args: Record<string, unknown>): string {
  assertKeys(args, ['file_path', 'offset', 'limit'], 'read')
  const raw = requiredString(args, 'file_path', 'read')
  const offset = optionalPositiveInteger(args, 'offset', 'read') ?? 1
  const limit = optionalPositiveInteger(args, 'limit', 'read') ?? FOREMAN_READ_DEFAULT_LIMIT
  const absolute = resolveForemanPath(root, raw, 'file', 'read')
  const lines = fileLines(readFileSync(absolute, 'utf8'))
  const window = lines.slice(offset - 1, offset - 1 + limit)
  const endLine = window.length > 0 ? offset + window.length - 1 : Math.max(0, offset - 1)
  const footer = endLine < lines.length
    ? `(Showing lines ${offset}-${endLine} of ${lines.length}. Use offset=${endLine + 1} to continue.)`
    : `(End of file - total ${lines.length} lines)`
  const body = window.length > 0 ? `${window.map((line, index) => `${offset + index}: ${line}`).join('\n')}\n\n${footer}` : footer
  return `<path>${raw}</path>
<type>file</type>
<content>
${body}
</content>`
}

/** Every regular file under one root, skipping the directories that hold no source. */
function walkFiles(root: string): string[] {
  const files: string[] = []
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        if (!SEARCH_EXCLUSIONS.includes(entry.name)) visit(absolute)
      } else if (entry.isFile()) files.push(absolute)
    }
  }
  visit(root)
  return files
}

/** A file that looks binary is inspected by `read` if the reviewer names it, but never grepped. */
function looksBinary(absolute: string): boolean {
  try {
    const probe = readFileSync(absolute).subarray(0, BINARY_PROBE_BYTES)
    return probe.includes(0)
  } catch { return true }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.+^${}()|[\]\\]/g, '\\$&')
}

/**
 * One glob pattern as a path regex.
 *
 * The rules are the ones the Lead's `glob` documents: `**` crosses directories, `*` and `?`
 * stay inside one path segment, `{a,b}` is a choice, and a pattern without a separator matches
 * the basename at any depth.
 */
export function globToRegExp(pattern: string): RegExp {
  const anchored = pattern.includes('/')
  let source = ''
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index]!
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        // `**/` also matches zero directories, so `**/*.ts` finds `a.ts` at the root.
        if (pattern[index + 2] === '/') { source += '(?:.*/)?'; index += 2 } else { source += '.*'; index += 1 }
      } else source += '[^/]*'
    } else if (char === '?') source += '[^/]'
    else if (char === '{') {
      const end = pattern.indexOf('}', index)
      if (end === -1) source += '\\{'
      else {
        source += `(?:${pattern.slice(index + 1, end).split(',').map(escapeRegExp).join('|')})`
        index = end
      }
    } else if (char === '/') source += '/'
    else source += escapeRegExp(char)
  }
  return new RegExp(anchored ? `^${source}$` : `^(?:.*/)?${source}$`)
}

/** `grep`: every matching line, grouped by file, with the count the Lead's tool reports. */
function grepFiles(root: string, args: Record<string, unknown>): string {
  assertKeys(args, ['pattern', 'path', 'include'], 'grep')
  const pattern = requiredString(args, 'pattern', 'grep')
  let expression: RegExp
  try { expression = new RegExp(pattern) } catch (error) {
    throw new ForemanToolError(`grep: invalid regular expression: ${error instanceof Error ? error.message : String(error)}`)
  }
  const include = args.include === undefined ? undefined : requiredString(args, 'include', 'grep')
  const includeExpression = include === undefined ? undefined : globToRegExp(include)
  const target = args.path === undefined ? root : resolveForemanPath(root, requiredString(args, 'path', 'grep'), 'any', 'grep')
  const files = statSync(target).isDirectory() ? walkFiles(target) : [target]
  const matches = new Map<string, { line: number; text: string }[]>()
  let seen = 0
  for (const absolute of files) {
    const rel = relative(root, absolute).split(sep).join('/')
    if (includeExpression !== undefined && !includeExpression.test(rel)) continue
    if (looksBinary(absolute)) continue
    const lines = fileLines(readFileSync(absolute, 'utf8'))
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index]!
      expression.lastIndex = 0
      if (!expression.test(line)) continue
      seen++
      const group = matches.get(rel) ?? []
      group.push({ line: index + 1, text: line })
      matches.set(rel, group)
    }
  }
  if (seen === 0) return 'No matches found'
  const sections = [...matches.entries()].map(([path, group]) =>
    `${path}\n${group.map(match => `Line ${match.line}: ${match.text}`).join('\n')}`)
  return `Found ${seen} ${seen === 1 ? 'match' : 'matches'}\n\n${sections.join('\n\n')}`
}

/** `glob`: matching files, newest first, relative to the root. */
function globFiles(root: string, args: Record<string, unknown>): string {
  assertKeys(args, ['pattern', 'path'], 'glob')
  const pattern = requiredString(args, 'pattern', 'glob')
  const directory = args.path === undefined ? root : resolveForemanPath(root, requiredString(args, 'path', 'glob'), 'directory', 'glob')
  const expression = globToRegExp(pattern)
  const found: { path: string; mtime: number }[] = []
  for (const absolute of walkFiles(directory)) {
    const rel = relative(root, absolute).split(sep).join('/')
    if (!expression.test(rel)) continue
    found.push({ path: rel, mtime: statSync(absolute).mtimeMs })
  }
  if (found.length === 0) return 'No files found'
  found.sort((left, right) => right.mtime - left.mtime || left.path.localeCompare(right.path))
  return found.map(item => item.path).join('\n')
}

/**
 * Run one reviewer tool call.
 *
 * A rejected call is a tool error, not a failed review: the message goes back to the model,
 * which can correct the path or the arguments and try again. Only the citation check below
 * can invalidate a whole assessment.
 */
export async function executeForemanTool(name: string, rawArguments: string, host: ForemanToolHost): Promise<ForemanToolResult> {
  try {
    const { root } = host
    if (name !== nativeShellTool && root === undefined) {
      return { text: `${name}: this review has no workspace root, so the file tools are unavailable`, isError: true }
    }
    const args = argumentObject(rawArguments)
    if (name === 'read') return { text: readFile(root!, args), isError: false }
    if (name === 'grep') return { text: grepFiles(root!, args), isError: false }
    if (name === 'glob') return { text: globFiles(root!, args), isError: false }
    if (name === nativeShellTool) {
      assertKeys(args, ['command', 'description'], nativeShellTool)
      const command = requiredString(args, 'command', nativeShellTool)
      const description = requiredString(args, 'description', nativeShellTool)
      if (!host.tools) return { text: `${nativeShellTool}: this Host exposes no tool runtime, so commands are unavailable`, isError: true }
      // The reviewer may not raise its own limit: its schema carries `command` and
      // `description` only, so this ceiling is the Host's, not the model's.
      const limitMs = host.commandTimeoutMs ?? FOREMAN_COMMAND_TIMEOUT_MS
      const commandTimeout = AbortSignal.timeout(limitMs)
      const signal = host.signal === undefined ? commandTimeout : AbortSignal.any([host.signal, commandTimeout])
      const limited = (): boolean => commandTimeout.aborted && host.signal?.aborted !== true
      const limitNote = `${nativeShellTool}: this command hit the ${limitMs}ms limit one review command may run; narrow it to the files this finding depends on`
      let outcome
      try {
        outcome = await executeSingleTool(host.tools, {
          name: nativeShellTool, arguments: { command, description }, agent: host.agent,
          callId: `${host.callIdPrefix}-${host.nextCallId()}`, signal,
        })
      } catch (error) {
        // The command runtime reports a cancelled command as a plain failure; naming this
        // limit keeps it out of "the shell is broken", where it would hide the real cause.
        if (limited()) return { text: limitNote, isError: true }
        throw error
      }
      const text = outcome.content.map((block) => {
        const typed = block as { type?: string; text?: string }
        return typed.type === 'text' ? typed.text ?? '' : ''
      }).join('')
      const body = text === '' ? '(no output)' : text
      return limited()
        ? { text: `${body}\n\n(${limitNote})`, isError: true }
        : { text: body, isError: outcome.isError }
    }
    return { text: `Unknown tool "${name}": this review may use read, grep, glob and ${nativeShellTool} only`, isError: true }
  } catch (error) {
    return { text: `${name}: ${error instanceof Error ? error.message : String(error)}`, isError: true }
  }
}

/** A finding list whose citations the Host has to check (and then digest-stamp). */
function citeFindings(findings: readonly ForemanFinding[], digestOfPath: (path: string) => string): ForemanFinding[] {
  return findings.map(finding => finding.evidence === undefined
    ? finding
    : { ...finding, evidence: finding.evidence.map(citation => cited(citation, digestOfPath(citation.path))) })
}

function cited(citation: ForemanCitation, digest: string): ForemanCitation {
  return { path: citation.path, startLine: citation.startLine, endLine: citation.endLine, digest: digest as ForemanCitation['digest'] }
}

/**
 * Check every citation in an assessment, then record the digest of each cited range.
 *
 * The verdict is only worth the code it names, so a citation that does not resolve discards
 * the whole assessment instead of being dropped: a review that cites one file it never opened
 * has told us its other claims are equally unchecked. The digest is recorded on the citation
 * so the persisted record proves which revision of those bytes the reviewer read, even after
 * the file changes underneath it.
 */
export function verifyForemanCitations(assessment: ForemanAssessment, root: string | undefined):
{ ok: true; assessment: ForemanAssessment } | { ok: false; reason: string } {
  if (root === undefined) {
    return { ok: false, reason: 'Foreman cited code but this review has no workspace root to check it against; the assessment was discarded' }
  }
  const findings = [
    ...assessment.acceptanceAudit.uncoveredRequirements, ...assessment.acceptanceAudit.weakOracles,
    ...assessment.acceptanceAudit.falseGreenScenarios, ...assessment.decisionChallenges.unsupportedDecisions,
    ...assessment.decisionChallenges.counterexamples, ...assessment.decisionChallenges.unresolvedCriticalAssumptions,
    ...assessment.materialAmbiguities,
  ]
  const digests = new Map<string, string>()
  const problems: string[] = []
  /** Resolve one cited range; returns the reason it does not resolve. */
  const check = (citation: ForemanCitation): string | undefined => {
    if (isAbsolute(citation.path)) return 'the path is absolute, and citations are workspace-relative'
    let absolute: string
    try { absolute = workspacePath(root, citation.path) } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
    let lines: string[]
    try {
      if (!lstatSync(absolute).isFile()) return 'the path is not a regular file'
      lines = fileLines(readFileSync(absolute, 'utf8'))
    } catch { return 'the file does not exist' }
    if (citation.endLine > lines.length) return `the file has ${lines.length} lines, so the range is not in it`
    if (!digests.has(citation.path)) digests.set(citation.path, sha256Hex(readFileSync(absolute)))
    return undefined
  }
  const verify = (citation: ForemanCitation, where: string): void => {
    const problem = check(citation)
    if (problem !== undefined) problems.push(`${where} cites ${citation.path}:${citation.startLine}-${citation.endLine}, which does not resolve: ${problem}`)
  }
  for (const finding of findings) for (const citation of finding.evidence ?? []) verify(citation, `finding "${finding.id}"`)
  for (const citation of assessment.inspected ?? []) verify(citation, 'inspected')
  if (problems.length > 0) {
    return { ok: false, reason: `${problems.join('; ')}. The whole assessment was discarded because its verdict is not bound to code that exists.` }
  }
  const digestOfPath = (path: string): string => digests.get(path)!
  return {
    ok: true,
    assessment: {
      ...assessment,
      ...(assessment.inspected === undefined ? {}
        : { inspected: assessment.inspected.map(citation => cited(citation, digestOfPath(citation.path))) }),
      acceptanceAudit: {
        uncoveredRequirements: citeFindings(assessment.acceptanceAudit.uncoveredRequirements, digestOfPath),
        weakOracles: citeFindings(assessment.acceptanceAudit.weakOracles, digestOfPath),
        falseGreenScenarios: citeFindings(assessment.acceptanceAudit.falseGreenScenarios, digestOfPath),
      },
      decisionChallenges: {
        unsupportedDecisions: citeFindings(assessment.decisionChallenges.unsupportedDecisions, digestOfPath),
        counterexamples: citeFindings(assessment.decisionChallenges.counterexamples, digestOfPath),
        unresolvedCriticalAssumptions: citeFindings(assessment.decisionChallenges.unresolvedCriticalAssumptions, digestOfPath),
      },
      materialAmbiguities: citeFindings(assessment.materialAmbiguities, digestOfPath),
    },
  }
}
