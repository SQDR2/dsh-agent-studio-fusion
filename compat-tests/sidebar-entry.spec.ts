import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { act, create } from 'react-test-renderer'
import { Context } from '@deepseek-ai/cordis'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  DiffBlock: () => null,
  TerminalBlock: () => null,
}))

import { apply, FUSION_PANEL_ID, FusionPanelIcon, inject, name } from '../src/client/index.js'
import { FusionSettings } from '../src/client/FusionSettings.js'

describe('Fusion sidebar entry client registration', () => {
  it('exports valid client plugin metadata', () => {
    expect(name).toBe('dsh-model-fusion/client')
    expect(inject).toContain('slots')
    expect(FUSION_PANEL_ID).toBe('fusion')
  })

  it('registers main panel and sidebar.panellist entry and omits settings.section', () => {
    const ctx = new Context()
    const injectedSlots = new Map<string, Array<() => unknown>>()
    const registeredEntries: Array<{ slotName: string; options: Record<string, unknown>; component: unknown }> = []

    // Mock slots service following Host slot contract
    const mockSlots = {
      inject: vi.fn((slotName: string, cb: () => unknown) => {
        const list = injectedSlots.get(slotName) ?? []
        list.push(cb)
        injectedSlots.set(slotName, list)
        return () => {}
      }),
      register: vi.fn((options: Record<string, unknown>, component: unknown) => {
        const slotName = options.name as string
        registeredEntries.push({ slotName, options, component })
        return () => {}
      }),
    }
    ctx.provide('slots', mockSlots as never)

    // Apply the client plugin
    apply(ctx)

    // Verification 1: declaration-aware inject calls were made for main and sidebar.panellist
    expect(mockSlots.inject).toHaveBeenCalledWith('main', expect.any(Function))
    expect(mockSlots.inject).toHaveBeenCalledWith('sidebar.panellist', expect.any(Function))

    // Verification 2: settings.section was NOT injected or registered
    expect(mockSlots.inject).not.toHaveBeenCalledWith('settings.section', expect.any(Function))
    expect(injectedSlots.has('settings.section')).toBe(false)

    // Trigger declaration callbacks as host does when declaring the slots
    const mainCallbacks = injectedSlots.get('main') ?? []
    expect(mainCallbacks.length).toBeGreaterThan(0)
    for (const cb of mainCallbacks) cb()

    const sidebarCallbacks = injectedSlots.get('sidebar.panellist') ?? []
    expect(sidebarCallbacks.length).toBeGreaterThan(0)
    for (const cb of sidebarCallbacks) cb()

    // Verification 3: main panel registration has key 'fusion' and body FusionSettings
    const mainEntry = registeredEntries.find(e => e.slotName === 'main')
    expect(mainEntry).toBeDefined()
    expect(mainEntry?.options.key).toBe(FUSION_PANEL_ID)
    expect(mainEntry?.component).toBe(FusionSettings)

    // Verification 4: sidebar list entry has id 'fusion', label 'Fusion', and component FusionPanelIcon
    const sidebarEntry = registeredEntries.find(e => e.slotName === 'sidebar.panellist')
    expect(sidebarEntry).toBeDefined()
    expect(sidebarEntry?.options.id).toBe(FUSION_PANEL_ID)
    expect(typeof sidebarEntry?.options.label).toBe('function')
    const labelFn = sidebarEntry?.options.label as () => string
    expect(labelFn()).toBe('Fusion')
    expect(sidebarEntry?.component).toBe(FusionPanelIcon)

    // Verification 5: order is placed after Memory System (30) and built-ins (0, 10)
    const order = sidebarEntry?.options.order as number
    expect(typeof order).toBe('number')
    expect(order).toBe(40)
    expect(order).toBeGreaterThan(30) // Below Memory System (order 30)
    expect(order).toBeGreaterThan(10) // Below built-in Schedules (order 10)
    expect(order).toBeGreaterThan(0)  // Below built-in Plugins (order 0)

    // Verification 6: absolutely no settings.section entries registered
    const settingsEntry = registeredEntries.find(e => e.slotName === 'settings.section')
    expect(settingsEntry).toBeUndefined()
  })

  it('renders an accessible, compact icon for the sidebar row', () => {
    let root!: ReturnType<typeof create>
    act(() => {
      root = create(React.createElement(FusionPanelIcon, { size: 16, active: false }))
    })

    const json = root.toJSON() as {
      type: string
      props: Record<string, unknown>
      children: unknown[]
    }
    expect(json.type).toBe('svg')
    expect(json.props['role']).toBe('img')
    expect(json.props['aria-label']).toBe('Fusion')
    expect(json.props['aria-hidden']).toBe('true')
    expect(json.props['viewBox']).toBe('0 0 16 16')
    expect(json.props['width']).toBe(16)
    expect(json.props['height']).toBe(16)
    expect(json.props['strokeWidth']).toBe(1.2)

    root.unmount()

    // Test with active = true and size = 18 (collapsed rail vs wide sidebar sizes)
    act(() => {
      root = create(React.createElement(FusionPanelIcon, { size: 18, active: true }))
    })
    const activeJson = root.toJSON() as {
      type: string
      props: Record<string, unknown>
      children: unknown[]
    }
    expect(activeJson.props['width']).toBe(18)
    expect(activeJson.props['height']).toBe(18)
    expect(activeJson.props['strokeWidth']).toBe(1.5)

    root.unmount()
  })
})
