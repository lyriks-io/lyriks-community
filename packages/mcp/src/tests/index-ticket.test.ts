// The sync command's sign-in (feat-100, criterion 2452b3d7): backed by the
// session of the client that asked for the command, twelve hours at most, and
// refused by every tool but reading where index keys belong and sending the
// index, on its one project.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

const session = vi.hoisted(() => ({ verify: vi.fn(async () => 'user-1') }))
vi.mock('../session.js', async (original) => ({ ...await original<typeof import('../session.js')>(), verifyPlatformSession: session.verify }))

const { authenticate } = await import('../auth.js')
const { issueAccessToken, resolveAccessToken } = await import('../access-tokens.js')
const { INDEX_TICKET_TTL_SECONDS, indexScopeGuard, issueIndexTicket } = await import('../index-ticket.js')
const { issueSessionTicket, sessionScopeGuard } = await import('../session-ticket.js')
const { skillsScopeGuard } = await import('../skills-ticket.js')
import type { HonoVariables } from '../types.js'

const app = new Hono<{ Variables: HonoVariables }>()
app.post('/mcp', authenticate, skillsScopeGuard, sessionScopeGuard, indexScopeGuard, (c) =>
  c.json({ scope: c.get('token_scope') ?? null, project: c.get('token_project') ?? null, user: c.get('user_id') }),
)
const call = (token: string, body: unknown) =>
  app.request('/mcp', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
const tool = (name: string, args: Record<string, unknown> = {}) => ({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } })

describe('the index ticket [criterion:2452b3d7]', () => {
  beforeAll(() => { process.env.MCP_AUTH_REQUIRED = '1' })
  afterAll(() => { delete process.env.MCP_AUTH_REQUIRED })

  it('lasts twelve hours and carries the session, the subject and the one project it syncs', () => {
    const before = Date.now()
    const ticket = issueIndexTicket('platform-session', 'user-1', 'p-shop')!
    const grant = resolveAccessToken(ticket.token)!
    expect(grant).toMatchObject({ session: 'platform-session', subject: 'user-1', scope: 'index-sync', projectId: 'p-shop' })
    expect(INDEX_TICKET_TTL_SECONDS).toBe(12 * 3600)
    expect(grant.expiresAt - before).toBeGreaterThan(12 * 3600_000 - 10_000)
    expect(grant.expiresAt - before).toBeLessThanOrEqual(12 * 3600_000 + 1000)
    expect(Date.parse(ticket.expiresAt)).toBeGreaterThan(before + 12 * 3600_000 - 10_000)
  })

  it('opens the MCP session, reads where index keys belong, sends the index of its project and reports its branch after a sync, and nothing else', async () => {
    const { token } = issueIndexTicket('platform-session', 'user-1', 'p-shop')!
    expect((await call(token, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })).status).toBe(200)
    expect((await call(token, { jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(200)
    const allowed = [
      tool('sync_implementation_index', { project_id: 'p-shop', index: { 'action:a1': {} } }),
      tool('sync_implementation_index', { project_id: 'p-shop', index: { 'rule:r1': {} }, positions_only: true, expected_revision: 3 }),
      tool('get_implementation_status', { project_id: 'p-shop', keys: ['rule:r1'] }),
      tool('get_behavior_feature', { project_id: 'p-shop', feature_id: 'feat-cart', index_keys: true, offset: 100 }),
      // What the command does after a sync (code-state.mjs): the board that names the deployment branch, then the branch report.
      tool('get_evolution', { project_id: 'p-shop' }),
      tool('apply_evolution_batch', { project_id: 'p-shop', operations: [{ op: 'report_code_state', branch: 'evo/EVO-1', head: 'abc', clean: true }] }),
    ]
    for (const message of allowed) {
      const answer = await call(token, message)
      expect(answer.status).toBe(200)
      expect(await answer.json()).toEqual({ scope: 'index-sync', project: 'p-shop', user: 'user-1' })
    }
    const refused = [
      // Another project, whatever the tool.
      tool('sync_implementation_index', { project_id: 'p-other', index: {} }),
      tool('get_implementation_status', { project_id: 'p-other', keys: ['rule:r1'] }),
      // A ticket never hands out another one.
      tool('sync_implementation_index', { project_id: 'p-shop', command: true }),
      // Reading the feature itself, or its status, is more than where keys belong.
      tool('get_implementation_status', { project_id: 'p-shop', feature_id: 'feat-cart' }),
      tool('get_behavior_feature', { project_id: 'p-shop', feature_id: 'feat-cart' }),
      tool('get_behavior_feature', { project_id: 'p-shop', feature_id: 'feat-cart', index_keys: true, paths: ['snapshot.feature'] }),
      tool('report_implementation_status', { project_id: 'p-shop', feature_id: 'feat-cart', found_entities: [] }),
      tool('get_section', { project_id: 'p-shop', section: 'features' }),
      tool('apply_behavior_batch', { project_id: 'p-shop' }),
      // The board only as the command reads it; any other Evolution operation, or another project's report.
      tool('get_evolution', { project_id: 'p-shop', request_id: 'req-1' }),
      tool('get_evolution', { project_id: 'p-shop', part: 'drafts' }),
      tool('apply_evolution_batch', { project_id: 'p-shop', operations: [{ op: 'report_code_state' }, { op: 'validate_step', requestId: 'req-1' }] }),
      tool('apply_evolution_batch', { project_id: 'p-shop', operations: [{ op: 'report_merge', branch: 'evo/EVO-1' }] }),
      tool('apply_evolution_batch', { project_id: 'p-shop', operations: [] }),
      tool('apply_evolution_batch', { project_id: 'p-shop', request_id: 'req-1', operations: [{ op: 'report_code_state' }] }),
      tool('apply_evolution_batch', { project_id: 'p-other', operations: [{ op: 'report_code_state' }] }),
    ]
    for (const message of refused) {
      const answer = await call(token, message)
      expect(answer.status).toBe(403)
      expect(JSON.stringify(await answer.json())).toContain('only reads where index keys belong, sends the index of project p-shop and reports the code state of its branch')
    }
    expect((await call(token, [allowed[0], tool('get_section', { project_id: 'p-shop' })])).status).toBe(403)
  })

  it('opens none of its tools to another ticket, and leaves an ordinary sign-in untouched', async () => {
    const { token: wait } = issueSessionTicket('platform-session', 'user-1', 'live-1')!
    expect((await call(wait, tool('sync_implementation_index', { project_id: 'p-shop', index: {} }))).status).toBe(403)
    const token = issueAccessToken('platform-session', 'user-1', 'claude-code')!
    const answer = await call(token, tool('get_section'))
    expect(answer.status).toBe(200)
    expect(await answer.json()).toEqual({ scope: null, project: null, user: 'user-1' })
  })

  it('dies with the sign-in it is backed by', async () => {
    const { token } = issueIndexTicket('platform-session', 'user-1', 'p-shop')!
    session.verify.mockResolvedValueOnce(null as never)
    expect((await call(token, tool('get_implementation_status', { project_id: 'p-shop', keys: ['rule:r1'] }))).status).toBe(401)
  })
})
