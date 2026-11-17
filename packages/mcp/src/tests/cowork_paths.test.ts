/**
 * Tests: the tool-call paths a client without scripts uses (Claude Cowork):
 * an attached file proves it arrived unaltered (criterion 3dc1bafd), and the
 * seed can land the coverage in the same call (criterion 5f704119).
 */

import { describe, it, expect, vi } from 'vitest'
import { attachSourceHandler, sha256Of } from '../tools/adoption.js'
import { seedIndexHandler } from '../tools/implementation.js'
import type { LyriksClient } from '../lyriks-client.js'

const lyriksWith = () => {
  const post = vi.fn().mockResolvedValue({ ok: true, sourceId: 's1' })
  const get = vi.fn().mockResolvedValue({ ok: true })
  return { lyriks: { post, get } as unknown as LyriksClient, post, get }
}

const file = { project_id: 'p', feature_id: 'f', file_name: 'src/game.js', content: 'const ¡ = 1;\n' }

describe('attach_source with sha256 (criterion 3dc1bafd)', () => {
  it('stores the file when the sha256 matches, sha256sum output accepted as is', async () => {
    const { lyriks, post } = lyriksWith()
    await attachSourceHandler({ ...file, sha256: `${sha256Of(file.content)}  src/game.js` }, lyriks)
    expect(post).toHaveBeenCalledOnce()
  })

  it('stores nothing and names both hashes when the content was altered on the way', async () => {
    const { lyriks, post } = lyriksWith()
    const answer = (await attachSourceHandler({ ...file, content: 'const ? = 1;\n', sha256: sha256Of(file.content) }, lyriks)) as {
      ok: boolean; stored: boolean; error: string; sha256: { expected: string; received: string }
    }
    expect(post).not.toHaveBeenCalled()
    expect(answer).toMatchObject({ ok: false, stored: false })
    expect(answer.sha256.expected).toBe(sha256Of(file.content))
    expect(answer.error).toContain(answer.sha256.received)
  })

  it('attaches as before without a sha256', async () => {
    const { lyriks, post } = lyriksWith()
    await attachSourceHandler(file, lyriks)
    expect(post).toHaveBeenCalledOnce()
  })
})

describe('seed_implementation_index with sync (criterion 5f704119)', () => {
  it('asks the platform to land the entries when sync is true, and only then', async () => {
    const { lyriks, get } = lyriksWith()
    await seedIndexHandler({ project_id: 'p', feature_id: 'f', sync: true }, lyriks)
    await seedIndexHandler({ project_id: 'p', feature_id: 'f' }, lyriks)
    expect(get.mock.calls[0][0]).toContain('sync=true')
    expect(get.mock.calls[1][0]).not.toContain('sync=')
  })
})
