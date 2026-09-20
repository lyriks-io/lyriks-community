import { describe, expect, it, vi } from 'vitest'
import type { LyriksClient } from '../lyriks-client.js'
import { applySectionPatch, patchSectionHandler, type PatchOp } from '../tools/sections.js'

describe('safe section patch preview', () => {
  function setup() {
    const draft = { screens: [{ id: 's', name: 'Original' }] }
    const get = vi.fn().mockResolvedValue({ draft })
    const post = vi.fn().mockResolvedValue({ valid: true, issues: [], persisted: false })
    const put = vi.fn().mockResolvedValue({ ok: true })
    return { draft, get, post, put, client: { get, post, put } as unknown as LyriksClient }
  }
  const operations: PatchOp[] = [{ op: 'merge', collection: 'screens', id: 's', value: { name: 'Proposed' } }]
  it('previews the modified copy through the platform without saving or mutating the original', async () => {
    const { draft, post, put, client } = setup()
    const result = await patchSectionHandler({ project_id: 'p', section: 'experience', operations, dry_run: true }, client)
    expect(result).toMatchObject({ dryRun: true, persisted: false, opsApplied: 1, validation: { valid: true } })
    expect(post).toHaveBeenCalledWith('/api/sections/validate', { projectId: 'p', section: 'experience', draft: { projectId: 'p', screens: [{ id: 's', name: 'Proposed' }] } })
    expect(put).not.toHaveBeenCalled()
    expect(draft.screens[0].name).toBe('Original')
  })
  it('reports a rejected preview without falling back to a real write', async () => {
    const { post, put, client } = setup()
    post.mockResolvedValueOnce({ valid: false, issues: [{ path: 'screens', message: 'invalid' }] })
    expect(await patchSectionHandler({ project_id: 'p', section: 'experience', operations, dry_run: true }, client)).toMatchObject({ persisted: false, validation: { valid: false } })
    expect(put).not.toHaveBeenCalled()
  })
  it('says the dry run is unavailable, with the local match counts, on a platform without the validation route', async () => {
    const { post, put, client } = setup()
    post.mockRejectedValueOnce(new Error('lyriks 404 on POST /api/sections/validate: 404 Not Found [the platform answered with a web page, so this route probably does not exist on this platform version]'))
    const result = await patchSectionHandler({ project_id: 'p', section: 'experience', dry_run: true,
      operations: [...operations, { op: 'remove', collection: 'screens', id: 'missing' }] }, client) as Record<string, unknown>
    expect(result).toMatchObject({ dryRun: true, persisted: false, dryRunUnavailable: true, opsApplied: 1, opsTotal: 2, changed: ['screens[s]'] })
    expect(String(result.reason)).toContain('/api/sections/validate')
    expect(result).not.toHaveProperty('validation')
    expect(put).not.toHaveBeenCalled()
  })
  it.each([
    'lyriks 500 on POST /api/sections/validate: boom',
    'lyriks 404 on POST /api/sections/validate-all: not this route',
    'lyriks 403 on POST /api/sections/validate: not a member',
    '404',
  ])('still fails closed on any other validation error: %s', async (message) => {
    const { post, put, client } = setup()
    post.mockRejectedValueOnce(new Error(message))
    await expect(patchSectionHandler({ project_id: 'p', section: 'experience', operations, dry_run: true }, client)).rejects.toThrow(message)
    expect(put).not.toHaveBeenCalled()
  })
  it('warns when operations matched no target', async () => {
    const { client } = setup()
    const result = await patchSectionHandler({ project_id: 'p', section: 'experience', operations: [{ op: 'remove', collection: 'screens', id: 'missing' }], dry_run: true }, client) as { warnings: string[] }
    expect(result.warnings[0]).toContain('matched no target')
  })
  it('reports what each op did, and an idempotent retry as unchanged', async () => {
    const { get, client } = setup()
    get.mockResolvedValue({ revision: 3, draft: { screens: [{ id: 's', name: 'Original', sourceIds: ['doc-1'] }] } })
    const result = await patchSectionHandler({ project_id: 'p', section: 'experience', operations: [
      { op: 'add_to_set', collection: 'screens', id: 's', path: 'sourceIds', value: 'doc-1' },
      { op: 'add_to_set', collection: 'screens', id: 's', path: 'sourceIds', value: 'doc-2' },
      { op: 'replace_text', collection: 'screens', id: 's', path: 'name', find: 'Missing', value: 'x' },
    ] }, client)
    expect(result).toMatchObject({ opsApplied: 2, opsTotal: 3, changed: ['screens[s].sourceIds'], unchanged: ['screens[s].sourceIds'],
      notApplied: [{ index: 2, op: 'replace_text', target: 'screens[s].name', reason: '`find` occurs 0 times in the text' }] })
  })
  it('preserves ordinary save behavior when dry_run is omitted', async () => {
    const { put, post, client } = setup()
    await patchSectionHandler({ project_id: 'p', section: 'experience', operations }, client)
    expect(put).toHaveBeenCalledOnce()
    expect(post).not.toHaveBeenCalled()
  })
  it.each(['__proto__.polluted', 'constructor.prototype.polluted', 'builder..nodes', 'projectId'])('rejects unsafe path %s before any local change', (path) => {
    const draft = { title: 'Original' }
    expect(() => applySectionPatch(draft, [{ op: 'set', path: 'title', value: 'Changed' }, { op: 'set', path, value: true }])).toThrow('Invalid patch operation 1')
    expect(draft).toEqual({ title: 'Original' })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
  it.each([
    { op: 'set', path: 'title' },
    { op: 'merge', collection: 'screens', id: 's', value: {}, insert: 'false' },
    { op: 'merge', collection: 'screens', match: {}, value: {} },
    { op: 'merge', collection: 'screens', id: 's', match: { id: 's' }, value: {} },
    { op: 'merge', collection: 'screens', id: 's', value: null },
    { op: 'merge', collection: 'screens', id: 's', value: JSON.parse('{"__proto__":{"polluted":true}}') },
  ])('rejects malformed patch shapes before any request', async (operation) => {
    const { client, get, put } = setup()
    await expect(patchSectionHandler({ project_id: 'p', section: 'experience', operations: [operation as PatchOp] }, client)).rejects.toThrow('Invalid patch operation')
    expect(get).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
  })
})
