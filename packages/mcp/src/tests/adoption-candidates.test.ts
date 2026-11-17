import { expect, it, vi } from 'vitest'
import { createMcpServer } from '../server.js'
import { CANDIDATE_DECISIONS, CANDIDATE_KINDS, SPAN_TARGETS_NOTE, sourcesNamed, stageCandidatesHandler, withStagedCandidateIds } from '../tools/adoption.js'
import type { LyriksClient } from '../lyriks-client.js'

// Criterion 11ee82f8 of feat-mcp-authoring (lyriks-feb747): every stage_candidates
// call failed because the element type was optional and free text.
it('declares the element type of a candidate and the decision that closes it as required choices', () => {
  // @ts-expect-error reading the registered tools the way the SDK does
  const tools = createMcpServer(null)._registeredTools as Record<string, { inputSchema: { safeParse: (v: unknown) => { success: boolean } } }>
  const stage = tools.stage_candidates.inputSchema
  const span = { start_offset: 0, end_offset: 10, summary: 'An expired link still redirects' }
  expect(stage.safeParse({ project_id: 'p', feature_id: 'f', candidates: [span] }).success).toBe(false)
  expect(stage.safeParse({ project_id: 'p', feature_id: 'f', candidates: [{ ...span, kind: 'whatever' }] }).success).toBe(false)
  for (const kind of CANDIDATE_KINDS) expect(stage.safeParse({ project_id: 'p', feature_id: 'f', candidates: [{ ...span, kind }] }).success).toBe(true)
  const dispose = tools.dispose_candidate.inputSchema
  expect(dispose.safeParse({ project_id: 'p', feature_id: 'f', candidate_id: 'c' }).success).toBe(false)
  for (const disposition of CANDIDATE_DECISIONS) expect(dispose.safeParse({ project_id: 'p', feature_id: 'f', candidate_id: 'c', disposition }).success).toBe(true)
})

it('forwards the element type of every candidate', async () => {
  const post = vi.fn().mockResolvedValue({ ok: true })
  await stageCandidatesHandler({ project_id: 'p', feature_id: 'f', candidates: [{ start_offset: 0, end_offset: 5, summary: 's', kind: 'rule' }] }, { post } as unknown as LyriksClient)
  expect(post.mock.calls[0][1].candidates[0].kind).toBe('rule')
})

// Criterion 0aae94bd: 102 sources capped at 91, the one needed out of reach.
it('finds an attached source by part of its file name', () => {
  const answer = { ok: true, count: 3, sources: [{ id: 'a', name: 'server/handlers/links.handler.js' }, { id: 'b', name: 'server/handlers/auth.handler.js' }, { id: 'c', name: 'server/views/links/table.hbs' }] }
  expect(sourcesNamed(answer, 'LINKS.handler')).toEqual({ ok: true, count: 1, sources: [{ id: 'a', name: 'server/handlers/links.handler.js' }] })
  expect((sourcesNamed(answer, 'links') as { count: number }).count).toBe(2)
})

// Criterion 65c8df6d: the ids of the candidates just staged had to be read back through get_provenance.
it('leads the answer with the id of every candidate staged, beside what was sent for it', async () => {
  const post = vi.fn().mockResolvedValue({
    available: true,
    ok: false,
    staged: 1,
    failed: 1,
    results: [
      { ok: true, candidateId: 'c-1', proposedKind: 'rule' },
      { ok: false, error: 'endOffset is past the end of the source', summary: 'Out of range' },
    ],
  })
  const answer = (await stageCandidatesHandler(
    {
      project_id: 'p',
      feature_id: 'f',
      source_id: 'src-1',
      candidates: [
        { start_offset: 0, end_offset: 40, summary: 'Bookmarks are unique per URL', kind: 'rule' },
        { start_offset: 900, end_offset: 990, summary: 'Out of range', kind: 'state' },
      ],
    },
    { post } as unknown as LyriksClient,
  )) as Record<string, unknown>
  expect(Object.keys(answer)[0]).toBe('created')
  expect(answer.created).toEqual([
    { candidateId: 'c-1', kind: 'rule', summary: 'Bookmarks are unique per URL', startOffset: 0, endOffset: 40, sourceId: 'src-1' },
  ])
  expect(answer.results).toHaveLength(2)
})

it('relays the rows a newer platform already pairs, and pairs nothing it cannot line up', () => {
  const args = { project_id: 'p', feature_id: 'f', candidates: [{ start_offset: 0, end_offset: 5, summary: 's', kind: 'rule' }] }
  const platformPaired = { created: [{ candidateId: 'c-1' }], results: [{ ok: true, candidateId: 'c-1' }] }
  expect(withStagedCandidateIds(platformPaired, args)).toBe(platformPaired)
  expect(withStagedCandidateIds({ results: [{ ok: true, candidateId: 'a' }, { ok: true, candidateId: 'b', proposedKind: 'event' }] }, args)).toEqual({
    created: [
      { candidateId: 'a', kind: null, summary: null, startOffset: null, endOffset: null, sourceId: null },
      { candidateId: 'b', kind: 'event', summary: null, startOffset: null, endOffset: null, sourceId: null },
    ],
    results: [{ ok: true, candidateId: 'a' }, { ok: true, candidateId: 'b', proposedKind: 'event' }],
  })
  expect(withStagedCandidateIds({ ok: false, error: 'No sourceId' }, args)).toEqual({ ok: false, error: 'No sourceId' })
})

// Criterion 8636a090: spans on parameters, effects, scenarios, goals, criteria and personas were refused with nothing saying which kinds a span accepts.
it('says in record_element_spans which elements a span can point at and which carry none', () => {
  // @ts-expect-error reading the registered tools the way the SDK does
  const tools = createMcpServer(null)._registeredTools as Record<string, { description: string }>
  const described = tools.record_element_spans.description
  expect(described).toContain(SPAN_TARGETS_NOTE)
  for (const target of ['a surface', 'a state (by the id of its state definition', 'an action', 'a rule', 'an invariant', 'a transition', 'an event', 'an entity']) {
    expect(described).toContain(target)
  }
  for (const spanless of ['Effects carry no span', 'parameters', 'exposures', 'scenarios', 'reachability goals', 'personas', 'resources', 'constants', 'acceptance criteria']) {
    expect(described).toContain(spanless)
  }
  expect(tools.stage_candidates.description).toContain('The answer leads with `created`')
})
