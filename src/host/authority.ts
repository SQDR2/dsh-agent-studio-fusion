/**
 * Authority actions are the Lead's and the user's, not a consequence of holding
 * the workspace write lease. `allowedPaths` bounds file edits; it says nothing
 * about `git commit`, `git push`, a pull request, a publish or a CI run, which
 * all leave the workspace (or rewrite its history) and cannot be reviewed
 * afterwards. Devin states the same split in its Sidekick framing ("does not
 * own commits, pushes, pull requests or CI"); this module is the Host-side
 * enforcement of it, the same way the Lead's read-only sandbox enforces the
 * Lead's half.
 *
 * The Worker stays able to do the work the user asked for inside the lease. What
 * it may not do is decide that the change is ready to publish. A refused action
 * must therefore be reported, not worked around: the Worker submits its report
 * with the action listed as pending, and the Lead performs it (or grants it
 * explicitly for this work order, which only the Lead can do and which the user's
 * request has to justify).
 *
 * This is a command-line guard, not a sandbox. It reads the shell text: quoted
 * literal data (`grep -r 'git push' docs`) is not a command and is allowed, a
 * shell invoked as `bash -c "<text>"` is scanned recursively, and the common
 * launchers (`sudo`, `env`, `xargs`, `time`, ...) are looked through. A process
 * that builds its command at runtime (`python -c`, a script read from stdin) is
 * outside what a text guard can see; that residual gap is deliberate scope, not
 * an oversight, and it is why the prompt states the rule as well.
 */
import type { AuthorityAction } from '../contracts.js'

/** Every action the Host can grant, and refuse without a grant. */
export const AUTHORITY_ACTIONS: readonly AuthorityAction[] = ['commit', 'push', 'tag', 'publish', 'release', 'pr', 'ci']

/** Stable prefix so a refusal is attributable in a report and in a test. */
export const AUTHORITY_DENIED = 'FUSION_WORKER_AUTHORITY_DENIED'

interface Token {
  readonly value: string
  /** True when the whole token came from quoted text: literal data, never a command word. */
  readonly quoted: boolean
}

/** Launchers that run the command named after their own options. */
const WRAPPERS = new Set(['sudo', 'doas', 'command', 'exec', 'env', 'nohup', 'time', 'nice', 'stdbuf', 'builtin', 'xargs'])

/** Wrapper options that consume the following token, so the command word is not mistaken for an argument. */
const WRAPPER_VALUE_FLAGS = new Set(['-u', '-g', '-n', '-C', '-p', '-s'])

/** Shells whose `-c`/`-Command` argument is a command, not data. */
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'fish', 'pwsh', 'powershell', 'cmd'])

/** Git global options that consume the following token before the subcommand. */
const GIT_VALUE_FLAGS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--super-prefix', '--config-env'])

/** `gh` options that consume the following token. */
const GH_VALUE_FLAGS = new Set(['-R', '--repo', '--hostname', '-p', '--profile'])

const basename = (word: string): string => {
  const name = word.replace(/\\/g, '/').split('/').pop() ?? ''
  return name.toLowerCase().replace(/\.(exe|cmd|bat)$/, '')
}

/**
 * Split shell text into command segments of tokens. Unquoted separators start a
 * segment; inside double quotes only a command substitution can, because that is
 * the one construct there that still runs a command. Single quotes are literal.
 */
export function shellSegments(text: string): Token[][] {
  const segments: Token[][] = []
  let tokens: Token[] = []
  let value = ''
  let quoted = false
  let started = false
  let quote: '"' | "'" | null = null
  const endToken = () => {
    if (!started) return
    tokens.push({ value, quoted: quote === null && quoted })
    value = ''; quoted = false; started = false
  }
  const endSegment = () => { endToken(); if (tokens.length) segments.push(tokens); tokens = [] }
  for (let index = 0; index < text.length; index++) {
    const character = text[index]!
    if (quote === "'") {
      if (character === "'") quote = null
      else { value += character; started = true }
      continue
    }
    if (quote === '"') {
      if (character === '\\' && index + 1 < text.length && '"\\$`'.includes(text[index + 1]!)) {
        value += text[++index]!
        started = true
        continue
      }
      if (character === '"') { quote = null; continue }
      // A substitution inside double quotes still runs its own shell code.
      if (character === '$' && text[index + 1] === '(') { endSegment(); quote = null; index++; continue }
      if (character === '`') { endSegment(); quote = null; continue }
      value += character
      started = true
      continue
    }
    if (character === ' ' || character === '\t' || character === '\r') { endToken(); continue }
    if ('\n;&|()`'.includes(character) || (character === '$' && text[index + 1] === '(')) {
      // A dollar-paren opens a nested command, whose text ends at the next separator.
      if (character === '$') index++
      endSegment()
      continue
    }
    if (character === "'" || character === '"') { quote = character; started = true; continue }
    if (character === '\\' && index + 1 < text.length) { value += text[++index]!; started = true; continue }
    value += character
    started = true
  }
  endSegment()
  return segments
}

const flag = (value: string, name: string) => value === name || value.startsWith(`${name}=`)

/** The subcommand after `git`, or undefined when the invocation is read-only. */
function gitAction(tokens: readonly Token[], start: number): AuthorityAction | undefined {
  let index = start
  while (index < tokens.length) {
    const token = tokens[index]!
    if (token.quoted || !token.value.startsWith('-')) break
    if (flag(token.value, '--version') || flag(token.value, '--help') || token.value === '-v' || token.value === '-h') return undefined
    index += GIT_VALUE_FLAGS.has(token.value) ? 2 : 1
  }
  const subcommand = tokens[index]?.value.toLowerCase()
  if (!subcommand) return undefined
  if (subcommand === 'commit') return 'commit'
  if (subcommand === 'push') return 'push'
  if (subcommand === 'tag') {
    // Listing tags is a read; creating (or deleting) one is a published, immutable marker.
    const rest = tokens.slice(index + 1)
    if (!rest.length) return undefined
    const listing = rest.some(token => ['-l', '--list', '-n', '--contains', '--points-at', '--merged', '--no-merged', '-i', '--ignore-case'].includes(token.value)
      || /^--(sort|format|contains|points-at|merged|no-merged)=/.test(token.value) || /^-n\d/.test(token.value))
    return listing ? undefined : 'tag'
  }
  return undefined
}

function ghAction(tokens: readonly Token[], start: number): AuthorityAction | undefined {
  let index = start
  while (index < tokens.length) {
    const token = tokens[index]!
    if (token.quoted || !token.value.startsWith('-')) break
    index += GH_VALUE_FLAGS.has(token.value) ? 2 : 1
  }
  const group = tokens[index]?.value.toLowerCase(), verb = tokens[index + 1]?.value.toLowerCase()
  if (group === 'pr' && ['create', 'merge', 'edit', 'close', 'reopen', 'ready', 'revert'].includes(verb ?? '')) return 'pr'
  if (group === 'release' && ['create', 'edit', 'delete', 'upload'].includes(verb ?? '')) return 'release'
  if (group === 'workflow' && ['run', 'enable', 'disable'].includes(verb ?? '')) return 'ci'
  if (group === 'run' && tokens.slice(index + 1).some(token => ['-R', '--repo'].includes(token.value))) return 'ci'
  return undefined
}

const PACKAGERS = new Set(['npm', 'pnpm', 'yarn', 'bun'])

function packageAction(command: string, tokens: readonly Token[], start: number): AuthorityAction | undefined {
  // `git` and `gh` have global options that take a value; they parse their own tail.
  if (command === 'git') return gitAction(tokens, start)
  if (command === 'gh') return ghAction(tokens, start)
  let index = start
  while (index < tokens.length && !tokens[index]!.quoted && tokens[index]!.value.startsWith('-')) index++
  const subcommand = tokens[index]?.value.toLowerCase()
  if (PACKAGERS.has(command) && subcommand === 'publish') return 'publish'
  if (command === 'cargo' && subcommand === 'publish') return 'publish'
  if (command === 'poetry' && subcommand === 'publish') return 'publish'
  if (command === 'twine' && subcommand === 'upload') return 'publish'
  if (command === 'goreleaser' && subcommand !== 'check') return 'release'
  return undefined
}

/** One segment's action, looking through launchers and into nested shell text. */
function segmentAction(tokens: readonly Token[]): AuthorityAction | undefined {
  let index = 0
  // `FOO=1 git push` and `env FOO=1 git push` both name the command after the assignments.
  const skipAssignments = () => {
    while (index < tokens.length && !tokens[index]!.quoted && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index]!.value)) index++
  }
  skipAssignments()
  for (;;) {
    const token = tokens[index]
    if (!token || token.quoted) return undefined
    const command = basename(token.value)
    if (SHELLS.has(command)) {
      const dashC = tokens.slice(index + 1).findIndex(other => !other.quoted && ['-c', '-command', '/c'].includes(other.value.toLowerCase()))
      const script = dashC >= 0 ? tokens[index + 1 + dashC + 1] : undefined
      if (!script) return undefined
      for (const nested of shellSegments(script.value)) {
        const action = segmentAction(nested)
        if (action) return action
      }
      return undefined
    }
    if (!WRAPPERS.has(command)) return packageAction(command, tokens, index + 1)
    index += 1
    while (index < tokens.length && !tokens[index]!.quoted && tokens[index]!.value.startsWith('-')) {
      index += WRAPPER_VALUE_FLAGS.has(tokens[index]!.value) ? 2 : 1
    }
    skipAssignments()
  }
}

/** Every authority action the shell text would run, in command order. */
export function authorityActions(text: string): AuthorityAction[] {
  const found: AuthorityAction[] = []
  for (const segment of shellSegments(text)) {
    const action = segmentAction(segment)
    if (action && !found.includes(action)) found.push(action)
  }
  return found
}

const LABELS: Record<AuthorityAction, string> = {
  commit: 'git commit', push: 'git push', tag: 'creating a git tag', publish: 'publishing a package',
  release: 'a release', pr: 'a pull request', ci: 'a CI run',
}

/**
 * A refusal for a Sidekick shell command that publishes or rewrites published
 * state without the Lead's grant; undefined when every action it runs is granted
 * or the command is ordinary work.
 */
export function workerAuthorityProblem(text: string, granted: readonly string[] = []): string | undefined {
  const refused = authorityActions(text).filter(action => !granted.includes(action))
  if (!refused.length) return undefined
  const what = refused.map(action => LABELS[action]).join(', ')
  return `${AUTHORITY_DENIED}: ${what} is a Lead authority action, not part of this work order's write lease. `
    + 'Finish the code changes, submit your report with fusion_submit_result, and state that this action is still pending. '
    + 'The Lead performs it, or grants it explicitly for this work order when the user asked for it.'
}
