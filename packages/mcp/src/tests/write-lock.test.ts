/**
 * Tests: concurrent writes to one section (util/write-lock.ts).
 *
 * patch_section reads a whole section draft, applies the operations and writes
 * the whole draft back. Two agents patching the same section at once would
 * both read the same draft, and the second write would erase the first
 * (a lost update) on a platform that checks no revision. The gateway queues
 * the writers of one project section; writers of other sections run freely.
 * The platform here stores the drafts and answers its reads after a delay, so
 * two unqueued writers would interleave.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeHttpService, PLATFORM_ORIGIN, connectAgent, reply, serveFetch, type ConnectedAgent, type RecordedRequest } from './support/mcp-harness.js'

const later = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** A platform that keeps section drafts, with no revision (an older platform: nothing else guards the write). */
function sectionStore(platform: FakeHttpService) {
  const drafts = new Map<string, Record<string, unknown>>()
  const gates = new Map<string, Promise<void>>()
  const failNext = new Set<string>()
  // The draft as it stands when the read arrives, answered a little later.
  platform.on('GET', '/api/sections', async (r: RecordedRequest) => {
    const draft = structuredClone(drafts.get(r.url.searchParams.get('section') ?? '') ?? {})
    await later(20)
    return { draft }
  })
  for (const section of ['scope', 'glossary']) {
    platform.on('PUT', `/api/draft/${section}`, async (r: RecordedRequest) => {
      await gates.get(section)
      if (failNext.delete(section)) return reply(500, { message: 'save pipeline failed' })
      const { projectId: _id, ...draft } = r.body as Record<string, unknown>
      drafts.set(section, draft)
      return { ok: true }
    })
  }
  return {
    drafts,
    /** Hold the writes of a section until the returned release is called. */
    hold(section: string) {
      let release = () => {}
      gates.set(section, new Promise<void>((resolve) => { release = resolve }))
      return () => { gates.delete(section); release() }
    },
    failNextWrite: (section: string) => failNext.add(section),
  }
}

const append = (id: string) => ({ project_id: 'shop', section: 'scope', operations: [{ op: 'append', collection: 'capabilities', id, value: { name: id } }] })

let platform: FakeHttpService
let store: ReturnType<typeof sectionStore>
let first: ConnectedAgent
let second: ConnectedAgent
let third: ConnectedAgent

beforeEach(async () => {
  platform = new FakeHttpService(PLATFORM_ORIGIN)
  store = sectionStore(platform)
  serveFetch(platform)
  // Two agents, two gateways: one per POST /mcp, as the stateless server builds them.
  first = await connectAgent()
  second = await connectAgent()
  third = await connectAgent()
})

afterEach(async () => {
  await first.close()
  await second.close()
  await third.close()
  vi.unstubAllGlobals()
})

describe('two agents patching the same section at once', () => {
  it('keeps both changes: the second writer reads what the first wrote', async () => {
    const answers = await Promise.all([first.call('patch_section', append('cap-a')), second.call('patch_section', append('cap-b'))])

    for (const answer of answers) expect(answer.isError, answer.text).toBe(false)
    expect((store.drafts.get('scope')?.capabilities as Array<{ id: string }>).map((c) => c.id)).toEqual(['cap-a', 'cap-b'])
  })

  it('keeps every change when a third writer arrives while the second still waits', async () => {
    const one = first.call('patch_section', append('cap-a'))
    const two = second.call('patch_section', append('cap-b'))
    // The first write lands while the second waits; only then does the third arrive.
    await one
    const answers = [await one, ...(await Promise.all([two, third.call('patch_section', append('cap-c'))]))]

    for (const answer of answers) expect(answer.isError, answer.text).toBe(false)
    expect((store.drafts.get('scope')?.capabilities as Array<{ id: string }>).map((c) => c.id)).toEqual(['cap-a', 'cap-b', 'cap-c'])
  })

  it('goes on with the next writer when one write fails', async () => {
    store.failNextWrite('scope')

    const [failed, landed] = await Promise.all([first.call('patch_section', append('cap-a')), second.call('patch_section', append('cap-b'))])

    expect(failed.isError).toBe(true)
    expect(failed.text).toContain('save pipeline failed')
    expect(landed.isError, landed.text).toBe(false)
    expect((store.drafts.get('scope')?.capabilities as Array<{ id: string }>).map((c) => c.id)).toEqual(['cap-b'])
  })

  it('does not hold a write to another section behind a slow one', async () => {
    const release = store.hold('scope')
    const slow = first.call('patch_section', append('cap-a'))

    const other = await second.call('patch_section', { project_id: 'shop', section: 'glossary', operations: [{ op: 'set', path: 'note', value: 'kept' }] })

    expect(other.isError, other.text).toBe(false)
    expect(store.drafts.get('glossary')).toEqual({ note: 'kept' })
    expect(store.drafts.has('scope')).toBe(false)
    release()
    expect((await slow).isError).toBe(false)
  })
})
