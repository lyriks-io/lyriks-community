/**
 * Tests: what the gateway makes of the drift and sync answers. The platform
 * relays the engine verbatim (megabytes of rows on a large project), so the
 * gateway summarizes, pages and explains; anything that is not the expected
 * shape passes through unchanged.
 */

import { describe, it, expect, vi } from 'vitest'
import { createMcpServer } from '../server.js'
import { SYNC_SEMANTICS, driftHandler, getStatusHandler, shapeDriftAnswer, syncIndexHandler } from '../tools/implementation.js'
import { RESULT_CAP, capResult } from '../util/shape.js'
import type { LyriksClient } from '../lyriks-client.js'

function makeLyriks(response: unknown) {
  const post = vi.fn().mockResolvedValue(response)
  return { lyriks: { post } as unknown as LyriksClient, post }
}

const staleRow = (i: number) => ({
  key: `rule:${i}`, entitySuffix: String(i), featureId: `feat-${i % 60}`, featureName: `Feature ${i % 60}`, status: 'implemented',
  auditedSpecVersion: '2026-08-01T00:00:00.000Z', currentSpecVersion: '2026-09-01T00:00:00.000Z', scope: i % 4 ? 'element' : 'feature',
})
const index = Object.fromEntries(Array.from({ length: 5000 }, (_, i) => [`rule:${i}`, { file: `src/lib/module-${i % 80}.ts`, line: i + 1, signature: 'x' }]))
const driftAnswer = (stale: number) => ({
  available: true, ok: true, checked: 5900,
  stale: Array.from({ length: stale }, (_, i) => staleRow(i)),
  unversioned: ['action:aa', 'action:bb', 'state:cart.total'],
  orphans: [{ key: 'rule:gone', reason: 'no spec entity' }],
})

type Drift = {
  summary: { checked: number; stale: number; unversioned: number; orphans: number; staleByScope: Record<string, number>; staleByFeature: Record<string, number>; moreFeatures: number; staleByFile: Record<string, number>; moreFiles: number }
  bucket: string; total: number; offset: number; returned: number; nextOffset: number | null; rows: Array<Record<string, unknown>>
} & Record<string, unknown>

describe('get_implementation_drift', () => {
  it('summarizes first, then pages the stale rows with the caller\'s file and line', async () => {
    const { lyriks, post } = makeLyriks(driftAnswer(4973))
    const result = await driftHandler({ project_id: 'p', index }, lyriks) as Drift
    expect(post.mock.calls[0][1]).toEqual({ projectId: 'p', index })
    expect(Object.keys(result)[0]).toBe('summary')
    expect(result.summary).toMatchObject({ checked: 5900, stale: 4973, unversioned: 3, orphans: 1, moreFeatures: 10, moreFiles: 30 })
    expect(result.summary.staleByScope).toEqual({ element: 3729, feature: 1244 })
    expect(Object.keys(result.summary.staleByFeature)).toHaveLength(50)
    expect(Object.values(result.summary.staleByFeature)[0]).toBe(83)
    expect(Object.keys(result.summary.staleByFile)).toHaveLength(50)
    expect(result).toMatchObject({ available: true, ok: true, bucket: 'stale', total: 4973, offset: 0 })
    expect(result.rows[0]).toEqual({ ...staleRow(0), file: 'src/lib/module-0.ts', line: 1 })
    expect(result).not.toHaveProperty('stale')
    // The page is sized under the cap: the generic cap must not sample it, or paging would skip rows.
    expect(capResult(result)).toBe(result)
    expect(result.returned).toBe(result.rows.length)
    expect(result.nextOffset).toBe(result.returned)
  })

  it('visits every row exactly once across pages, within limit', async () => {
    const answer = driftAnswer(430)
    const seen: unknown[] = []
    let offset: number | null = 0
    while (offset !== null) {
      const page = shapeDriftAnswer(answer, { index, offset, limit: 200 }) as Drift
      expect(page.rows.length).toBeLessThanOrEqual(200)
      expect(JSON.stringify(page).length).toBeLessThanOrEqual(RESULT_CAP)
      seen.push(...page.rows.map((r) => r.key))
      offset = page.nextOffset
    }
    expect(seen).toEqual(answer.stale.map((r) => r.key))
  })

  it('defaults to 50 rows, clamps limit to 200 and pages the other buckets', () => {
    const answer = driftAnswer(120)
    expect((shapeDriftAnswer(answer, { index: {} }) as Drift).rows.length).toBeLessThanOrEqual(50)
    expect((shapeDriftAnswer({ ...answer, stale: answer.stale.map(({ key }) => ({ key })) }, { index: {}, limit: 5000 }) as Drift).returned).toBe(120)
    expect(shapeDriftAnswer(answer, { index, bucket: 'unversioned', limit: 2, offset: 1 })).toMatchObject({ bucket: 'unversioned', total: 3, offset: 1, returned: 2, nextOffset: null, rows: ['action:bb', 'state:cart.total'] })
    expect(shapeDriftAnswer(answer, { index, bucket: 'orphans' })).toMatchObject({ total: 1, rows: [{ key: 'rule:gone', reason: 'no spec entity' }] })
  })

  it('leaves a stale row as it is when the index does not locate it', () => {
    const page = shapeDriftAnswer(driftAnswer(1), { index: { 'rule:0': { status: 'implemented' } } }) as Drift
    expect(page.rows[0]).toEqual(staleRow(0))
    expect(page.summary.staleByFile).toEqual({})
  })

  it('passes through the fields of a newer engine, its own summary renamed', () => {
    const page = shapeDriftAnswer({ ...driftAnswer(2), summary: { staleTotal: 2 }, outOfScope: [{ key: 'rule:x' }] }, { index }) as Drift
    expect(page.engineSummary).toEqual({ staleTotal: 2 })
    expect(page.outOfScope).toEqual([{ key: 'rule:x' }])
    expect(page.summary.stale).toBe(2)
  })

  it.each([
    [{ available: true, ok: false, error: 'projectId is not linked' }],
    [{ available: false, stale: [] }],
    [{ ok: true }],
    ['unexpected'],
    [null],
  ])('returns an answer that is not a drift report unchanged: %j', async (answer) => {
    const { lyriks } = makeLyriks(answer)
    expect(await driftHandler({ project_id: 'p', index }, lyriks)).toBe(answer)
  })
})

describe('sync_implementation_index', () => {
  const ack = (i: number) => (i % 100 === 7
    ? { ok: false, scope: 'action', id: `a${i}`, error: 'unknown entity' }
    : { ok: true, scope: i % 2 ? 'action' : 'surface', slug: `s${i}`, revision: 3, found: 4, missing: 0 })
  const syncAnswer = () => ({
    available: true, ok: false, projectId: 'p', featureIds: ['f1', 'f2'], synced: 1146, successes: 1134, failures: 12, skipped: 210,
    healed: { total: 0, entries: [] }, stale: { total: 0, healable: 0, unhealable: 0, entries: [] },
    orphans: { total: 75, entries: Array.from({ length: 75 }, (_, i) => ({ key: `rule:o${i}`, hint: 'typo?' })) },
    shared: { total: 2, entries: [{ key: 'state:cart.total' }, { key: 'state:cart.open' }] },
    acks: Array.from({ length: 1146 }, (_, i) => ack(i)),
  })

  it('keeps the counters, drops the acknowledgements that say "fine" and explains each counter', async () => {
    const { lyriks, post } = makeLyriks(syncAnswer())
    const result = await syncIndexHandler({ project_id: 'p', index: { 'action:a1': {} } }, lyriks) as Record<string, unknown>
    // verbose never travels to the platform: it only shapes the answer.
    expect(post.mock.calls[0][1]).toEqual({ projectId: 'p', index: { 'action:a1': {} } })
    expect(result).toMatchObject({ ok: false, synced: 1146, successes: 1134, failures: 12, skipped: 210, featureIds: ['f1', 'f2'] })
    expect(result).not.toHaveProperty('acks')
    expect(result.failedAcks).toHaveLength(12)
    expect((result.failedAcks as Array<{ ok: boolean }>).every((a) => a.ok === false)).toBe(true)
    expect(result.semantics).toBe(SYNC_SEMANTICS)
    expect(capResult(result)).toBe(result)
  })

  it('says what skipped, synced and the location-only stale block mean', () => {
    expect(SYNC_SEMANTICS.synced).toContain('one per action and one per surface')
    expect(SYNC_SEMANTICS.skipped).toContain('NO entry of their own')
    expect(SYNC_SEMANTICS.children).toContain('not counted separately')
    expect(SYNC_SEMANTICS.stale).toContain('get_implementation_drift')
    expect(SYNC_SEMANTICS.stale).toContain('not a clean bill')
    for (const key of ['ok', 'successes', 'failures', 'healed', 'shared', 'orphans']) expect(SYNC_SEMANTICS).toHaveProperty(key)
  })

  it('cuts orphans and shared to their first 50 entries and keeps their totals', async () => {
    const { lyriks } = makeLyriks(syncAnswer())
    const result = await syncIndexHandler({ project_id: 'p', index: {} }, lyriks) as { orphans: { total: number; entries: unknown[]; entriesReturned: number }; shared: { total: number; entries: unknown[] } }
    expect(result.orphans).toMatchObject({ total: 75, entriesReturned: 50 })
    expect(result.orphans.entries).toHaveLength(50)
    expect(result.shared).toEqual({ total: 2, entries: [{ key: 'state:cart.total' }, { key: 'state:cart.open' }] })
  })

  it('returns every acknowledgement with verbose:true', async () => {
    const { lyriks } = makeLyriks(syncAnswer())
    const result = await syncIndexHandler({ project_id: 'p', index: {}, verbose: true }, lyriks) as { acks: unknown[] }
    expect(result.acks).toHaveLength(1146)
    expect(result).not.toHaveProperty('failedAcks')
  })

  it.each([
    [{ available: true, ok: false, error: 'project not linked' }],
    [{ ok: true }],
    [null],
  ])('returns an answer without the engine counters unchanged: %j', async (answer) => {
    const { lyriks } = makeLyriks(answer)
    expect(await syncIndexHandler({ project_id: 'p', index: {} }, lyriks)).toBe(answer)
  })

  const verification = { kind: 'e2e', command: 'pnpm test:e2e checkout', files: ['e2e/checkout.spec.ts'], artifacts: ['reports/checkout.json'], lastResult: { passed: true, at: '2026-09-20T09:00:00.000Z', summary: '12 of 12', revision: '8fc0c06' } }
  // The gateway reads no field of a criterion row: whatever the engine names them, they travel as they came.
  const criterion = (i: number) => ({ key: `criterion:c${i}`, criterionId: `c${i}`, title: `Criterion ${i}`, standing: 'active', indexed: i % 2 === 0, result: i % 2 ? 'none' : 'verified', ...(i % 2 ? {} : { file: 'e2e/checkout.spec.ts', verification }), ...(i === 4 ? { stale: true } : {}) })
  const criteria = (n: number) => ({ total: n, indexed: Math.ceil(n / 2), verified: Math.ceil(n / 2), failing: 0, unverified: 0, entries: Array.from({ length: n }, (_, i) => criterion(i)), malformed: [] })

  it('carries the criteria and the proven actions of a newer engine as they came', async () => {
    const { lyriks, post } = makeLyriks({ ...syncAnswer(), criteria: criteria(6), verified: 38 })
    const index = { 'criterion:c0': { file: 'e2e/checkout.spec.ts', verification } }
    const result = await syncIndexHandler({ project_id: 'p', index }, lyriks) as Record<string, unknown>
    // The verification block of a criterion entry travels inside the index, untouched.
    expect(post.mock.calls[0][1]).toEqual({ projectId: 'p', index })
    expect(result.criteria).toEqual(criteria(6))
    expect(result.verified).toBe(38)
    expect(result).toMatchObject({ synced: 1146, skipped: 210, semantics: SYNC_SEMANTICS })
  })

  it('cuts a long criteria list to its first 50 rows and keeps its total and its counters', async () => {
    const { lyriks } = makeLyriks({ ...syncAnswer(), criteria: criteria(180), verified: 0 })
    const result = await syncIndexHandler({ project_id: 'p', index: {} }, lyriks) as { criteria: Record<string, unknown> & { entries: unknown[] }; verified: number }
    expect(result.criteria).toMatchObject({ total: 180, indexed: 90, verified: 90, failing: 0, unverified: 0, malformed: [], entriesReturned: 50 })
    expect(result.criteria.entries).toEqual(Array.from({ length: 50 }, (_, i) => criterion(i)))
    expect(result.verified).toBe(0)
    expect(capResult(result)).toBe(result)
  })

  it('invents neither for an older engine, and leaves a criteria block of another shape alone', async () => {
    const older = await syncIndexHandler({ project_id: 'p', index: {} }, makeLyriks(syncAnswer()).lyriks) as Record<string, unknown>
    expect(older).not.toHaveProperty('criteria')
    expect(older).not.toHaveProperty('verified')
    const flat = [criterion(0)]
    expect(await syncIndexHandler({ project_id: 'p', index: {} }, makeLyriks({ ...syncAnswer(), criteria: flat }).lyriks)).toMatchObject({ criteria: flat })
  })
})

describe('get_implementation_status', () => {
  it('relays the platform answer whole, criteria and proven actions included', async () => {
    const answer = {
      available: true, ok: true, featureId: 'f', implemented: 12, partial: 3, missing: 5, verified: 7,
      criteria: { total: 2, entries: [{ key: 'criterion:c1', criterionId: 'c1', title: 'A closed cart refuses', standing: 'active', indexed: true, result: 'failing', stale: true, verification: { kind: 'unit', lastResult: { passed: false, at: '2026-09-19T10:00:00.000Z' } } }, { key: 'criterion:c2', criterionId: 'c2', title: 'Totals add up', standing: 'draft', indexed: false, result: 'none' }] },
    }
    const get = vi.fn().mockResolvedValue(answer)
    expect(await getStatusHandler({ project_id: 'p', feature_id: 'f', action_id: 'a1' }, { get } as unknown as LyriksClient)).toBe(answer)
    expect(get).toHaveBeenCalledWith('/api/behavior/implementation/status?projectId=p&featureId=f&actionId=a1')
  })

  it('says in both descriptions what a newer engine adds, and what a criterion entry may carry', () => {
    // @ts-expect-error testing the registered descriptions
    const tools = createMcpServer(null)._registeredTools as Record<string, { description: string }>
    for (const name of ['get_implementation_status', 'sync_implementation_index']) {
      const { description } = tools[name]
      expect(description, name).toContain('A newer engine also answers `criteria`, every acceptance criterion with its standing')
      expect(description, name).toContain('(`verified`, `failing`, `unverified`, or `none` when nothing verifies it), marked `stale` when its text changed after the result')
      expect(description, name).toContain('`verified`, how many actions are PROVEN against the code')
      expect(description, name).toContain('an older engine sends neither and the fields are absent')
      expect(description, name).toContain('`criterion:<id>` may carry `verification { kind, command, files, artifacts, lastResult { passed, at, summary, revision } }`')
    }
    expect(tools.sync_implementation_index.description).toContain('`criteria.entries` is cut to its first 50 rows with `criteria.total` kept')
  })
})
