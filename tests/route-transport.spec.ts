import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { isRouteTransportName, registeredRouteTransport, routeTransportName, withRouteTransport } from '../src/host/route-transport.js'

/** The only surface the module reads: a global tool lookup. */
const registry = (...names: string[]) => ({ tools: { get: (name: string) => names.includes(name) ? { name } : undefined } }) as unknown as Context

describe('route transport', () => {
  it('names the transport a bridge route needs and nothing else', () => {
    expect(routeTransportName('antigravity')).toBe('agy_tool')
    expect(routeTransportName('openai-completions')).toBeUndefined()
    expect(routeTransportName('')).toBeUndefined()
    expect(isRouteTransportName('agy_tool')).toBe(true)
    // A Code Mode wrapper is a tool the Worker may itself call, not a route transport.
    expect(isRouteTransportName('run_code')).toBe(false)
    expect(isRouteTransportName('read')).toBe(false)
  })

  it('only offers a transport this Host actually registered', () => {
    expect(registeredRouteTransport(registry('agy_tool'), 'antigravity')).toBe('agy_tool')
    // An unregistered name would be rejected as `unknown tool`, so it is never invented.
    expect(registeredRouteTransport(registry(), 'antigravity')).toBeUndefined()
    // A registered tool on a route that needs no transport stays out of the ceiling.
    expect(registeredRouteTransport(registry('agy_tool'), 'test-native')).toBeUndefined()
  })

  it('adds the transport to a ceiling once, and leaves it untouched otherwise', () => {
    expect(withRouteTransport(['read', 'edit'], 'agy_tool')).toEqual(['read', 'edit', 'agy_tool'])
    expect(withRouteTransport(['read'], undefined)).toEqual(['read'])
    // A user who configured the transport by hand keeps their exact ceiling.
    const configured = ['read', 'agy_tool']
    expect(withRouteTransport(configured, 'agy_tool')).toBe(configured)
  })
})
