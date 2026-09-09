/**
 * Tests: get_knowledge_graph handler — arg → lyriks query-param mapping.
 * The scoping semantics themselves live in the wizard app (domain/graph/scope.ts there);
 * here we only assert the handler asks lyriks the right question.
 */

import { describe, it, expect, vi } from 'vitest'
import { getKnowledgeGraphHandler } from '../tools/knowledge_graph.js'
import type { LyriksClient } from '../lyriks-client.js'

function makeLyriks(): { lyriks: LyriksClient; get: ReturnType<typeof vi.fn> } {
  const get = vi.fn().mockResolvedValue({ ok: true })
  return { lyriks: { get } as unknown as LyriksClient, get }
}

const calledPath = (get: ReturnType<typeof vi.fn>) => new URL(`http://x${get.mock.calls[0][0]}`)

describe('getKnowledgeGraphHandler', () => {
  it('KG01 — a bare call asks for the overview view', async () => {
    const { lyriks, get } = makeLyriks()
    await getKnowledgeGraphHandler({ project_id: 'causette' }, lyriks)
    const url = calledPath(get)
    expect(url.pathname).toBe('/api/graph')
    expect(url.searchParams.get('projectId')).toBe('causette')
    expect(url.searchParams.get('view')).toBe('overview')
  })

  it('KG02 — any scoping arg switches off the overview and maps onto query params', async () => {
    const { lyriks, get } = makeLyriks()
    await getKnowledgeGraphHandler(
      {
        project_id: 'causette',
        source: 'local',
        contexts: ['behavior', 'data'],
        kinds: ['feature'],
        q: 'checkout',
        focus_node: 'entity:order',
        depth: 2,
        limit: 50,
      },
      lyriks,
    )
    const url = calledPath(get)
    expect(url.searchParams.get('view')).toBeNull()
    expect(url.searchParams.get('source')).toBe('local')
    expect(url.searchParams.get('contexts')).toBe('behavior,data')
    expect(url.searchParams.get('kinds')).toBe('feature')
    expect(url.searchParams.get('q')).toBe('checkout')
    expect(url.searchParams.get('focus')).toBe('entity:order')
    expect(url.searchParams.get('depth')).toBe('2')
    expect(url.searchParams.get('limit')).toBe('50')
  })

  it('KG03 — limit alone still requests the overview (it sizes topNodes)', async () => {
    const { lyriks, get } = makeLyriks()
    await getKnowledgeGraphHandler({ project_id: 'causette', limit: 10 }, lyriks)
    const url = calledPath(get)
    expect(url.searchParams.get('view')).toBe('overview')
    expect(url.searchParams.get('limit')).toBe('10')
  })
})
