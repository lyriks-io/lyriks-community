/**
 * Tests: what the AI reports of the Reverse-Specification it runs reaches the
 * platform's reading report as it said it (EVO-014): the phase it starts and
 * the features it finished re-reading, beside what it already reported.
 */

import { describe, expect, it, vi } from 'vitest'
import type { LyriksClient } from '../lyriks-client.js'
import { reportRetrospecReadingHandler } from '../tools/retrospec-reading.js'

function makeLyriks() {
  const get = vi.fn(async () => ({ run: null }))
  const post = vi.fn(async () => ({ ok: true }))
  return { lyriks: { get, post } as unknown as LyriksClient, get, post }
}

const PATH = '/api/projects/shop/retrospec/reading'

describe('report_retrospec_reading', () => {
  it('passes the phase the AI starts and the features it re-read', async () => {
    const { lyriks, post } = makeLyriks()
    await reportRetrospecReadingHandler({ project_id: 'shop', phase: 'data', read: ['feat-orders', 'feat-refunds'] }, lyriks)
    expect(post).toHaveBeenCalledWith(PATH, { phase: 'data', read: ['feat-orders', 'feat-refunds'] })
  })

  it('passes them with the rest of the report in one call', async () => {
    const { lyriks, post } = makeLyriks()
    await reportRetrospecReadingHandler({ project_id: 'shop', received: true, phase: 'sources' }, lyriks)
    expect(post).toHaveBeenCalledWith(PATH, { received: true, phase: 'sources' })
  })

  it('only reads where the run stands when it reports nothing', async () => {
    const { lyriks, get, post } = makeLyriks()
    await reportRetrospecReadingHandler({ project_id: 'shop', read: [] }, lyriks)
    expect(get).toHaveBeenCalledWith(PATH)
    expect(post).not.toHaveBeenCalled()
  })
})
