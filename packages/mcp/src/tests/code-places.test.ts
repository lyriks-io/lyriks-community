/**
 * Tests (criterion 97ef2d0d): a read of one action or one surface ends where the
 * client's own code tools start. It carries the places the implementation index
 * last located, how far each can be trusted, what is not located yet, and one
 * sentence saying what to do with them.
 */

import { describe, it, expect, vi } from 'vitest'
import { readBehaviorFeatureHandler } from '../tools/behavior.js'
import { MAX_PLACES, NEXT_LOCATED, NEXT_NOT_LINKED } from '../tools/code-places.js'
import type { LyriksClient } from '../lyriks-client.js'

const feature = {
  id: 'feat-gap', name: 'Gap detection', updatedAt: '2026-11-05T10:00:00.000Z',
  surfaces: [
    {
      id: 's1', name: 'Gap list',
      stateDefinitions: [{ id: 'sd1', path: 'gap.coverage', type: 'string' }],
      rules: [{ id: 'sr1', description: 'A gap with no document reads Not covered' }],
      invariants: [{ id: 'si1', name: 'Coverage is one of three values' }],
      actions: [
        {
          id: 'a1', name: 'Request a gap analysis',
          rules: [
            { id: 'r1', description: 'Text or records, never both' },
            { id: 'r2', description: 'The daily scan limit is respected' },
            { id: 'r3', description: 'Added after the last sync' },
          ],
          invariants: [], transitions: [], emittedEvents: ['gap.requested'],
        },
        { id: 'a2', name: 'View the source', rules: [{ id: 'r4', description: 'An invalid record id reads Unavailable' }], invariants: [], transitions: [] },
      ],
    },
    { id: 's2', name: 'Other', actions: [{ id: 'a9', name: 'Elsewhere', rules: [] }] },
  ],
}

const actionReport = {
  actionId: 'a1', actionSlug: 'request', actionName: 'Request a gap analysis', surfaceId: 's1',
  expectedEntities: [],
  foundEntities: [
    { entityType: 'action', entityId: 'a1', capturedAt: '2026-10-01T09:00:00.000Z', locations: [{ file: 'knowledge/gap/GapService.java', line: 120, snippet: 'public GapRequest requestGapAnalysis(GapInput input) {' }] },
    { entityType: 'rule', entityId: 'r1', capturedAt: '2026-10-01T09:00:00.000Z', locations: [{ file: 'knowledge/gap/GapService.java', line: 131, snippet: 'if (input.hasText() == input.hasRecords()) throw new GapInputException();', stale: true, suggestedLine: 140 }] },
    { entityType: 'event', entityId: 'gap.requested', capturedAt: '2026-10-01T09:00:00.000Z', locations: [{ file: 'knowledge/gap/GapEvents.java', line: 12, unverified: true }] },
  ],
  missingEntities: [{ entityType: 'rule', entityId: 'r2', entityName: 'daily-scan-limit' }],
  extraTags: [],
  reportedAt: '2026-10-01T09:00:00.000Z',
  auditMeta: { auditedAt: '2026-10-01T08:59:00.000Z', gitCommit: '5f1c2ab', verifiedAt: '2026-10-02T10:00:00.000Z' },
}

/** A platform that answers the feature read and the implementation status, recording every URL. */
function platform(status: unknown | ((url: string) => unknown)) {
  const get = vi.fn().mockImplementation(async (url: string) => {
    if (!url.startsWith('/api/behavior/implementation/status')) return { snapshot: { format: 'unspaghettit', version: 1, feature } }
    const answer = typeof status === 'function' ? (status as (u: string) => unknown)(url) : status
    if (answer instanceof Error) throw answer
    return answer
  })
  return { lyriks: { get } as unknown as LyriksClient, get }
}

type Code = {
  linked: boolean; located: number; notLocated: number; available?: boolean; reason?: string
  places?: Array<Record<string, unknown>>; morePlaces?: number
  notLocatedYet?: Array<{ key: string; name?: string }>
  audits?: Array<Record<string, unknown>>; next: string
}
const codeOf = (answer: unknown) => (answer as { code: Code }).code

describe('get_behavior_feature action_id: where the code is [criterion:97ef2d0d]', () => {
  it('carries each located place with its trust marks, what is not located yet, the audit and what to do next', async () => {
    const { lyriks, get } = platform({ available: true, ok: true, featureId: 'feat-gap', revision: 3, updatedAt: '2026-10-01T09:00:00.000Z', action: actionReport })
    const answer = await readBehaviorFeatureHandler({ project_id: 'sf-364516', feature_id: 'feat-gap', action_id: 'a1' }, lyriks)
    expect(get).toHaveBeenCalledWith('/api/behavior/implementation/status?projectId=sf-364516&featureId=feat-gap&actionId=a1')
    expect(answer).toMatchObject({ found: true, action: { id: 'a1' } })

    const code = codeOf(answer)
    expect(code).toMatchObject({ linked: true, located: 3, notLocated: 2 })
    expect(code.places).toEqual([
      { key: 'action:a1', name: 'Request a gap analysis', file: 'knowledge/gap/GapService.java', line: 120, code: 'public GapRequest requestGapAnalysis(GapInput input) {', locatedAt: '2026-10-01T09:00:00.000Z' },
      { key: 'rule:r1', name: 'Text or records, never both', file: 'knowledge/gap/GapService.java', line: 131, code: 'if (input.hasText() == input.hasRecords()) throw new GapInputException();', stale: true, movedToLine: 140, locatedAt: '2026-10-01T09:00:00.000Z' },
      { key: 'event:gap.requested', name: 'gap.requested', file: 'knowledge/gap/GapEvents.java', line: 12, unverified: true, locatedAt: '2026-10-01T09:00:00.000Z' },
    ])
    // The spec's own words name what is missing, and a rule added after the sync is not forgotten.
    expect(code.notLocatedYet).toEqual([
      { key: 'rule:r2', name: 'The daily scan limit is respected' },
      { key: 'rule:r3', name: 'Added after the last sync' },
    ])
    expect(code.audits).toEqual([{ key: 'action:a1', reportedAt: '2026-10-01T09:00:00.000Z', auditedAt: '2026-10-01T08:59:00.000Z', commit: '5f1c2ab', provenAgainstCode: '2026-10-02T10:00:00.000Z' }])
    expect(code.next).toBe(NEXT_LOCATED)
    expect(code.next).toContain('your own code tools')
    expect(code.next).toContain('tell the person where the code does otherwise')
    expect(code.next).toContain('check that the code line still stands at that line before you trust a place')
  })

  it('says the spec is not linked to the code yet when nothing was ever reported', async () => {
    const { lyriks } = platform({ available: true, ok: true, status: null })
    const code = codeOf(await readBehaviorFeatureHandler({ project_id: 'p', feature_id: 'feat-gap', action_id: 'a2' }, lyriks))
    expect(code).toEqual({
      linked: false, located: 0, notLocated: 2,
      notLocatedYet: [{ key: 'action:a2', name: 'View the source' }, { key: 'rule:r4', name: 'An invalid record id reads Unavailable' }],
      next: NEXT_NOT_LINKED,
    })
    expect(code.next).toContain('by the names this answer gives')
  })

  it('still returns the element, saying why, when the places cannot be read', async () => {
    for (const status of [new Error('Behavior engine unavailable'), { available: true, ok: false, error: 'no such feature' }, 'junk']) {
      const { lyriks } = platform(status)
      const answer = await readBehaviorFeatureHandler({ project_id: 'p', feature_id: 'feat-gap', action_id: 'a1' }, lyriks)
      expect(answer).toMatchObject({ found: true, action: { id: 'a1' } })
      const code = codeOf(answer)
      expect(code.available).toBe(false)
      expect(code.reason).toBeTruthy()
      expect(code.next).toContain('search the code with your own code tools')
    }
  })

  it('caps the places and counts the rest', async () => {
    const many = {
      ...actionReport,
      foundEntities: [{ entityType: 'action', entityId: 'a1', capturedAt: 'x', locations: Array.from({ length: MAX_PLACES + 7 }, (_, i) => ({ file: `f${i}.java`, line: i + 1 })) }],
      missingEntities: [],
    }
    const { lyriks } = platform({ available: true, ok: true, action: many })
    const code = codeOf(await readBehaviorFeatureHandler({ project_id: 'p', feature_id: 'feat-gap', action_id: 'a1' }, lyriks))
    expect(code.places).toHaveLength(MAX_PLACES)
    expect(code.morePlaces).toBe(7)
    expect(code.located).toBe(1)
  })
})

describe('get_behavior_feature surface_id: where the code is [criterion:97ef2d0d]', () => {
  it('reads the whole record once and keeps the surface and its own actions only', async () => {
    const { lyriks, get } = platform({
      available: true, ok: true, featureId: 'feat-gap',
      surfaces: [{
        surfaceId: 's1', surfaceSlug: 'gap-list', surfaceName: 'Gap list', expectedEntities: [], extraTags: [], reportedAt: '2026-10-01T09:00:00.000Z',
        foundEntities: [{ entityType: 'state', entityId: 'sd1', entityName: 'gap.coverage', capturedAt: 'c', locations: [{ file: 'knowledge/gap/Coverage.java', line: 8, snippet: 'enum Coverage { COVERED, PARTIAL, NOT_COVERED }' }] }],
        missingEntities: [],
      }],
      actions: [actionReport, { ...actionReport, actionId: 'a9', surfaceId: 's2', foundEntities: [{ entityType: 'action', entityId: 'a9', capturedAt: 'c', locations: [{ file: 'elsewhere.java', line: 1 }] }] }],
    })
    const answer = await readBehaviorFeatureHandler({ project_id: 'p', feature_id: 'feat-gap', surface_id: 's1' }, lyriks)
    expect(get).toHaveBeenCalledWith('/api/behavior/implementation/status?projectId=p&featureId=feat-gap')
    const code = codeOf(answer)
    const keys = (code.places ?? []).map((p) => p.key)
    expect(keys).toContain('state:gap.coverage')
    expect(keys).toContain('rule:r1')
    expect(keys).not.toContain('action:a9')
    expect((code.audits ?? []).map((a) => a.key)).toEqual(['surface:s1', 'action:a1'])
    // The surface's own rule and invariant, and the second action no report covers, wait to be located.
    expect((code.notLocatedYet ?? []).map((n) => n.key)).toEqual(['rule:r2', 'surface_rule:sr1', 'surface_invariant:si1', 'rule:r3', 'action:a2', 'rule:r4'])
  })
})

describe('reads that carry no code [criterion:97ef2d0d]', () => {
  it('leaves the table of contents, the index keys, an exact path, an unknown id and a draft alone', async () => {
    const { lyriks, get } = platform({ available: true, ok: true, status: null })
    const reads = [
      { summary: true },
      { index_keys: true },
      { paths: ['snapshot.feature.name'], action_id: 'a1' },
      { action_id: 'nope' },
    ]
    for (const args of reads) {
      const answer = await readBehaviorFeatureHandler({ project_id: 'p', feature_id: 'feat-gap', ...args }, lyriks) as Record<string, unknown>
      expect(answer.code, JSON.stringify(args)).toBeUndefined()
    }
    const draft = await readBehaviorFeatureHandler({ project_id: 'p', feature_id: 'draft:req-1:leaf', action_id: 'a1' }, lyriks) as Record<string, unknown>
    expect(draft.code).toBeUndefined()
    expect(get.mock.calls.filter(([url]) => String(url).startsWith('/api/behavior/implementation/status'))).toHaveLength(0)
  })
})
