/**
 * Tests: code → spec (adoption + implementation index)
 *
 * These handlers are thin proxies to the wizard app, so what can actually break is the
 * translation: the route they hit, and the snake_case → camelCase mapping of
 * every nested field. A wrong nested key is silently dropped by the route's
 * validation and shows up as "the engine ignored my spans", so each nested
 * shape is asserted explicitly.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  attachSourceHandler,
  finalizeAnalysisHandler,
  flagConflictHandler,
  getProvenanceHandler,
  listSourcesHandler,
  recordSpansHandler,
  stageCandidatesHandler,
} from '../tools/adoption.js'
import {
  driftHandler,
  gapsHandler,
  reportStatusHandler,
  seedIndexHandler,
  syncIndexHandler,
} from '../tools/implementation.js'
import type { LyriksClient } from '../lyriks-client.js'

function makeLyriks(response: unknown = { ok: true }) {
  const post = vi.fn().mockResolvedValue(response)
  const get = vi.fn().mockResolvedValue(response)
  const lyriks = { post, get } as unknown as LyriksClient
  const body = () => post.mock.calls.at(-1)?.[1] as Record<string, unknown>
  const path = () => (get.mock.calls.at(-1)?.[0] ?? post.mock.calls.at(-1)?.[0]) as string
  return { lyriks, post, get, body, path }
}

describe('attach_source', () => {
  it('POSTs the sources route and maps file_name → fileName', async () => {
    const { lyriks, post, body } = makeLyriks()

    await attachSourceHandler(
      {
        project_id: 'proj-1',
        feature_id: 'feat-1',
        file_name: 'src/lib/cart.ts',
        content: 'export const add = () => {}',
        kind: 'code',
      },
      lyriks,
    )

    expect(post).toHaveBeenCalledWith('/api/behavior/sources', expect.any(Object))
    expect(body()).toEqual({
      projectId: 'proj-1',
      featureId: 'feat-1',
      fileName: 'src/lib/cart.ts',
      content: 'export const add = () => {}',
      kind: 'code',
    })
  })

  it('omits optional ranking fields rather than sending undefined', async () => {
    const { lyriks, body } = makeLyriks()
    await attachSourceHandler(
      { project_id: 'p', feature_id: 'f', file_name: 'a.ts', content: '' },
      lyriks,
    )
    expect(body()).not.toHaveProperty('authority')
    expect(body()).not.toHaveProperty('artifact')
  })
})

describe('list_sources', () => {
  it('lists by project', async () => {
    const { lyriks, path } = makeLyriks()
    await listSourcesHandler({ project_id: 'proj-1' }, lyriks)
    expect(path()).toBe('/api/behavior/sources?projectId=proj-1')
  })

  it('reads one source back, with paging, when source_id is given', async () => {
    const { lyriks, path } = makeLyriks()
    await listSourcesHandler({ project_id: 'proj-1', source_id: 's-1', offset: 10, max_chars: 500 }, lyriks)
    expect(path()).toBe('/api/behavior/sources?projectId=proj-1&sourceId=s-1&offset=10&maxChars=500')
  })
})

describe('record_element_spans', () => {
  it('maps every nested span field, since a wrong key is silently dropped downstream', async () => {
    const { lyriks, post, body } = makeLyriks()

    await recordSpansHandler(
      {
        project_id: 'proj-1',
        feature_id: 'feat-1',
        source_id: 's-1',
        spans: [
          { element_id: 'act-1', start_offset: 0, end_offset: 42 },
          { element_id: 'rule-2', start_offset: 50, end_offset: 90, source_id: 's-2' },
        ],
      },
      lyriks,
    )

    expect(post).toHaveBeenCalledWith('/api/behavior/analysis', expect.any(Object))
    expect(body()).toEqual({
      op: 'record_spans',
      projectId: 'proj-1',
      featureId: 'feat-1',
      sourceId: 's-1',
      spans: [
        { elementId: 'act-1', startOffset: 0, endOffset: 42 },
        { elementId: 'rule-2', startOffset: 50, endOffset: 90, sourceId: 's-2' },
      ],
    })
  })
})

describe('stage_candidates', () => {
  it('maps nested candidate fields and keeps confidence 0 (not falsy-dropped)', async () => {
    const { lyriks, body } = makeLyriks()

    await stageCandidatesHandler(
      {
        project_id: 'p',
        feature_id: 'f',
        candidates: [{ start_offset: 1, end_offset: 2, summary: 'retry loop', confidence: 0 }],
      },
      lyriks,
    )

    expect((body().candidates as unknown[])[0]).toEqual({
      startOffset: 1,
      endOffset: 2,
      summary: 'retry loop',
      confidence: 0,
    })
  })
})

describe('flag_conflict', () => {
  it('maps each statement source_id → sourceId', async () => {
    const { lyriks, body } = makeLyriks()

    await flagConflictHandler(
      {
        project_id: 'p',
        feature_id: 'f',
        summary: 'docs say 3 retries, code does 5',
        statements: [{ source_id: 's-doc', statement: '3 retries' }],
      },
      lyriks,
    )

    expect(body().statements).toEqual([{ sourceId: 's-doc', statement: '3 retries' }])
  })
})

describe('finalize_analysis / get_provenance', () => {
  it('finalize carries the op discriminator', async () => {
    const { lyriks, body } = makeLyriks()
    await finalizeAnalysisHandler({ project_id: 'p', feature_id: 'f' }, lyriks)
    expect(body()).toEqual({ op: 'finalize', projectId: 'p', featureId: 'f' })
  })

  it('provenance asks for coverage only when requested', async () => {
    const { lyriks, path } = makeLyriks()
    await getProvenanceHandler({ project_id: 'p', feature_id: 'f' }, lyriks)
    expect(path()).not.toContain('coverage')

    await getProvenanceHandler({ project_id: 'p', feature_id: 'f', coverage: true }, lyriks)
    expect(path()).toContain('coverage=true')
  })
})

describe('seed_implementation_index', () => {
  it('is a GET — it reads entries out, it does not write an index anywhere', async () => {
    const { lyriks, get, path } = makeLyriks()

    await seedIndexHandler({ project_id: 'proj-1', feature_id: 'feat-1' }, lyriks)

    expect(get).toHaveBeenCalled()
    expect(path()).toBe('/api/behavior/implementation/index?projectId=proj-1&featureId=feat-1')
  })
})

describe('index-backed reads', () => {
  const index = { 'action:a': { status: 'implemented', file: 'a.ts', line: 3, signature: 'const a' } }

  it('sync sends the caller-held index, project-scoped', async () => {
    const { lyriks, post, body } = makeLyriks()
    await syncIndexHandler({ project_id: 'proj-1', index }, lyriks)
    expect(post).toHaveBeenCalledWith('/api/behavior/implementation/index', expect.any(Object))
    expect(body()).toEqual({ projectId: 'proj-1', index })
  })

  it('gaps POSTs the index rather than trying to fit it in a query string', async () => {
    const { lyriks, post, body } = makeLyriks()
    await gapsHandler({ project_id: 'proj-1', feature_id: 'feat-1', index }, lyriks)
    expect(post).toHaveBeenCalledWith('/api/behavior/implementation/gaps', expect.any(Object))
    expect(body()).toEqual({ projectId: 'proj-1', index, featureId: 'feat-1' })
  })

  it('drift always carries the project scope, with or without a feature', async () => {
    const { lyriks, body } = makeLyriks()

    await driftHandler({ project_id: 'proj-1', index }, lyriks)
    expect(body()).toEqual({ projectId: 'proj-1', index })

    await driftHandler({ project_id: 'proj-1', index, feature_id: 'feat-1' }, lyriks)
    expect(body()).toEqual({ projectId: 'proj-1', index, featureId: 'feat-1' })
  })
})

describe('report_implementation_status', () => {
  it('maps found entities in the single-scope form', async () => {
    const { lyriks, body } = makeLyriks()

    await reportStatusHandler(
      {
        project_id: 'p',
        feature_id: 'f',
        action_id: 'act-1',
        found_entities: [
          { entity_type: 'action', entity_id: 'act-1', locations: [{ file: 'a.ts', line: 12 }] },
        ],
      },
      lyriks,
    )

    expect(body()).toEqual({
      projectId: 'p',
      featureId: 'f',
      actionId: 'act-1',
      foundEntities: [{ entityType: 'action', entityId: 'act-1', locations: [{ file: 'a.ts', line: 12 }] }],
    })
  })

  it('maps the batch form, including per-entry scopes', async () => {
    const { lyriks, body } = makeLyriks()

    await reportStatusHandler(
      {
        project_id: 'p',
        feature_id: 'f',
        entries: [
          {
            surface_id: 'surf-1',
            found_entities: [
              { entity_type: 'state', entity_id: 'st-1', locations: [{ file: 's.ts' }] },
            ],
          },
        ],
      },
      lyriks,
    )

    expect(body().entries).toEqual([
      {
        surfaceId: 'surf-1',
        foundEntities: [{ entityType: 'state', entityId: 'st-1', locations: [{ file: 's.ts' }] }],
      },
    ])
    // The batch form must not also send a single-scope payload.
    expect(body()).not.toHaveProperty('foundEntities')
  })
})
