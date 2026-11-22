/**
 * Tests: POST /mcp as the gateway serves it, sign-in enforced.
 *
 * The middlewares and the server are tested one by one elsewhere; this file
 * drives the assembled route (app.ts) the way an MCP client reaches it, over
 * Streamable HTTP, with the platform as an HTTP fake. It proves the pieces are
 * wired: a call without a sign-in never reaches a tool, a signed-in call
 * reaches the platform with the platform session behind the grant (never the
 * MCP token itself), a playbook ticket stays inside the playbooks, and the
 * edition decides the tool list.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.js'
import { issueAccessToken } from '../access-tokens.js'
import { forgetEditionScope } from '../edition-scope.js'
import { issueSkillsTicket } from '../skills-ticket.js'
import { SELF_INSTALL_SCRIPTS } from '../tools/skills.js'
import { FakeHttpService, PLATFORM_ORIGIN, reply, serveFetch } from './support/mcp-harness.js'

const PUBLIC = 'https://lyriks.example'
const SESSION = 'platform-session-1'

let app: ReturnType<typeof createApp>
let platform: FakeHttpService

beforeAll(() => {
  vi.stubEnv('MCP_AUTH_REQUIRED', '1')
  vi.stubEnv('PUBLIC_BASE_URL', PUBLIC)
  app = createApp()
})
afterAll(() => vi.unstubAllEnvs())

beforeEach(() => {
  forgetEditionScope()
  platform = new FakeHttpService(PLATFORM_ORIGIN)
  // The platform knows one live session, and says who it belongs to.
  platform.on('GET', '/api/auth/session', (r: { headers: Headers }) =>
    r.headers.get('cookie') === `lyriks_session=${SESSION}` ? { id: 'user-1' } : reply(401, { message: 'signed out' }))
  platform.on('GET', '/api/scope', { edition: 'enterprise', evolutions: true })
  serveFetch(platform)
})
afterEach(() => vi.unstubAllGlobals())

/** One JSON-RPC call over Streamable HTTP: the status, and the message the SSE stream carried. */
async function rpc(token: string | null, method: string, params: Record<string, unknown> = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }
  if (token) headers.authorization = `Bearer ${token}`
  const res = await app.request('/mcp', { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
  const text = await res.text()
  const data = text.split('\n').filter((line) => line.startsWith('data: ')).map((line) => JSON.parse(line.slice(6)))
  return { status: res.status, headers: res.headers, text, message: data[0] as { result?: Record<string, unknown>; error?: unknown } | undefined }
}

const toolText = (message: { result?: Record<string, unknown> } | undefined) =>
  ((message?.result?.content as Array<{ text: string }> | undefined)?.[0]?.text) ?? ''

describe('POST /mcp with sign-in enforced', () => {
  it('refuses a call without a sign-in before any tool runs, and points the client at OAuth discovery', async () => {
    platform.on('GET', '/api/sections', { draft: {} })

    const anonymous = await rpc(null, 'tools/call', { name: 'get_section', arguments: { project_id: 'p', section: 'features' } })
    const probe = await app.request('/mcp', { method: 'GET' })

    for (const res of [anonymous, probe]) {
      expect(res.status).toBe(401)
      expect(res.headers.get('www-authenticate')).toContain(`${PUBLIC}/.well-known/oauth-protected-resource`)
    }
    expect(platform.requestsTo('GET', '/api/sections')).toEqual([])
  })

  it('refuses a grant whose platform session has ended', async () => {
    const token = issueAccessToken('ended-session', 'user-1', 'claude-code')!
    expect((await rpc(token, 'tools/list')).status).toBe(401)
  })

  it('reaches the platform with the session behind the grant, never the MCP token', async () => {
    platform.on('GET', '/api/sections', { draft: { features: [] } })
    const token = issueAccessToken(SESSION, 'user-1', 'claude-code')!

    const answer = await rpc(token, 'tools/call', { name: 'get_section', arguments: { project_id: 'p', section: 'features' } })

    expect(answer.status).toBe(200)
    expect(answer.message?.result?.isError).toBeFalsy()
    const [read] = platform.requestsTo('GET', '/api/sections')
    expect(read.headers.get('cookie')).toBe(`lyriks_session=${SESSION}`)
    expect(read.headers.get('cookie')).not.toContain(token)
  })

  it('answers a signed-in GET probe with 405: there is nothing to stream', async () => {
    const token = issueAccessToken(SESSION, 'user-1', 'claude-code')!
    expect((await app.request('/mcp', { method: 'GET', headers: { authorization: `Bearer ${token}` } })).status).toBe(405)
  })

  it('offers no Evolution tool where the edition locks them', async () => {
    const token = issueAccessToken(SESSION, 'user-1', 'claude-code')!
    platform.on('GET', '/api/scope', { edition: 'community', evolutions: false })

    const names = ((await rpc(token, 'tools/list')).message?.result?.tools as Array<{ name: string }>).map((t) => t.name)

    expect(names).toContain('get_section')
    expect(names).not.toContain('get_evolution')
    expect(platform.requestsTo('GET', '/api/scope')[0].headers.get('cookie')).toBe(`lyriks_session=${SESSION}`)
  })

  it('hands an install command on the public address whose ticket reads the playbooks and nothing else', async () => {
    platform.on('POST', '/api/skills/sync', {
      skills: [{ id: 'lyriks-build', name: 'lyriks-build', status: 'new', installContent: 'guide' }],
      unknown: [],
      binding: { targets: [], tools: SELF_INSTALL_SCRIPTS.map((path) => ({ path, contentHash: 'h', content: `// ${path}` })) },
    })
    platform.on('GET', '/api/sections', { draft: {} })
    const token = issueAccessToken(SESSION, 'user-1', 'claude-code')!

    const sync = await rpc(token, 'tools/call', { name: 'sync_skills', arguments: { client: 'claude', self_install: true } })
    const command = (JSON.parse(toolText(sync.message)) as { selfInstall: { command: string } }).selfInstall.command
    expect(command).toContain(`--url ${PUBLIC}/mcp`)
    const ticket = /--token (\S+)/.exec(command)?.[1] ?? ''

    expect((await rpc(ticket, 'tools/call', { name: 'list_skills', arguments: {} })).status).toBe(200)
    expect((await rpc(ticket, 'tools/call', { name: 'get_section', arguments: { project_id: 'p', section: 'features' } })).status).toBe(403)
    expect(platform.requestsTo('GET', '/api/sections')).toEqual([])
  })

  it('offers the installer itself no further command', async () => {
    platform.on('POST', '/api/skills/sync', {
      skills: [{ id: 'lyriks-build', name: 'lyriks-build', status: 'new', installContent: 'guide' }],
      unknown: [],
      binding: { targets: [], tools: SELF_INSTALL_SCRIPTS.map((path) => ({ path, contentHash: 'h', content: `// ${path}` })) },
    })
    const ticket = issueSkillsTicket(SESSION, 'user-1')!.token

    const sync = await rpc(ticket, 'tools/call', { name: 'sync_skills', arguments: { client: 'claude' } })

    expect(sync.status).toBe(200)
    expect(JSON.parse(toolText(sync.message))).not.toHaveProperty('selfInstall')
  })
})
