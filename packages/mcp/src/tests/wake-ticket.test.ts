// The waker's sign-in (feat-ai-session, action "Keep my waker listening",
// criterion ab716003): backed by the session of the client that opened the
// session, wakeTicketDays at most, and refused by every tool but waiting for
// wakes on its one project.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

const session = vi.hoisted(() => ({ verify: vi.fn(async () => 'user-1') }))
vi.mock('../session.js', async (original) => ({ ...await original<typeof import('../session.js')>(), verifyPlatformSession: session.verify }))

const { authenticate } = await import('../auth.js')
const { issueAccessToken, issueTicket, resolveAccessToken } = await import('../access-tokens.js')
const { WAKE_TICKET_TTL_SECONDS, issueWakeTicket, wakeScopeGuard } = await import('../wake-ticket.js')
const { indexScopeGuard, issueIndexTicket } = await import('../index-ticket.js')
const { issueSessionTicket, sessionScopeGuard } = await import('../session-ticket.js')
const { skillsScopeGuard } = await import('../skills-ticket.js')
import type { HonoVariables } from '../types.js'

const app = new Hono<{ Variables: HonoVariables }>()
app.post('/mcp', authenticate, skillsScopeGuard, sessionScopeGuard, indexScopeGuard, wakeScopeGuard, (c) =>
  c.json({ scope: c.get('token_scope') ?? null, project: c.get('token_project') ?? null, user: c.get('user_id') }),
)
const call = (token: string, body: unknown) =>
  app.request('/mcp', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
const tool = (name: string, args: Record<string, unknown> = {}) => ({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } })

describe('the waker ticket [criterion:ab716003]', () => {
  beforeAll(() => { process.env.MCP_AUTH_REQUIRED = '1' })
  afterAll(() => { delete process.env.MCP_AUTH_REQUIRED })

  it('lasts thirty days and carries the session, the subject and the one project its waker listens on', () => {
    const before = Date.now()
    const ticket = issueWakeTicket('platform-session', 'user-1', 'p-shop')
    const grant = resolveAccessToken(ticket.token)!
    expect(grant).toMatchObject({ session: 'platform-session', subject: 'user-1', scope: 'ai-wake', projectId: 'p-shop' })
    expect(WAKE_TICKET_TTL_SECONDS).toBe(30 * 24 * 3600)
    expect(grant.expiresAt - before).toBeGreaterThan(WAKE_TICKET_TTL_SECONDS * 1000 - 10_000)
    expect(grant.expiresAt - before).toBeLessThanOrEqual(WAKE_TICKET_TTL_SECONDS * 1000 + 1000)
    expect(Date.parse(ticket.expiresAt)).toBeGreaterThan(before + WAKE_TICKET_TTL_SECONDS * 1000 - 10_000)
  })

  it('opens the MCP session and waits for wakes on its project, and nothing else', async () => {
    const { token } = issueWakeTicket('platform-session', 'user-1', 'p-shop')
    expect((await call(token, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })).status).toBe(200)
    expect((await call(token, { jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(200)
    const allowed = await call(token, tool('await_ai_wake', { project_id: 'p-shop', max_wait_seconds: 45 }))
    expect(allowed.status).toBe(200)
    expect(await allowed.json()).toEqual({ scope: 'ai-wake', project: 'p-shop', user: 'user-1' })
    const refused = [
      // Another project: a teammate's or another of the person's.
      tool('await_ai_wake', { project_id: 'p-other' }),
      // Opening a session, waiting in one or speaking on the pages is the AI's, never the waker's.
      tool('start_evolution_session', { project_id: 'p-shop' }),
      tool('await_evolution_event', { project_id: 'p-shop', session_id: 'live-1' }),
      tool('update_evolution_session', { project_id: 'p-shop', session_id: 'live-1', say: 'x' }),
      tool('get_section', { project_id: 'p-shop', section: 'features' }),
      tool('sync_implementation_index', { project_id: 'p-shop', index: {} }),
    ]
    for (const message of refused) {
      const answer = await call(token, message)
      expect(answer.status).toBe(403)
      expect(JSON.stringify(await answer.json())).toContain("only waits for the person's wakes on project p-shop")
    }
    expect((await call(token, [tool('await_ai_wake', { project_id: 'p-shop' }), tool('get_section', { project_id: 'p-shop' })])).status).toBe(403)
  })

  it('opens none of its tools to another ticket, and leaves an ordinary sign-in untouched', async () => {
    const { token: wait } = issueSessionTicket('platform-session', 'user-1', 'live-1')!
    expect((await call(wait, tool('await_ai_wake', { project_id: 'p-shop' }))).status).toBe(403)
    const { token: index } = issueIndexTicket('platform-session', 'user-1', 'p-shop')!
    expect((await call(index, tool('await_ai_wake', { project_id: 'p-shop' }))).status).toBe(403)
    const token = issueAccessToken('platform-session', 'user-1', 'claude-code')!
    const answer = await call(token, tool('get_section'))
    expect(answer.status).toBe(200)
    expect(await answer.json()).toEqual({ scope: null, project: null, user: 'user-1' })
  })

  it('dies with the sign-in it is backed by: signing out stops the waker', async () => {
    const { token } = issueWakeTicket('platform-session', 'user-1', 'p-shop')
    session.verify.mockResolvedValueOnce(null as never)
    expect((await call(token, tool('await_ai_wake', { project_id: 'p-shop' }))).status).toBe(401)
  })

  it('never opens without the one project it is bound to, nor past its time', () => {
    expect(resolveAccessToken(issueTicket('platform-session', 'user-1', 'x', { scope: 'ai-wake', projectId: '' }, 3600))).toBeNull()
    expect(resolveAccessToken(issueTicket('platform-session', 'user-1', 'x', { scope: 'ai-wake', projectId: 'p-shop' }, 0))).toBeNull()
  })
})
