// The playbook installer's sign-in (criterion 3f42911b): ten minutes, backed by
// the session of the client that asked for it, and refused by every tool but
// the three that read playbooks.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

const session = vi.hoisted(() => ({ verify: vi.fn(async () => 'user-1') }))
vi.mock('../session.js', async (original) => ({ ...await original<typeof import('../session.js')>(), verifyPlatformSession: session.verify }))

const { authenticate } = await import('../auth.js')
const { issueAccessToken, resolveAccessToken } = await import('../access-tokens.js')
const { SKILLS_TICKET_TTL_SECONDS, issueSkillsTicket, skillsScopeGuard, skillsTicketAllows } = await import('../skills-ticket.js')
import type { HonoVariables } from '../types.js'

const app = new Hono<{ Variables: HonoVariables }>()
app.post('/mcp', authenticate, skillsScopeGuard, (c) => c.json({ scope: c.get('token_scope') ?? null, user: c.get('user_id') }))
const call = (token: string, body: unknown) =>
  app.request('/mcp', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
const tool = (name: string) => ({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: {} } })

describe('the skills ticket', () => {
  beforeAll(() => { process.env.MCP_AUTH_REQUIRED = '1' })
  afterAll(() => { delete process.env.MCP_AUTH_REQUIRED })

  it('lasts ten minutes and carries the session and subject of the client that asked for it', () => {
    const before = Date.now()
    const ticket = issueSkillsTicket('platform-session', 'user-1')!
    const grant = resolveAccessToken(ticket.token)!
    expect(grant).toMatchObject({ session: 'platform-session', subject: 'user-1', scope: 'skills' })
    expect(SKILLS_TICKET_TTL_SECONDS).toBe(600)
    expect(grant.expiresAt - before).toBeGreaterThan(590_000)
    expect(grant.expiresAt - before).toBeLessThanOrEqual(600_500)
    expect(Date.parse(ticket.expiresAt)).toBeGreaterThan(before + 590_000)
  })

  it('opens a session and calls the three playbook tools, and nothing else', async () => {
    const { token } = issueSkillsTicket('platform-session', 'user-1')!
    expect((await call(token, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })).status).toBe(200)
    expect((await call(token, { jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(200)
    for (const name of ['sync_skills', 'get_skill', 'list_skills']) {
      const answer = await call(token, tool(name))
      expect(answer.status).toBe(200)
      expect(await answer.json()).toEqual({ scope: 'skills', user: 'user-1' })
    }
    for (const name of ['get_section', 'apply_behavior_batch', 'delete_project']) {
      const refused = await call(token, tool(name))
      expect(refused.status).toBe(403)
      expect(JSON.stringify(await refused.json())).toContain('only reads the Lyriks playbooks')
    }
    // A batch is refused as a whole when one message is out of bounds.
    expect((await call(token, [tool('sync_skills'), tool('patch_section')])).status).toBe(403)
  })

  it('leaves an ordinary sign-in untouched', async () => {
    const token = issueAccessToken('platform-session', 'user-1', 'claude-code')!
    const answer = await call(token, tool('get_section'))
    expect(answer.status).toBe(200)
    expect(await answer.json()).toEqual({ scope: null, user: 'user-1' })
  })

  it('refuses a body that is not JSON-RPC', () => {
    expect(skillsTicketAllows(null)).toBe(false)
    expect(skillsTicketAllows([])).toBe(false)
    expect(skillsTicketAllows({ id: 1, result: {} })).toBe(false)
    expect(skillsTicketAllows({ method: 'tools/call', params: {} })).toBe(false)
  })
})
