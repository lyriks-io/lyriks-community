// Regression: the Streamable-HTTP transport handshake (the earlier "405" was an
// artifact — with the correct Accept header it returns 200 + an SSE initialize
// result; per spec it 406s when the client won't accept text/event-stream).
import { describe, it, expect, vi } from 'vitest'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createMcpServer } from '../server.js'

async function handshake(accept: string) {
  const mcp = createMcpServer(null)
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  await mcp.connect(transport)
  const res = await transport.handleRequest(
    new Request('http://x/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } },
      }),
    }),
  )
  return { status: res.status, body: await res.text() }
}

describe('MCP Streamable-HTTP handshake', () => {
  it('200 + initialize result when the client accepts SSE', async () => {
    const r = await handshake('application/json, text/event-stream')
    expect(r.status).toBe(200)
    expect(r.body).toContain('"protocolVersion"')
    expect(r.body).toContain('lyriks')
  })

  it('406 when the client will not accept text/event-stream (per spec)', async () => {
    const r = await handshake('application/json')
    expect(r.status).toBe(406)
  })
})
