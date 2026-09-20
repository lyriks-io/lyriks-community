/**
 * Tests: export_behavior_scenarios. The spec's executable scenarios come back as
 * fixtures in the shape the engine's `unspa scenarios export` feeds an adapter,
 * so a repository test runs them against the real code. What is held here is
 * the composition the engine applies (persona, then scenario, then the surface
 * defaults), and a paging that visits every scenario exactly once.
 */

import { describe, it, expect, vi } from 'vitest'
import { createMcpServer } from '../server.js'
import { ADAPTER_CONTRACT, TITLE_TOKEN, exportBehaviorScenariosHandler, scenarioFixtures, scenarioTitleToken } from '../tools/behavior_scenarios.js'
import { CAP_HINTS } from '../util/cap-hints.js'
import { RESULT_CAP } from '../util/shape.js'
import type { LyriksClient } from '../lyriks-client.js'

type Fixture = Record<string, unknown> & { scenarioId: string; steps: Array<Record<string, unknown>> }
type Page = { featureId: string; total: number; offset: number; returned: number; nextOffset: number | null; fixtures: Fixture[]; adapterContract: string }

const cartTotalIs = (value: number) => ({ path: 'cart.total', operator: 'equals', value })

function makeFeature() {
  return {
    id: 'feat-checkout', name: 'Checkout', updatedAt: '2026-09-19T10:00:00.000Z',
    elementVersions: { 'scenario:sc-premium': '2026-09-20T08:00:00.000Z', 'action:act-add': '2026-09-01T00:00:00.000Z' },
    personas: [{
      id: 'per-premium', name: 'Premium customer', persistAcrossSurfaces: true,
      stateOverrides: [{ path: 'account.tier', value: 'premium' }, { path: 'cart.total', value: 10 }],
      parameterOverrides: [{ parameterName: 'quantity', value: 1 }, { parameterName: 'coupon', value: 'WELCOME' }, { parameterName: 'undeclared', value: 'x' }],
    }],
    surfaces: [
      {
        id: 'srf-cart', name: 'Cart',
        stateDefinitions: [
          { id: 'sd1', path: 'cart.total', type: 'number', defaultValue: 0 },
          { id: 'sd2', path: 'cart.open', type: 'boolean', defaultValue: true },
          { id: 'sd3', path: 'account.tier', type: 'enum', defaultValue: 'standard' },
          { id: 'sd4', path: 'cart.lines', type: 'array', defaultValue: [] },
        ],
        actions: [
          {
            id: 'act-add', name: 'Add a line',
            parameters: [{ id: 'p1', name: 'quantity', type: 'number' }, { id: 'p2', name: 'coupon', type: 'string' }],
            scenarios: [
              {
                id: 'sc-premium', name: 'A premium customer adds three', personaId: 'per-premium',
                stateOverrides: [{ path: 'cart.total', value: 40 }, { path: 'cart.open', value: false }],
                parameterOverrides: [{ parameterName: 'quantity', value: 3 }, { parameterName: 'undeclared', value: 'y' }],
                expectedAssertions: [cartTotalIs(70)],
              },
              {
                id: 'sc-closed', name: 'A closed cart refuses', stateOverrides: [{ path: 'cart.open', value: false }], parameterOverrides: [],
                expectedStatus: 'blocked', expectedTransition: null, timeAdvance: 30,
              },
            ],
          },
          {
            id: 'act-pay', name: 'Pay', parameters: [{ id: 'p3', name: 'amount', type: 'number' }],
            scenarios: [{
              id: 'sc-flow', name: 'Add, confirm too early, then pay', personaId: 'per-premium',
              stateOverrides: [], parameterOverrides: [{ parameterName: 'amount', value: 20 }],
              expectedStatus: 'success', expectedAssertions: [cartTotalIs(0)], expectedTransition: 'srf-order',
              steps: [
                { actionId: 'act-add', parameterOverrides: [{ parameterName: 'quantity', value: 2 }], expectedAssertions: [cartTotalIs(30)] },
                { actionId: 'act-confirm', surfaceId: 'srf-order', parameterOverrides: [], expectedStatus: 'blocked', timeAdvance: 5 },
              ],
            }],
          },
        ],
      },
      {
        id: 'srf-order', name: 'Order', stateDefinitions: [{ id: 'sd5', path: 'order.status', type: 'enum', defaultValue: 'draft' }],
        actions: [{
          id: 'act-confirm', name: 'Confirm', parameters: [],
          scenarios: [{ id: 'sc-confirm', name: 'A paid order is confirmed', stateOverrides: [{ path: 'order.status', value: 'paid' }], parameterOverrides: [] }],
        }],
      },
    ],
  }
}

const fixturesOf = (feature: unknown, args: Parameters<typeof scenarioFixtures>[1] = {}) =>
  scenarioFixtures(feature as Record<string, unknown>, args) as unknown as Page
const byId = (page: Page, id: string) => page.fixtures.find((f) => f.scenarioId === id)!

describe('export_behavior_scenarios fixtures', () => {
  it('composes the persona first, the scenario on top, then the defaults of the surface', () => {
    const page = fixturesOf(makeFeature())
    expect(page).toMatchObject({ featureId: 'feat-checkout', total: 4, offset: 0, returned: 4, nextOffset: null })
    expect(page.fixtures.map((f) => f.scenarioId)).toEqual(['sc-premium', 'sc-closed', 'sc-flow', 'sc-confirm'])
    expect(byId(page, 'sc-premium')).toEqual({
      featureId: 'feat-checkout', featureName: 'Checkout', surfaceId: 'srf-cart', surfaceName: 'Cart',
      actionId: 'act-add', actionName: 'Add a line', scenarioId: 'sc-premium', scenarioName: 'A premium customer adds three',
      titleToken: '[unspa:srf-cart:act-add:sc-premium]',
      personaId: 'per-premium', personaName: 'Premium customer',
      // tier from the persona, total and open from the scenario over the persona, lines from the default.
      initialState: { account: { tier: 'premium' }, cart: { total: 40, open: false, lines: [] } },
      // quantity from the scenario over the persona, coupon from the persona, the undeclared name dropped.
      parameters: { quantity: 3, coupon: 'WELCOME' },
      steps: [],
      expectedStatus: 'success',
      expectedAssertions: [cartTotalIs(70)],
      specVersion: '2026-09-20T08:00:00.000Z',
    })
  })

  it('defaults the status, keeps an authored null transition, and falls back to the feature stamp', () => {
    const closed = byId(fixturesOf(makeFeature()), 'sc-closed')
    expect(closed).toMatchObject({
      personaId: null, personaName: null,
      initialState: { account: { tier: 'standard' }, cart: { total: 0, open: false, lines: [] } },
      parameters: {}, expectedStatus: 'blocked', expectedAssertions: [], expectedTransition: null, timeAdvance: 30,
      specVersion: '2026-09-19T10:00:00.000Z',
    })
    const confirm = byId(fixturesOf(makeFeature()), 'sc-confirm')
    expect(confirm.expectedStatus).toBe('success')
    expect(confirm.initialState).toEqual({ order: { status: 'paid' } })
    expect('expectedTransition' in confirm).toBe(false)
    expect('timeAdvance' in confirm).toBe(false)
  })

  it('resolves each step to its action, with the persona under the step parameters', () => {
    const flow = byId(fixturesOf(makeFeature()), 'sc-flow')
    expect(flow.steps).toEqual([
      { actionId: 'act-add', actionName: 'Add a line', surfaceId: 'srf-cart', parameters: { quantity: 2, coupon: 'WELCOME' }, expectedStatus: 'success', expectedAssertions: [cartTotalIs(30)] },
      { actionId: 'act-confirm', actionName: 'Confirm', surfaceId: 'srf-order', parameters: {}, expectedStatus: 'blocked', expectedAssertions: [], timeAdvance: 5 },
    ])
    // The persona names no parameter of Pay, so only the scenario speaks.
    expect(flow).toMatchObject({ parameters: { amount: 20 }, expectedTransition: 'srf-order' })
  })

  it('keeps one surface or one action', () => {
    expect(fixturesOf(makeFeature(), { surface_id: 'srf-order' }).fixtures.map((f) => f.scenarioId)).toEqual(['sc-confirm'])
    expect(fixturesOf(makeFeature(), { action_id: 'act-add' })).toMatchObject({ total: 2, returned: 2 })
    expect(fixturesOf(makeFeature(), { surface_id: 'srf-cart', action_id: 'act-pay' }).fixtures.map((f) => f.scenarioId)).toEqual(['sc-flow'])
  })

  it('answers an unknown id with the ids and names that exist', () => {
    expect(fixturesOf(makeFeature(), { surface_id: 'srf-nope' })).toEqual({
      found: false, featureId: 'feat-checkout', surface_id: 'srf-nope', reason: 'No surface of this feature has this id.',
      available: [{ id: 'srf-cart', name: 'Cart' }, { id: 'srf-order', name: 'Order' }],
    })
    expect(fixturesOf(makeFeature(), { action_id: 'act-nope' })).toMatchObject({
      found: false, action_id: 'act-nope', reason: 'No action of this feature has this id.',
      available: [{ id: 'srf-cart', actions: [{ id: 'act-add', name: 'Add a line' }, { id: 'act-pay', name: 'Pay' }] }, { id: 'srf-order', actions: [{ id: 'act-confirm', name: 'Confirm' }] }],
    })
    // An action of another surface is unknown to the surface that was asked for.
    expect(fixturesOf(makeFeature(), { surface_id: 'srf-order', action_id: 'act-add' })).toMatchObject({ found: false, surface_id: 'srf-order', action_id: 'act-add', reason: 'No action of this surface has this id.' })
  })

  it('treats every field as possibly missing', () => {
    const page = fixturesOf({ id: 'f', surfaces: [null, { id: 's', actions: [{ id: 'a', scenarios: [{ id: 'x', personaId: 'gone', steps: ['prose', { actionId: 'lost' }], stateOverrides: [{ path: '__proto__.polluted', value: true }, { value: 1 }, { path: 'a.b', value: 1 }, { path: 'a.b.c', value: 2 }] }, 'junk'] }] }] })
    expect(page.total).toBe(1)
    expect(page.fixtures[0]).toEqual({
      featureId: 'f', featureName: undefined, surfaceId: 's', surfaceName: undefined, actionId: 'a', actionName: undefined,
      scenarioId: 'x', scenarioName: undefined, titleToken: '[unspa:s:a:x]', personaId: 'gone', personaName: null,
      // A later, deeper write replaces the scalar, the way the engine writes a path.
      initialState: { a: { b: { c: 2 } } }, parameters: {},
      steps: [{ actionId: 'lost', actionName: null, surfaceId: 's', parameters: {}, expectedStatus: 'success', expectedAssertions: [] }],
      expectedStatus: 'success', expectedAssertions: [], specVersion: null,
    })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(fixturesOf({ id: 'empty' })).toMatchObject({ total: 0, returned: 0, nextOffset: null, fixtures: [] })
  })
})

describe('export_behavior_scenarios title token', () => {
  // What unspaghettit cli/scenarios/results.ts parses a test report with. A
  // token spelled any other way is a test the ingester does not see.
  const ENGINE_TOKEN = String.raw`\[unspa:([^:\]]+):([^:\]]+):([^:\]]+)\]`

  it('gives every fixture the token the engine ingester reads back to the same three ids', () => {
    expect(TITLE_TOKEN.source).toBe(ENGINE_TOKEN)
    const page = fixturesOf(makeFeature())
    expect(page.fixtures.map((f) => f.titleToken)).toEqual([
      '[unspa:srf-cart:act-add:sc-premium]', '[unspa:srf-cart:act-add:sc-closed]',
      // A multi-step scenario is named after its subject action, not after the steps it replays.
      '[unspa:srf-cart:act-pay:sc-flow]', '[unspa:srf-order:act-confirm:sc-confirm]',
    ])
    for (const fixture of page.fixtures) {
      // The way a report row is read: the token anywhere in a longer title.
      const read = new RegExp(ENGINE_TOKEN).exec(`checkout > ${String(fixture.titleToken)} ${String(fixture.scenarioName)}`)
      expect(read?.slice(1)).toEqual([fixture.surfaceId, fixture.actionId, fixture.scenarioId])
    }
    expect(scenarioTitleToken('s1', 'a1', 'sc1')).toBe('[unspa:s1:a1:sc1]')
    expect(scenarioTitleToken(7, 'a1', 'sc1')).toBe('[unspa:7:a1:sc1]')
  })

  it('answers null rather than a token that reads back to other ids', () => {
    for (const ids of [[undefined, 'a', 'x'], ['s', '', 'x'], ['s', 'a', null], ['s:1', 'a', 'x'], ['s', 'a]', 'x'], ['s', 'a', { id: 'x' }]])
      expect(scenarioTitleToken(ids[0], ids[1], ids[2]), JSON.stringify(ids)).toBeNull()
    const page = fixturesOf({ id: 'f', surfaces: [{ actions: [{ id: 'a', scenarios: [{ id: 'x' }] }] }] })
    expect(page.fixtures[0]).toMatchObject({ scenarioId: 'x', titleToken: null })
  })
})

describe('export_behavior_scenarios paging', () => {
  // 120 scenarios of about 1 KB each, several times what one answer carries.
  const big = () => {
    const feature = makeFeature()
    feature.surfaces[0].actions[0].scenarios = Array.from({ length: 120 }, (_, i) => ({
      id: `sc-${i}`, name: `Scenario ${i}`, parameterOverrides: [{ parameterName: 'quantity', value: i }],
      stateOverrides: Array.from({ length: 12 }, (_, l) => ({ path: `cart.line${l}.label`, value: `Line ${l} of scenario ${i}, a label long enough to weigh` })),
    }))
    return feature
  }

  it('visits every scenario exactly once, each page under the cap', () => {
    const seen: string[] = []
    let offset: number | null = 0
    let pages = 0
    while (offset !== null) {
      const page: Page = fixturesOf(big(), { offset, limit: 200 })
      expect(JSON.stringify(page).length).toBeLessThanOrEqual(RESULT_CAP)
      expect(page).toMatchObject({ total: 122, offset, returned: page.fixtures.length })
      expect(page.returned).toBeGreaterThan(0)
      seen.push(...page.fixtures.map((f) => f.scenarioId))
      offset = page.nextOffset
      pages++
    }
    expect(pages).toBeGreaterThan(3)
    // Model order: the 120 of the first action, then the other action, then the other surface.
    expect(seen).toEqual([...Array.from({ length: 120 }, (_, i) => `sc-${i}`), 'sc-flow', 'sc-confirm'])
  })

  it('honours limit and offset, and clamps them', () => {
    expect(fixturesOf(big(), { limit: 5, offset: 10 })).toMatchObject({ offset: 10, returned: 5, nextOffset: 15 })
    expect(fixturesOf(big(), { offset: 121 })).toMatchObject({ returned: 1, nextOffset: null })
    expect(fixturesOf(big(), { offset: 500 })).toMatchObject({ total: 122, returned: 0, nextOffset: null, fixtures: [] })
    expect(fixturesOf(big(), { limit: 0, offset: -3 })).toMatchObject({ offset: 0, returned: 1, nextOffset: 1 })
  })

  it('returns one fixture even when it alone exceeds the cap, so the paging still ends', () => {
    const feature = makeFeature()
    feature.surfaces[1].actions[0].scenarios[0].stateOverrides = Array.from({ length: 400 }, (_, l) => ({ path: `order.line${l}`, value: 'x'.repeat(80) }))
    expect(fixturesOf(feature, { offset: 3 })).toMatchObject({ returned: 1, nextOffset: null })
  })
})

describe('export_behavior_scenarios tool', () => {
  it('reads the feature through the platform read get_behavior_feature uses', async () => {
    const get = vi.fn().mockResolvedValue({ snapshot: { format: 'unspaghettit', version: 1, feature: makeFeature() } })
    const page = await exportBehaviorScenariosHandler({ project_id: 'p', feature_id: 'feat-checkout', action_id: 'act-pay' }, { get } as unknown as LyriksClient) as Page
    expect(get).toHaveBeenCalledWith('/api/behavior/feature?projectId=p&featureId=feat-checkout')
    expect(page).toMatchObject({ featureId: 'feat-checkout', total: 1, adapterContract: ADAPTER_CONTRACT })
  })

  it('says so when the platform answer carries no feature', async () => {
    const get = vi.fn().mockResolvedValue({ available: false })
    expect(await exportBehaviorScenariosHandler({ project_id: 'p', feature_id: 'f' }, { get } as unknown as LyriksClient))
      .toEqual({ found: false, featureId: 'f', reason: 'The platform answer carries no snapshot.feature.', answer: { available: false } })
  })

  it('states the adapter contract in a text short enough to ride with every page', () => {
    expect(ADAPTER_CONTRACT.length).toBeLessThan(600)
    for (const phrase of ['invoke(input) => { status: "success" | "blocked", finalState }', 'initialState', 'parameters', 'steps', 'only asserted paths need to be returned', 'Each test title must contain its fixture\'s titleToken', '.lyriks/tools/ingest-results.mjs', 'JSON test report'])
      expect(ADAPTER_CONTRACT).toContain(phrase)
  })

  it('is registered read-only, bounded, with a recovery hint', () => {
    // @ts-expect-error testing registered wire schemas
    const tool = createMcpServer(null)._registeredTools.export_behavior_scenarios
    expect(tool.inputSchema.parse({ project_id: 'p', feature_id: 'f', surface_id: 's', action_id: 'a', limit: 200, offset: 50 })).toMatchObject({ limit: 200, offset: 50 })
    expect(tool.inputSchema.safeParse({ project_id: 'p', feature_id: 'f', limit: 201 }).success).toBe(false)
    expect(tool.annotations.readOnlyHint).toBe(true)
    expect(tool.description).toContain('against the REAL CODE instead of hand-copying their numbers')
    expect(tool.description).toContain('scenarioId, scenarioName, titleToken, personaId')
    expect(tool.description).toContain('NAME EACH TEST WITH ITS `titleToken` ("[unspa:<surfaceId>:<actionId>:<scenarioId>]"')
    expect(tool.description).toContain('hand that report to the shipped script `.lyriks/tools/ingest-results.mjs`, which stamps `verifiedAt` on the `action:<id>` index entries whose scenarios ALL passed')
    expect(tool.description).toContain('the next sync_implementation_index then carries the proof')
    expect(CAP_HINTS.export_behavior_scenarios.args).toEqual(['action_id', 'surface_id', 'limit', 'offset'])
  })
})
