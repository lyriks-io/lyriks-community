import { afterEach, describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createMcpServer } from '../server.js'
import { EVOLUTION_TOOLS, forgetEditionScope, readEditionScope } from '../edition-scope.js'

async function toolNames(scope?: { evolutions: boolean }): Promise<string[]> {
  const server = createMcpServer(null, undefined, undefined, scope)
  const client = new Client({ name: 'edition-scope-test', version: '0.0.0' })
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverSide), client.connect(clientSide)])
  const { tools } = await client.listTools()
  return tools.map((t) => t.name)
}

afterEach(() => {
  forgetEditionScope()
  vi.unstubAllGlobals()
})

describe('the tools an edition offers (EVO-001)', () => {
  it('lists no Evolution or roadmap tool on an installation whose edition locks Evolutions', async () => {
    const names = await toolNames({ evolutions: false })
    expect(names.filter((n) => EVOLUTION_TOOLS.has(n))).toEqual([])
    expect(names).toContain('get_section')
  })

  it('lists every one of them where Evolutions are open, and by default', async () => {
    for (const names of [await toolNames({ evolutions: true }), await toolNames()]) {
      for (const tool of EVOLUTION_TOOLS) expect(names).toContain(tool)
    }
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

  it('offers every tool when the platform cannot be asked, and asks again next time', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('down') })
    vi.stubGlobal('fetch', fetchMock)
    expect(await readEditionScope('t', 1_000)).toEqual({ evolutions: true })
    await readEditionScope('t', 2_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
