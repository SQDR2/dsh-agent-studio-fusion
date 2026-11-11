import { describe, expect, it } from 'vitest'
import { AUTHORITY_ACTIONS, AUTHORITY_DENIED, authorityActions, shellSegments, workerAuthorityProblem } from '../src/host/authority.js'

const denied = (command: string, granted: readonly string[] = []) => workerAuthorityProblem(command, granted)

describe('Sidekick authority guard', () => {
  it('leaves read-only inspection and ordinary work alone', () => {
    for (const command of [
      'git status --short', 'git diff --stat', 'git log --oneline -5', 'git show HEAD', 'git rev-parse HEAD',
      'git -C . status', 'git tag -l "v*"', 'git tag', 'git branch --show-current', 'git stash list',
      'pnpm test', 'pnpm build', 'python3 -m unittest -v test_calc', 'cargo test',
      'npx tsc -p tsconfig.json --noEmit',
    ]) expect(denied(command), command).toBeUndefined()
    // Deliberately conservative: the grant is per action, so a rehearsal of a
    // publication action is refused like the action itself.
    expect(denied('git commit --dry-run')).toContain(AUTHORITY_DENIED)
  })

  it('names the action a publication command would run', () => {
    expect(authorityActions('git commit -m "fix"')).toEqual(['commit'])
    expect(authorityActions('git push origin main')).toEqual(['push'])
    expect(authorityActions('git push --force-with-lease')).toEqual(['push'])
    expect(authorityActions('git tag v1.0.0')).toEqual(['tag'])
    expect(authorityActions('gh pr create --fill')).toEqual(['pr'])
    expect(authorityActions('gh release create v1 notes.md')).toEqual(['release'])
    expect(authorityActions('gh workflow run publish.yml')).toEqual(['ci'])
    expect(authorityActions('npm publish')).toEqual(['publish'])
    expect(authorityActions('pnpm publish --access public')).toEqual(['publish'])
    expect(authorityActions('cargo publish')).toEqual(['publish'])
    expect(authorityActions('twine upload dist/*')).toEqual(['publish'])
  })

  it('reads globals, launchers, assignments and later segments', () => {
    expect(authorityActions('git -C /some/repo commit -m x')).toEqual(['commit'])
    expect(authorityActions('sudo git push')).toEqual(['push'])
    expect(authorityActions('env GIT_AUTHOR_NAME=x git commit -m y')).toEqual(['commit'])
    expect(authorityActions('time nice -n 5 git push')).toEqual(['push'])
    expect(authorityActions('FOO=1 git push')).toEqual(['push'])
    expect(authorityActions('pnpm test && git push origin main')).toEqual(['push'])
    expect(authorityActions('git status\ngit commit -m x')).toEqual(['commit'])
    expect(authorityActions('/usr/bin/git push')).toEqual(['push'])
  })

  it('scans nested shell text and command substitution, not quoted data', () => {
    expect(authorityActions('bash -c "git push origin main"')).toEqual(['push'])
    expect(authorityActions('sh -c \'git commit -m x\'')).toEqual(['commit'])
    expect(authorityActions('echo "$(git push)"')).toEqual(['push'])
    expect(authorityActions('git log --format="$(git rev-parse HEAD)"')).toEqual([])
    // Literal text a search or an echo carries is data, not a command.
    expect(denied('grep -rn "git push" docs/')).toBeUndefined()
    expect(denied('rg \'npm publish\' .')).toBeUndefined()
    expect(denied('echo "git commit -m x"')).toBeUndefined()
    expect(denied('git log --grep "commit and push"')).toBeUndefined()
  })

  it('refuses every ungranted action with a reportable reason', () => {
    const problem = denied('git commit -m x')
    expect(problem).toContain(AUTHORITY_DENIED)
    expect(problem).toContain('git commit')
    expect(problem).toContain('fusion_submit_result')

    expect(denied('pnpm test && git push && gh pr create --fill')).toContain('git push, a pull request')
  })

  it('allows exactly the granted actions and nothing else', () => {
    expect(denied('git commit -m x', ['commit'])).toBeUndefined()
    expect(denied('git commit -m x && git push', ['commit'])).toContain('git push')
    expect(denied('git push', ['commit'])).toContain(AUTHORITY_DENIED)
    expect(denied('gh pr create --fill', ['commit', 'push', 'tag', 'publish', 'release', 'pr'])).toBeUndefined()
  })

  it('keeps the action list and the segment splitter small and predictable', () => {
    expect([...AUTHORITY_ACTIONS]).toEqual(['commit', 'push', 'tag', 'publish', 'release', 'pr', 'ci'])
    expect(shellSegments('a "b c" $(d e)').map(segment => segment.map(token => token.value)))
      .toEqual([['a', 'b c'], ['d', 'e']])
  })
})
