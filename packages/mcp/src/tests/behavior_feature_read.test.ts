/**
 * Tests: get_behavior_feature reads. summary:true is a table of contents an
 * agent can pick from, and surface_id / action_id select one element by its
 * stable id instead of a position another writer can shift.
 */

import { describe, it, expect, vi } from 'vitest'
import { createMcpServer } from '../server.js'
import { featureIndexKeys, featureToc, readBehaviorFeatureHandler } from '../tools/behavior.js'
import { CAP_HINTS } from '../util/cap-hints.js'
import { RESULT_CAP } from '../util/shape.js'
import type { LyriksClient } from '../lyriks-client.js'

const hex = (n: number) => n.toString(16).padStart(8, '0')
const prose = 'The customer confirms the order once every line is in stock and the payment method is valid. '

/** A feature shaped like the engine snapshot: `surfaces` surfaces sharing `actions` actions. */
function makeFeature(surfaces: number, actions: number) {
  let next = 0
  const action = (): Record<string, unknown> => ({
    id: hex(0xa000 + next), name: `Action ${next++}`, description: prose.repeat(3),
    parameters: [{ id: 'p1', name: 'quantity', type: 'number' }],
    rules: [{ id: 'r1', category: 'guard', condition: { path: 'cart.open', op: 'eq', value: true }, effect: { type: 'allow_action', description: prose } }, { id: 'r2', category: 'guard', effect: { type: 'block_action', description: prose } }],
    effects: [{ id: 'e1', type: 'set_state', path: 'cart.total', description: prose }],
    invariants: [], transitions: [{ id: 't1', to: 'confirmed' }],
    scenarios: [{ id: 's1', name: 'Happy path', steps: [prose, prose], expectedAssertions: [{ path: 'cart.total', op: 'gt', value: 0 }] }],
  })
  return {
    id: 'feat-checkout', name: 'Checkout', description: prose.repeat(4), updatedAt: '2026-09-19T10:00:00.000Z',
    surfaces: Array.from({ length: surfaces }, (_, s) => ({
      id: hex(0x5000 + s), name: `Surface ${s}`, description: prose.repeat(2),
      stateDefinitions: [{ id: 'sd1', path: 'cart.open', type: 'boolean' }, { id: 'sd2', path: 'cart.total', type: 'number' }],
      rules: [{ id: 'sr1', description: prose }],
      invariants: [{ id: hex(0x1000 + s), name: 'Total is never negative', condition: { path: 'cart.total', op: 'gte', value: 0 }, message: prose }],
      transitions: [],
      actions: Array.from({ length: Math.ceil(actions / surfaces) }, action).slice(0, Math.max(0, actions - s * Math.ceil(actions / surfaces))),
    })),
    acceptanceCriteria: [{ id: 'ac-1', title: 'An order in stock is confirmed', given: prose, when: prose, then: prose, expectedOutcome: 'success' }],
    featureInvariants: [{ id: 'fi-1', name: 'One open cart' }],
    reachabilityGoals: [], events: [{ id: 'ev-1', name: 'order.confirmed' }, { id: 'ev-2', name: 'order.refused' }],
    entities: [{ id: 'en-1', name: 'Order' }], personas: [], resources: [], valueSets: [], constants: [],
    elementVersions: { a: '1', b: '2' },
  }
}

function makeLyriks(feature: unknown) {
  const get = vi.fn().mockResolvedValue({ snapshot: { format: 'unspaghettit', version: 1, feature } })
  return { lyriks: { get } as unknown as LyriksClient, get }
}

type Toc = {
  featureId: string; name: string; updatedAt: string; counts: Record<string, number>
  acceptanceCriteria: unknown[]; actionsOmitted?: { surfaceIds: string[]; reason: string }
  surfaces: Array<{ id: string; name: string; stateCount: number; ruleCount: number; invariants: unknown[]; actions?: Array<Record<string, unknown>>; actionCount?: number }>
}

describe('get_behavior_feature summary:true', () => {
  it('returns a table of contents: ids, names and counts, small enough to read', async () => {
    const feature = makeFeature(7, 31)
    const { lyriks, get } = makeLyriks(feature)
    const toc = await readBehaviorFeatureHandler({ project_id: 'p', feature_id: 'feat-checkout', summary: true }, lyriks) as Toc
    expect(get).toHaveBeenCalledWith('/api/behavior/feature?projectId=p&featureId=feat-checkout')
    expect(toc).toMatchObject({ featureId: 'feat-checkout', name: 'Checkout', updatedAt: '2026-09-19T10:00:00.000Z' })
    expect(toc.counts).toEqual({ surfaces: 7, acceptanceCriteria: 1, featureInvariants: 1, reachabilityGoals: 0, events: 2, entities: 1, personas: 0, resources: 0, valueSets: 0, constants: 0 })
    expect(toc.acceptanceCriteria).toEqual([{ id: 'ac-1', title: 'An order in stock is confirmed' }])
    expect(toc.surfaces).toHaveLength(7)
    expect(toc.surfaces[0]).toMatchObject({ id: hex(0x5000), name: 'Surface 0', stateCount: 2, ruleCount: 1, invariants: [{ id: hex(0x1000), name: 'Total is never negative' }] })
    expect(toc.surfaces.flatMap((s) => s.actions ?? [])).toHaveLength(31)
    expect(toc.surfaces[0].actions?.[0]).toEqual({ id: hex(0xa000), name: 'Action 0', rules: 2, effects: 1, scenarios: 1, parameters: 1 })
    expect(toc.actionsOmitted).toBeUndefined()
    // About 3 KB for 7 surfaces and 31 actions, against a full snapshot over the cap.
    expect(JSON.stringify(toc).length).toBeLessThan(5000)
    expect(JSON.stringify(feature).length).toBeGreaterThan(RESULT_CAP)
  })

  it('treats every field as possibly missing', () => {
    const toc = featureToc({ id: 'f', surfaces: [{ id: 's' }, null, { id: 's2', actions: [{ id: 'a' }, 'junk'] }] }) as unknown as Toc
    expect(toc.counts.surfaces).toBe(3)
    expect(toc.surfaces).toEqual([
      { id: 's', name: undefined, stateCount: 0, ruleCount: 0, invariants: [], actions: [] },
      { id: 's2', name: undefined, stateCount: 0, ruleCount: 0, invariants: [], actions: [{ id: 'a', name: undefined, rules: 0, effects: 0, scenarios: 0, parameters: 0 }] },
    ])
  })

  it('drops the action rows of the largest surfaces first, and says so, when the table itself is too big', () => {
    const feature = makeFeature(6, 600)
    feature.surfaces[2].actions = feature.surfaces[2].actions.slice(0, 3)
    const toc = featureToc(feature) as unknown as Toc
    expect(JSON.stringify(toc).length).toBeLessThanOrEqual(RESULT_CAP)
    expect(toc.actionsOmitted?.surfaceIds.length).toBeGreaterThan(0)
    expect(toc.actionsOmitted?.reason).toContain('surface_id')
    // The small surface keeps its rows; a trimmed one keeps the count.
    expect(toc.surfaces[2].actions).toHaveLength(3)
    const trimmed = toc.surfaces.find((s) => s.id === toc.actionsOmitted?.surfaceIds[0])
    expect(trimmed?.actions).toBeUndefined()
    expect(trimmed?.actionCount).toBe(100)
  })

  it('falls back to the generic shape when the answer carries no feature', async () => {
    const lyriks = { get: vi.fn().mockResolvedValue({ available: false, reason: 'engine down' }) } as unknown as LyriksClient
    expect(await readBehaviorFeatureHandler({ project_id: 'p', feature_id: 'f', summary: true }, lyriks)).toEqual({ available: false, reason: 'engine down' })
  })
})

describe('get_behavior_feature surface_id / action_id', () => {
  it('returns one surface whole, with its context', async () => {
    const feature = makeFeature(7, 31)
    const { lyriks } = makeLyriks(feature)
    const result = await readBehaviorFeatureHandler({ project_id: 'p', feature_id: 'feat-checkout', surface_id: hex(0x5003) }, lyriks)
    expect(result).toEqual({ found: true, featureId: 'feat-checkout', surfaceId: hex(0x5003), surfaceName: 'Surface 3', surface: feature.surfaces[3] })
  })

  it('finds an action in whichever surface holds it', async () => {
    const feature = makeFeature(7, 31)
    const { lyriks } = makeLyriks(feature)
    const wanted = feature.surfaces[4].actions[1]
    const result = await readBehaviorFeatureHandler({ project_id: 'p', feature_id: 'feat-checkout', action_id: wanted.id as string }, lyriks)
    expect(result).toEqual({ found: true, featureId: 'feat-checkout', surfaceId: hex(0x5004), surfaceName: 'Surface 4', action: wanted })
  })

  it('answers an unknown id with the ids and names that exist', async () => {
    const { lyriks } = makeLyriks(makeFeature(2, 3))
    const surface = await readBehaviorFeatureHandler({ project_id: 'p', feature_id: 'feat-checkout', surface_id: 'nope' }, lyriks)
    expect(surface).toMatchObject({ found: false, featureId: 'feat-checkout', surface_id: 'nope', available: [{ id: hex(0x5000), name: 'Surface 0' }, { id: hex(0x5001), name: 'Surface 1' }] })
    const action = await readBehaviorFeatureHandler({ project_id: 'p', feature_id: 'feat-checkout', action_id: 'nope' }, lyriks) as { found: boolean; available: Array<{ id: string; actions: unknown[] }> }
    expect(action.found).toBe(false)
    expect(action.available[0]).toEqual({ id: hex(0x5000), name: 'Surface 0', actions: [{ id: hex(0xa000), name: 'Action 0' }, { id: hex(0xa001), name: 'Action 1' }] })
  })

  it('lets paths win when both are given, as before', async () => {
    const { lyriks } = makeLyriks(makeFeature(2, 3))
    const result = await readBehaviorFeatureHandler({ project_id: 'p', feature_id: 'f', surface_id: hex(0x5000), summary: true, paths: ['snapshot.feature.name'] }, lyriks)
    expect(result).toEqual({ feature_id: 'f', values: { 'snapshot.feature.name': 'Checkout' }, missingPaths: [] })
  })

  it('says so when the answer carries no feature to select from', async () => {
    const lyriks = { get: vi.fn().mockResolvedValue({ available: false }) } as unknown as LyriksClient
    expect(await readBehaviorFeatureHandler({ project_id: 'p', feature_id: 'f', action_id: 'a' }, lyriks)).toMatchObject({ found: false, featureId: 'f' })
  })
})

describe('get_behavior_feature index_keys:true', () => {
  /** Every key kind the engine mints (buildKeyOwners), plus an acceptance criterion, with the repeats a real feature has. */
  const keyed = () => ({
    id: 'feat-returns', name: 'Returns', updatedAt: '2026-09-20T09:00:00.000Z',
    featureInvariants: [{ id: 'fi000001', name: 'A return has one order' }],
    events: [{ id: 'ev000001', name: 'return.requested' }, { id: 'ev000002', name: 'return.refused' }],
    entities: [{ id: 'en000001', name: 'Return' }],
    acceptanceCriteria: [{ id: 'ac000001', title: 'A return within 30 days is accepted' }],
    personas: [{ id: 'pe000001', name: 'Customer' }], valueSets: [{ id: 'vs000001' }], resources: [{ id: 're000001' }],
    surfaces: [
      {
        id: 'sf000001', name: 'Request a return',
        stateDefinitions: [{ id: 'sd000001', path: 'return.status' }, { id: 'sd000002', path: 'session.role' }],
        rules: [{ id: 'sr000001' }], invariants: [{ id: 'si000001' }], transitions: [{ id: 'tr000001' }],
        actions: [{
          id: 'ac00aaaa', name: 'Request',
          emittedEvents: ['return.requested', 'return.logged'],
          rules: [{ id: 'ru000001' }, { id: 'ru000002' }], invariants: [{ id: 'in000001' }], transitions: [{ id: 'tr000002' }],
          scenarios: [{ id: 'sc000001' }], parameters: [{ id: 'pa000001', name: 'reason' }], effects: [{ id: 'ef000001' }],
        }],
      },
      {
        // The same state path and the same event again: one key each, not two.
        id: 'sf000002', name: 'Review a return', stateDefinitions: [{ id: 'sd000003', path: 'session.role' }],
        rules: [], invariants: [], transitions: [],
        actions: [{ id: 'ac00bbbb', name: 'Refuse', emittedEvents: ['return.refused'], rules: [{ id: 'ru000003' }], invariants: [], transitions: [] }],
      },
    ],
  })

  it('lists every key kind in the grammar and the order of the engine, none twice', async () => {
    const { lyriks, get } = makeLyriks(keyed())
    const answer = await readBehaviorFeatureHandler({ project_id: 'p', feature_id: 'feat-returns', index_keys: true }, lyriks)
    expect(get).toHaveBeenCalledWith('/api/behavior/feature?projectId=p&featureId=feat-returns')
    const keys = [
      'invariant:fi000001', 'event:return.requested', 'event:return.refused', 'entity:en000001',
      'surface:sf000001', 'state:return.status', 'state:session.role', 'surface_rule:sr000001', 'surface_invariant:si000001', 'transition:tr000001',
      'action:ac00aaaa', 'event:return.logged', 'rule:ru000001', 'rule:ru000002', 'invariant:in000001', 'transition:tr000002',
      'surface:sf000002', 'action:ac00bbbb', 'rule:ru000003',
      'criterion:ac000001',
    ]
    expect(answer).toEqual({ featureId: 'feat-returns', updatedAt: '2026-09-20T09:00:00.000Z', total: keys.length, keys })
    expect(new Set(keys).size).toBe(keys.length)
    const kinds = new Set(keys.map((key) => key.slice(0, key.indexOf(':'))))
    expect([...kinds].sort()).toEqual(['action', 'criterion', 'entity', 'event', 'invariant', 'rule', 'state', 'surface', 'surface_invariant', 'surface_rule', 'transition'])
    // What the engine does not key in an index stays out: scenarios, parameters, effects, personas, value sets, resources.
    expect(keys.some((key) => /^(scenario|parameter|effect|persona|valueSet|resource):/.test(key))).toBe(false)
  })

  it('wins over surface_id, action_id and summary, and loses to paths', async () => {
    const { lyriks } = makeLyriks(keyed())
    const args = { project_id: 'p', feature_id: 'feat-returns', index_keys: true, surface_id: 'sf000002', action_id: 'ac00bbbb', summary: true }
    expect(await readBehaviorFeatureHandler(args, lyriks)).toMatchObject({ featureId: 'feat-returns', total: 20 })
    expect(await readBehaviorFeatureHandler({ ...args, paths: ['snapshot.feature.name'] }, lyriks)).toEqual({ feature_id: 'feat-returns', values: { 'snapshot.feature.name': 'Returns' }, missingPaths: [] })
  })

  it('treats every field as possibly missing', () => {
    expect(featureIndexKeys({ id: 'f' })).toEqual([])
    expect(featureIndexKeys({ id: 'f', events: [{ id: 'e' }, 'junk'], surfaces: [null, { actions: [{ id: 'a', emittedEvents: [{ name: 'x.y' }, 7, null, ''] }, { name: 'no id' }] }] }))
      .toEqual(['action:a', 'event:x.y', 'event:7'])
  })

  it('pages a huge feature under the cap, every key once', async () => {
    const feature = keyed()
    feature.surfaces[0].stateDefinitions = Array.from({ length: 3000 }, (_, i) => ({ id: `sd-${i}`, path: `returns.line${i}.status` }))
    const { lyriks } = makeLyriks(feature)
    const seen: string[] = []
    let offset: number | null = 0
    let pages = 0
    while (offset !== null) {
      const page = await readBehaviorFeatureHandler({ project_id: 'p', feature_id: 'feat-returns', index_keys: true, offset }, lyriks) as { total: number; offset: number; returned: number; nextOffset: number | null; keys: string[] }
      expect(JSON.stringify(page).length).toBeLessThanOrEqual(RESULT_CAP)
      // 20 keys, minus the two state paths replaced, plus 3000, plus session.role now declared by the second surface alone.
      expect(page).toMatchObject({ total: 3019, offset, returned: page.keys.length })
      seen.push(...page.keys)
      offset = page.nextOffset
      pages++
    }
    expect(pages).toBeGreaterThan(2)
    expect(seen).toEqual(featureIndexKeys(feature))
    expect(new Set(seen).size).toBe(3019)
    expect(await readBehaviorFeatureHandler({ project_id: 'p', feature_id: 'feat-returns', index_keys: true, limit: 2, offset: 4 }, lyriks))
      .toMatchObject({ offset: 4, returned: 2, nextOffset: 6, keys: ['surface:sf000001', 'state:returns.line0.status'] })
  })

  it('says so when the answer carries no feature', async () => {
    const lyriks = { get: vi.fn().mockResolvedValue({ available: false }) } as unknown as LyriksClient
    expect(await readBehaviorFeatureHandler({ project_id: 'p', feature_id: 'f', index_keys: true }, lyriks)).toMatchObject({ found: false, featureId: 'f' })
  })

  it('is advertised by the tool, its description and its recovery hint', () => {
    // @ts-expect-error testing registered wire schemas
    const tool = createMcpServer(null)._registeredTools.get_behavior_feature
    expect(tool.inputSchema.parse({ project_id: 'p', feature_id: 'f', index_keys: true, limit: 500, offset: 1000 })).toMatchObject({ index_keys: true, limit: 500, offset: 1000 })
    for (const type of ['surface', 'action', 'rule', 'invariant', 'transition', 'surface_rule', 'surface_invariant', 'entity', 'criterion'])
      expect(tool.description).toContain(`${type}:<id>`)
    expect(tool.description).toContain('state:<dotted.path>')
    expect(tool.description).toContain('event:<name>')
    expect(CAP_HINTS.get_behavior_feature.args).toEqual(expect.arrayContaining(['index_keys', 'limit', 'offset']))
  })
})
