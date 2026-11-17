// The waiting command's sign-in (criterion 26c95cc1): backed by the session of
// the client that opened the live session, twelve hours at most, and refused
// by every tool but a wait in that one session.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

const session = vi.hoisted(() => ({ verify: vi.fn(async () => 'user-1') }))
vi.mock('../session.js', async (original) => ({ ...await original<typeof import('../session.js')>(), verifyPlatformSession: session.verify }))

const { authenticate } = await import('../auth.js')
const { issueAccessToken, resolveAccessToken } = await import('../access-tokens.js')
const { SESSION_TICKET_TTL_SECONDS, issueSessionTicket, sessionScopeGuard } = await import('../session-ticket.js')
const { skillsScopeGuard } = await import('../skills-ticket.js')
import type { HonoVariables } from '../types.js'

const app = new Hono<{ Variables: HonoVariables }>()
app.post('/mcp', authenticate, skillsScopeGuard, sessionScopeGuard, (c) => c.json({ scope: c.get('token_scope') ?? null, user: c.get('user_id') }))
const call = (token: string, body: unknown) =>
  app.request('/mcp', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
const tool = (name: string, args: Record<string, unknown> = {}) => ({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } })

describe('the session ticket', () => {
  beforeAll(() => { process.env.MCP_AUTH_REQUIRED = '1' })
  afterAll(() => { delete process.env.MCP_AUTH_REQUIRED })

  it('lasts twelve hours and carries the session, the subject and the live session it waits in', () => {
    const before = Date.now()
    const ticket = issueSessionTicket('platform-session', 'user-1', 'live-1')!
    const grant = resolveAccessToken(ticket.token)!
    expect(grant).toMatchObject({ session: 'platform-session', subject: 'user-1', scope: 'session-wait', sessionId: 'live-1' })
    expect(SESSION_TICKET_TTL_SECONDS).toBe(12 * 3600)
    expect(grant.expiresAt - before).toBeGreaterThan(12 * 3600_000 - 10_000)
    expect(Date.parse(ticket.expiresAt)).toBeGreaterThan(before + 12 * 3600_000 - 10_000)
  })

  it('opens the MCP session and waits in its live session, and nothing else', async () => {
    const { token } = issueSessionTicket('platform-session', 'user-1', 'live-1')!
    expect((await call(token, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })).status).toBe(200)
    expect((await call(token, { jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(200)
    const waits = await call(token, tool('await_evolution_event', { project_id: 'p1', session_id: 'live-1' }))
    expect(waits.status).toBe(200)
    expect(await waits.json()).toEqual({ scope: 'session-wait', user: 'user-1' })
    // Another live session, or any other tool, is refused before it runs.
    expect((await call(token, tool('await_evolution_event', { project_id: 'p1', session_id: 'live-2' }))).status).toBe(403)
    for (const name of ['get_section', 'apply_evolution_batch', 'start_evolution_session', 'sync_skills']) {
      const refused = await call(token, tool(name, { session_id: 'live-1' }))
      expect(refused.status).toBe(403)
      expect(JSON.stringify(await refused.json())).toContain('only waits for the clicks')
    }
    expect((await call(token, [tool('await_evolution_event', { session_id: 'live-1' }), tool('patch_section')])).status).toBe(403)
  })

  it('leaves an ordinary sign-in untouched', async () => {
    const token = issueAccessToken('platform-session', 'user-1', 'claude-code')!
    const answer = await call(token, tool('get_section'))
    expect(answer.status).toBe(200)
    expect(await answer.json()).toEqual({ scope: null, user: 'user-1' })
  })

  it('dies with the sign-in it is backed by', async () => {
    const { token } = issueSessionTicket('platform-session', 'user-1', 'live-1')!
    session.verify.mockResolvedValueOnce(null as never)
    expect((await call(token, tool('await_evolution_event', { session_id: 'live-1' }))).status).toBe(401)
  })
})
