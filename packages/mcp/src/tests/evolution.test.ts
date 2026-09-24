/**
 * Tests: the Evolution tools talk to the platform's aggregate endpoint, relay
 * the person flag verbatim, and turn a refused batch into an answer the agent
 * can read rather than a thrown HTTP status.
 */

import { describe, it, expect } from 'vitest'
import { applyEvolutionBatchHandler, getEvolutionHandler, parseRefusal } from '../tools/evolution.js'
import { setSectionHandler, patchSectionHandler } from '../tools/sections.js'
import type { LyriksClient } from '../lyriks-client.js'

function fakeClient(calls: Array<{ method: string; path: string; body?: unknown }>, answer: unknown = { ok: true }) {
  return {
    get: async (path: string) => {
      calls.push({ method: 'GET', path })
      return answer
    },
    post: async (path: string, body: unknown) => {
      calls.push({ method: 'POST', path, body })
      return answer
    },
    put: async (path: string, body: unknown) => {
      calls.push({ method: 'PUT', path, body })
      return answer
    },
  } as unknown as LyriksClient
}

describe('evolution tools', () => {
  it('reads the board or one dossier from the aggregate endpoint', async () => {
    const calls: Array<{ method: string; path: string }> = []
    await getEvolutionHandler({ project_id: 'p1' }, fakeClient(calls))
    await getEvolutionHandler({ project_id: 'p1', request_id: 'r1' }, fakeClient(calls))
    await getEvolutionHandler({ project_id: 'p1', request_id: 'r1', part: 'summary' }, fakeClient(calls))
    await getEvolutionHandler({ project_id: 'p1', request_id: 'r1', part: 'impact', section: 'leaves' }, fakeClient(calls))
    await getEvolutionHandler({ project_id: 'p1', request_id: 'r1', part: 'report', verdict: 'missing', offset: 50, limit: 25 }, fakeClient(calls))
    expect(calls.map((c) => c.path)).toEqual([
      '/api/evolution?projectId=p1',
      '/api/evolution?projectId=p1&requestId=r1',
      '/api/evolution?projectId=p1&requestId=r1',
      '/api/evolution?projectId=p1&requestId=r1&part=impact&section=leaves',
      '/api/evolution?projectId=p1&requestId=r1&part=report&verdict=missing&offset=50&limit=25',
    ])
  })

  it('posts the operations and the person relay flag', async () => {
    const calls: Array<{ method: string; path: string; body?: unknown }> = []
    await applyEvolutionBatchHandler(
      { project_id: 'p1', operations: [{ op: 'open_request', title: 'x', origin: 'internal_idea' }], as_person: true },
      fakeClient(calls),
    )
    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/api/evolution',
      body: { projectId: 'p1', operations: [{ op: 'open_request', title: 'x', origin: 'internal_idea' }], as_person: true },
    })
  })

  it('answers a refused batch with the platform body instead of throwing', async () => {
    const body = { ok: false, applied: false, results: [{ index: 0, op: 'cross_stage', ok: false, summary: 'An AI client cannot move a request between stages.' }] }
    const client = {
      post: async () => {
        throw new Error(`lyriks 422 on POST /api/evolution: ${JSON.stringify(body)}`)
      },
    } as unknown as LyriksClient
    const answer = (await applyEvolutionBatchHandler({ project_id: 'p1', operations: [{ op: 'cross_stage' }] }, client)) as Record<string, unknown>
    expect(answer.httpStatus).toBe(422)
    expect(answer.results).toEqual(body.results)
    expect(parseRefusal(new Error('lyriks 500 on POST /api/evolution: boom'))).toBeNull()
    await expect(
      applyEvolutionBatchHandler({ project_id: 'p1', operations: [] }, {
        post: async () => {
          throw new Error('lyriks 500 on POST /api/evolution: boom')
        },
      } as unknown as LyriksClient),
    ).rejects.toThrow('500')
  })

  it('refuses a raw section write on evolution and points at the typed tools', async () => {
    const calls: Array<{ method: string; path: string }> = []
    const client = fakeClient(calls, { section: 'evolution', projectId: 'p1', draft: { requests: [] } })
    const set = (await setSectionHandler({ project_id: 'p1', section: 'evolution', document: { requests: [] } }, client)) as Record<string, unknown>
    expect(set.refused).toBe(true)
    expect(String(set.reason)).toContain('apply_evolution_batch')
    const patch = (await patchSectionHandler(
      { project_id: 'p1', section: 'evolution', operations: [{ op: 'set', path: 'requests', value: [] }] },
      client,
    )) as Record<string, unknown>
    expect(patch.refused).toBe(true)
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([])
  })
})

/**
 * Field report, 2026-09-24: a report page over the cap came back as
 * `report.lines.items` wrapped in `partial`, and the next page as a bare
 * `report.lines` list; every reader broke on the change of shape once.
 */
describe('a page that does not fit is read again, smaller, in its own shape', () => {
  const pageOf = (limit: number, offset = 0, total = 300) => ({
    projectId: 'p1',
    request: {
      id: 'r1',
      report: {
        matched: total,
        offset,
        limit,
        lines: Array.from({ length: Math.min(limit, total - offset) }, (_, i) => ({ id: `l${offset + i}`, text: 'x'.repeat(200) })),
      },
    },
  })

  it('shrinks the page until it fits and says where the next one starts', async () => {
    const limits: number[] = []
    const client = {
      get: async (path: string) => {
        const limit = Number(new URLSearchParams(path.split('?')[1]).get('limit') ?? 150)
        limits.push(limit)
        return pageOf(limit)
      },
    } as unknown as LyriksClient
    const answer = (await getEvolutionHandler({ project_id: 'p1', request_id: 'r1', part: 'report' }, client, 10_000)) as ReturnType<typeof pageOf> & {
      request: { report: { nextOffset?: number; pageNote?: string } }
    }
    expect(JSON.stringify(answer).length).toBeLessThanOrEqual(10_000)
    expect(Array.isArray(answer.request.report.lines)).toBe(true)
    expect(answer.request.report.nextOffset).toBe(answer.request.report.lines.length)
    expect(answer.request.report.pageNote).toContain('offset')
    expect(limits.length).toBeGreaterThan(1)
  })

  it('leaves a page that fits alone, and marks the next offset only when rows remain', async () => {
    const client = { get: async () => pageOf(5, 0, 5) } as unknown as LyriksClient
    const answer = (await getEvolutionHandler({ project_id: 'p1', request_id: 'r1', part: 'report' }, client)) as ReturnType<typeof pageOf>
    expect(answer.request.report).not.toHaveProperty('nextOffset')
  })

  it('passes the report scope through', async () => {
    const calls: Array<{ method: string; path: string }> = []
    await getEvolutionHandler({ project_id: 'p1', request_id: 'b8456fd3', part: 'report', scope: 'request' }, fakeClient(calls))
    expect(calls[0].path).toContain('scope=request')
    expect(calls[0].path).toContain('requestId=b8456fd3')
  })
})
