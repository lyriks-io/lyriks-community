import { describe, expect, it, vi } from 'vitest'
import type { LyriksClient } from '../lyriks-client.js'
import { getProjectElaborationHandler } from '../tools/elaboration.js'

describe('project elaboration read', () => {
  it('forwards all filters and snapshot paging without writing', async () => {
    const response = { items: [], snapshot: { key: 'snapshot' } }
    const get = vi.fn().mockResolvedValue(response)
    const put = vi.fn()
    const post = vi.fn()
    const client = { get, put, post } as unknown as LyriksClient
    expect(await getProjectElaborationHandler({ project_id: 'p & q', kind: 'action', section: 'features', include_checks: false, offset: 10, limit: 5, expected_snapshot: 'snapshot' }, client)).toBe(response)
    const url = new URL(get.mock.calls[0][0], 'http://localhost')
    expect(Object.fromEntries(url.searchParams)).toEqual({ projectId: 'p & q', kind: 'action', section: 'features', includeChecks: 'false', offset: '10', limit: '5', expectedSnapshot: 'snapshot' })
    expect(put).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })
  it('gives actionable restart guidance for a stale snapshot', async () => {
    const client = { get: vi.fn().mockRejectedValue(new Error('lyriks 409 on GET /api/projects/elaboration?projectId=p: stale')) } as unknown as LyriksClient
    expect(await getProjectElaborationHandler({ project_id: 'p' }, client)).toMatchObject({ ok: false, reason: 'stale_snapshot', readOnly: true })
  })
  it('does not disguise authentication or transport failures as an empty plan', async () => {
    const client = { get: vi.fn().mockRejectedValue(new Error('forbidden')) } as unknown as LyriksClient
    await expect(getProjectElaborationHandler({ project_id: 'p' }, client)).rejects.toThrow('forbidden')
  })
})
