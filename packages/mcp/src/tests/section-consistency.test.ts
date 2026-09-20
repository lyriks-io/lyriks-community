import { describe, expect, it, vi } from 'vitest'
import { SECTIONS, getSectionHandler, patchSectionHandler, setSectionHandler } from '../tools/sections.js'
import { getPath, selectPaths } from '../util/shape.js'
import { LyriksClient } from '../lyriks-client.js'

describe('section consistency', () => {
  it('advertises only the platform public sections, including Baselines and Experience', () => {
    expect([...SECTIONS].sort()).toEqual(['scope', 'foundation', 'users', 'features', 'experience',
      'rules', 'data', 'architecture', 'coherence', 'glossary', 'approvals', 'baselines', 'documents'].sort())
  })
  it('reports missing paths and retains null, false, zero and valid array indices', async () => {
    const draft = { items: [{ value: 0 }], empty: null, flag: false }
    const client = { get: vi.fn(async () => ({ revision: 7, draft })) } as unknown as LyriksClient
    expect(await getSectionHandler({ project_id: 'p', section: 'documents',
      paths: ['items.0.value', 'empty', 'flag', 'missing', 'items.9'] }, client)).toEqual({
      projectId: 'p', section: 'documents', revision: 7,
      selected: { 'items.0.value': 0, empty: null, flag: false }, missingPaths: ['missing', 'items.9'],
    })
    expect(getPath(draft, 'items.00.value')).toBeUndefined()
    expect(selectPaths(draft, ['__proto__', 'constructor', 'toString']).missingPaths).toHaveLength(3)
  })
  it('passes the read revision to the actual write', async () => {
    const put = vi.fn(async () => ({ revision: 8 }))
    const client = { get: vi.fn(async () => ({ revision: 7, draft: { sources: [] } })), put } as unknown as LyriksClient
    await patchSectionHandler({ project_id: 'p', section: 'documents',
      operations: [{ op: 'set', path: 'sources', value: [] }] }, client)
    expect(put).toHaveBeenCalledWith('/api/draft/documents', { projectId: 'p', sources: [] }, { 'x-lyriks-rev': '7' })
  })
  it('says on every write whether it went out under the revision check', async () => {
    const guarded = { get: vi.fn(async () => ({ revision: 7, draft: { sources: [] } })), put: vi.fn(async () => ({ revision: 8 })) } as unknown as LyriksClient
    const operations = [{ op: 'set' as const, path: 'sources', value: [] }]
    const patched = await patchSectionHandler({ project_id: 'p', section: 'documents', operations }, guarded) as Record<string, unknown>
    expect(patched).toMatchObject({ revision: 8, writeGuard: 'revision-checked' })
    expect(patched).not.toHaveProperty('warnings')
    expect(await setSectionHandler({ project_id: 'p', section: 'documents', document: { sources: [] } }, guarded)).toEqual({ revision: 8, writeGuard: 'revision-checked' })
  })
  it('does not let the revision of an older platform pass for a guarded write', async () => {
    // Its read carries no revision, so no header is sent, yet its PUT answers one.
    const put = vi.fn(async () => ({ revision: 182 }))
    const older = { get: vi.fn(async () => ({ draft: { sources: [] } })), put } as unknown as LyriksClient
    const operations = [{ op: 'set' as const, path: 'sources', value: [] }]
    for (const result of [
      await patchSectionHandler({ project_id: 'p', section: 'documents', operations }, older),
      await setSectionHandler({ project_id: 'p', section: 'documents', document: { sources: [] } }, older),
    ] as Array<{ revision: number; writeGuard: string; warnings: string[] }>) {
      expect(result).toMatchObject({ revision: 182, writeGuard: 'unavailable' })
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]).toContain('NOT protected against concurrent edits')
      expect(result.warnings[0]).toContain('the one AFTER the write')
    }
    expect(put).toHaveBeenCalledWith('/api/draft/documents', { projectId: 'p', sources: [] }, {})
  })
  it('rejects a preview or full replacement based on an old revision', async () => {
    const put = vi.fn()
    const client = { get: vi.fn(async () => ({ revision: 8, draft: {} })), put } as unknown as LyriksClient
    await expect(patchSectionHandler({ project_id: 'p', section: 'documents', expected_revision: 7,
      operations: [{ op: 'set', path: 'sources', value: [] }] }, client)).rejects.toThrow('revision conflict')
    await expect(setSectionHandler({ project_id: 'p', section: 'documents', expected_revision: 7,
      document: {} }, client)).rejects.toThrow('revision conflict')
    expect(put).not.toHaveBeenCalled()
  })
  it('returns the revision with a preview without saving', async () => {
    const put = vi.fn()
    const client = { get: vi.fn(async () => ({ revision: 7, draft: {} })), put,
      post: vi.fn(async () => ({ valid: true })) } as unknown as LyriksClient
    expect(await patchSectionHandler({ project_id: 'p', section: 'documents', dry_run: true,
      operations: [{ op: 'set', path: 'sources', value: [] }] }, client)).toMatchObject({ persisted: false, baseRevision: 7 })
    expect(put).not.toHaveBeenCalled()
  })
  it('never retries a failed mutation whose outcome may be unknown', async () => {
    const fetchMock = vi.fn(async () => new Response('ENOENT .svelte-kit/types', { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)
    try {
      await expect(new LyriksClient().put('/api/draft/documents', {})).rejects.toThrow('500')
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally { vi.unstubAllGlobals() }
  })
})
