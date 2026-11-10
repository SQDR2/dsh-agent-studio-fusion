import { describe, expect, it } from 'vitest'
import { isRead, READ_TOOL_NAMES } from '../src/host/read-tools.js'
import { projectRoleTools } from '../src/host/tool-table.js'

const tool = (name: string) => ({ name, description: name })

describe('Fusion read-only tool ceiling', () => {
  it('lets the Lead load a skill the session catalog advertises', () => {
    // `/grill-me` is user-invocable only: the Host injects its body, which says to
    // load `grilling` through the `skill` tool. Without `skill` in the Lead ceiling
    // the catalog is context the Lead cannot act on.
    expect(READ_TOOL_NAMES).toContain('skill')
    expect(isRead({ name: 'skill', arguments: { name: 'grilling' } })).toBe(true)
    expect(isRead({ name: 'write', arguments: { file_path: 'x' } })).toBe(false)
    expect(isRead({ name: 'str_replace_editor', arguments: { command: 'view' } })).toBe(true)
    expect(isRead({ name: 'str_replace_editor', arguments: { command: 'create' } })).toBe(false)
  })

  it('keeps skill in the projected Lead table and still drops writing tools', () => {
    const allowlist = [...READ_TOOL_NAMES, 'fusion_delegate']
    const registry = ['read', 'skill', 'write', 'edit', 'bash', 'fusion_delegate'].map(tool)
    const projected = projectRoleTools({ assembled: registry, allowlist, registry })
    expect(projected.tools.map(item => item.name)).toEqual(['read', 'skill', 'fusion_delegate'])
    expect(projected.missing).toEqual([])
  })
})
