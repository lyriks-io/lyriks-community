import { afterEach, describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createMcpServer } from '../server.js'
import { EVOLUTION_TOOLS, forgetEditionScope, lockedBatchRefusal, readEditionScope, type EditionScope } from '../edition-scope.js'

async function connected(scope?: EditionScope): Promise<Client> {
  const server = createMcpServer(null, undefined, undefined, scope)
  const client = new Client({ name: 'edition-scope-test', version: '0.0.0' })
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverSide), client.connect(clientSide)])
  return client
}

async function toolsOf(scope?: EditionScope) {
  return (await (await connected(scope)).listTools()).tools
}

const toolNames = async (scope?: EditionScope): Promise<string[]> => (await toolsOf(scope)).map((t) => t.name)

const SESSION_TOOLS = ['start_evolution_session', 'await_evolution_event', 'update_evolution_session']
const COMMUNITY: EditionScope = { evolutions: false, refusal: 'Evolutions are available from the Solo Builder plan. Upgrade to keep building. See https://lyriks.io/pricing.' }

afterEach(() => {
  forgetEditionScope()
  vi.unstubAllGlobals()
})

describe('the tools an edition offers (EVO-001, EVO-008)', () => {
  it('hides on Community what reads or drives a request, and offers the session tools and apply_evolution_batch for answer_click alone [criterion:ac-leaf-7de9e4dc-80a7-4b51-9547-2d7137969c40]', async () => {
    const tools = await toolsOf(COMMUNITY)
    const names = tools.map((t) => t.name)
    expect([...EVOLUTION_TOOLS]).toEqual(['get_evolution'])
    expect(names).not.toContain('get_evolution')
    for (const tool of [...SESSION_TOOLS, 'apply_evolution_batch']) expect(names).toContain(tool)
    expect(names).toContain('get_section')
    const batch = tools.find((t) => t.name === 'apply_evolution_batch')?.description ?? ''
    expect(batch).toContain('answer_click')
    expect(batch).toContain('any other operation is refused')
    for (const op of ['open_request', 'cross_stage', 'decide_line', 'build_implementation_report']) expect(batch).not.toContain(op)
  })

  it('lists every Evolution tool where Evolutions are open, and by default, apply_evolution_batch with its whole description', async () => {
    for (const tools of [await toolsOf({ evolutions: true }), await toolsOf()]) {
      const names = tools.map((t) => t.name)
      for (const tool of ['get_evolution', ...SESSION_TOOLS, 'apply_evolution_batch']) expect(names).toContain(tool)
      expect(tools.find((t) => t.name === 'apply_evolution_batch')?.description).toContain('open_request')
    }
  })
})

describe('the session tools on Community send the AI to no playbook it lacks (EVO-008 v2)', () => {
  it('says itself what to do with a question of Ask my AI, naming no playbook Community does not install [criterion:ac-leaf-b2b013a6-9451-488a-bb6c-bd2bf2a495d6]', async () => {
    const tools = await toolsOf(COMMUNITY)
    const described = (name: string) => tools.find((t) => t.name === name)?.description ?? ''
    for (const name of [...SESSION_TOOLS, 'apply_evolution_batch']) {
      expect(described(name)).not.toContain('lyriks-evolution')
      expect(described(name)).not.toMatch(/follow the [\w-]+ (skill|playbook)/i)
    }
    const start = described('start_evolution_session')
    expect(start).toContain('Ask my AI')
    expect(start).toContain('a click of kind chat')
    expect(start).toContain('apply_evolution_batch [{ op: "answer_click", clickId, text }]')
    expect(start).toContain('await_evolution_event')
  })

  it('keeps the whole description, and the playbook it follows, where Evolutions are open', async () => {
    const start = (await toolsOf({ evolutions: true })).find((t) => t.name === 'start_evolution_session')?.description ?? ''
    expect(start).toContain('Follow the lyriks-evolution skill.')
  })
})

describe('apply_evolution_batch on Community (EVO-008)', () => {
  it('refuses before the platform any batch that reads or drives a request, in the sentence the platform refuses it with [criterion:ac-leaf-7de9e4dc-80a7-4b51-9547-2d7137969c40]', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const client = await connected(COMMUNITY)
    for (const operations of [[{ op: 'open_request', title: 'Plan the week' }], [{ op: 'answer_click', clickId: 'c1', text: 'x' }, { op: 'post_on_field', requestId: 'r1' }]]) {
      const answer = await client.callTool({ name: 'apply_evolution_batch', arguments: { project_id: 'todomatic', operations } })
      expect(answer.isError).toBe(true)
      const text = (answer.content as Array<{ text: string }>)[0].text
      expect(text).toContain('Evolutions are available from the Solo Builder plan. Upgrade to keep building. See https://lyriks.io/pricing.')
      expect(text).toContain('takes answer_click alone')
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('takes an answer to a click of Ask my AI to the platform [criterion:ac-leaf-f86c4a85-412b-4798-a5fb-fb44458f5009]', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      new Response(JSON.stringify({ ok: true, applied: true, results: [{ index: 0, op: 'answer_click', ok: true, summary: 'Answered in the conversation' }] }), { headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const client = await connected(COMMUNITY)
    const answer = await client.callTool({ name: 'apply_evolution_batch', arguments: { project_id: 'todomatic', operations: [{ op: 'answer_click', clickId: 'c1', text: 'It misses a due date.' }] } })
    expect(answer.isError).toBeFalsy()
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/api\/evolution$/)
    expect(JSON.parse(String(init.body))).toMatchObject({ projectId: 'todomatic', operations: [{ op: 'answer_click', clickId: 'c1' }] })
  })

  it('lets every batch through where Evolutions are open, and words a refusal itself when an older platform gives none', () => {
    expect(lockedBatchRefusal({ evolutions: true }, [{ op: 'open_request' }])).toBeNull()
    expect(lockedBatchRefusal({ evolutions: false }, [{ op: 'answer_click' }])).toBeNull()
    expect(lockedBatchRefusal({ evolutions: false }, [{ kind: 'open_request' }])).toContain('Evolutions are not part of this installation')
  })
})

describe('readEditionScope', () => {
  it('reads what the platform says and keeps it a minute', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ edition: 'community', evolutions: false }), { headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await readEditionScope('t', 1_000)).toEqual({ evolutions: false })
    expect(await readEditionScope('t', 30_000)).toEqual({ evolutions: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keeps the sentence the platform refuses a request operation with', async () => {
    const refusal = { message: 'Evolutions are available from the Solo Builder plan. Upgrade to keep building.', detail: 'See https://lyriks.io/pricing.', plan: 'solo_builder' }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ edition: 'community', evolutions: false, refusal }), { headers: { 'content-type': 'application/json' } })))
    expect(await readEditionScope('t', 1_000)).toEqual({ evolutions: false, refusal: 'Evolutions are available from the Solo Builder plan. Upgrade to keep building. See https://lyriks.io/pricing.' })
  })

  it('asks again once the minute is over', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ edition: 'community', evolutions: false }), { headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    await readEditionScope('t', 1_000)
    await readEditionScope('t', 60_999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await readEditionScope('t', 61_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('offers every tool when the platform cannot be asked, and asks again next time', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('down') })
    vi.stubGlobal('fetch', fetchMock)
    expect(await readEditionScope('t', 1_000)).toEqual({ evolutions: true })
    await readEditionScope('t', 2_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
