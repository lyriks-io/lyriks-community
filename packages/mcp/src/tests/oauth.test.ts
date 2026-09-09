import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { createHash, randomBytes } from 'node:crypto'
import type { HonoVariables } from '../types.js'
const session = vi.hoisted(() => ({ verify: vi.fn() }))
vi.mock('../session.js', () => ({ verifyPlatformSession: session.verify }))
import { registerOAuthRoutes } from '../oauth.js'
import { authenticate } from '../auth.js'

const BASE = 'https://studio.test'
const REDIRECT = 'https://client.example/callback'
const SESSION = 'synthetic-session-held-only-by-the-gateway'
let app: Hono<{ Variables: HonoVariables }>
beforeEach(() => {
  vi.stubEnv('MCP_AUTH_REQUIRED', '1')
  vi.stubEnv('PUBLIC_BASE_URL', BASE)
  session.verify.mockImplementation(async (token: string) => token === SESSION ? 'operator' : null)
  app = new Hono()
  registerOAuthRoutes(app)
  app.get('/probe', authenticate, c => c.json({ subject: c.get('user_id'), forwardedSession: c.get('user_token') === SESSION }))
})
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })
const post = (body: Record<string, string>, cookie = SESSION, origin = BASE) => ({
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: `lyriks_session=${cookie}`, origin },
  body: new URLSearchParams(body),
})
async function register(uris = [REDIRECT], name = 'test client') {
  return app.request('/mcp/oauth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ redirect_uris: uris, client_name: name }) })
}
async function flow(callback = REDIRECT, name = 'test client') {
  const client = await (await register([callback], name)).json()
  const verifier = randomBytes(32).toString('base64url')
  const q = new URLSearchParams({ client_id: client.client_id, redirect_uri: callback, response_type: 'code', code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url'), state: 'test-state', scope: 'mcp' })
  const response = await app.request(`/mcp/oauth/authorize?${q}`, { headers: { cookie: `lyriks_session=${SESSION}` } })
  const html = await response.text()
  const nonce = /name="consent" value="([^"]+)"/.exec(html)?.[1] ?? ''
  return { clientId: client.client_id, verifier, q, response, html, nonce, callback }
}
async function approved() {
  const f = await flow()
  const response = await app.request('/mcp/oauth/authorize', post({ consent: f.nonce, decision: 'allow' }))
  const code = new URL(response.headers.get('location')!).searchParams.get('code')!
  return { ...f, code }
}
async function exchange(f: Awaited<ReturnType<typeof approved>>, overrides = {}) {
  return app.request('/mcp/oauth/token', post({ grant_type: 'authorization_code', code: f.code, client_id: f.clientId, redirect_uri: f.callback, code_verifier: f.verifier, ...overrides }))
}

describe('OAuth consent and restricted credentials', () => {
  it('advertises discovery and PKCE endpoints', async () => {
    for (const suffix of ['', '/mcp']) {
      const resource = await (await app.request('/.well-known/oauth-protected-resource' + suffix)).json()
      expect(resource.resource).toBe(`${BASE}/mcp`)
      const meta = await (await app.request('/.well-known/oauth-authorization-server' + suffix)).json()
      expect(meta.code_challenge_methods_supported).toEqual(['S256'])
      expect(meta.revocation_endpoint).toBe(`${BASE}/mcp/oauth/revoke`)
    }
  })
  it('a new arbitrary client receives a consent screen, never a code on GET', async () => {
    const f = await flow(REDIRECT, '<script>alert(1)</script>')
    expect(f.response.status).toBe(200)
    expect(f.response.headers.get('location')).toBeNull()
    expect(f.response.headers.get('x-frame-options')).toBe('DENY')
    expect(f.response.headers.get('content-security-policy')).toContain('https://client.example')
    expect(f.nonce).toHaveLength(43)
    expect(f.html).not.toContain(SESSION)
    expect(f.html).not.toContain('<script>')
  })
  it('exchanges explicit consent for an opaque token and forwards identity only internally', async () => {
    const f = await approved()
    const response = await exchange(f)
    expect(response.status).toBe(200)
    const grant = await response.json()
    expect(grant.access_token).toMatch(/^lyriks_mcp_/)
    expect(grant.access_token).not.toBe(SESSION)
    expect(grant.expires_in).toBe(3600)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const probe = await app.request('/probe', { headers: { authorization: `Bearer ${grant.access_token}` } })
    expect(await probe.json()).toEqual({ subject: 'operator', forwardedSession: true })
    expect((await exchange(f)).status).toBe(400)
  })
  it('refuses forged, cross-origin, missing-origin and other-session consent', async () => {
    const f = await flow()
    for (const [nonce, cookie, origin] of [[f.nonce, SESSION, 'https://evil.example'], [f.nonce, SESSION, ''], [f.nonce, 'another-session', BASE], ['forged', SESSION, BASE]]) {
      expect((await app.request('/mcp/oauth/authorize', post({ consent: nonce, decision: 'allow' }, cookie, origin))).status).toBe(403)
    }
    const success = await app.request('/mcp/oauth/authorize', post({ consent: f.nonce, decision: 'allow' }))
    expect(success.status).toBe(303)
    expect((await app.request('/mcp/oauth/authorize', post({ consent: f.nonce, decision: 'allow' }))).status).toBe(403)
  })
  it('cancels without a code and preserves state', async () => {
    const f = await flow()
    const response = await app.request('/mcp/oauth/authorize', post({ consent: f.nonce, decision: 'deny' }))
    const url = new URL(response.headers.get('location')!)
    expect(url.searchParams.get('error')).toBe('access_denied')
    expect(url.searchParams.get('state')).toBe('test-state')
    expect(url.searchParams.has('code')).toBe(false)
  })
  it('requires registration for loopback and validates redirect schemes', async () => {
    for (const uri of ['javascript:alert(1)', 'data:text/html,hello', 'http://evil.example/cb', 'https://user:pass@client.example/cb', REDIRECT + '#fragment']) {
      expect((await register([uri])).status).toBe(400)
    }
    expect((await register(['http://127.0.0.1:12345/cb'])).status).toBe(201)
    expect((await app.request('/mcp/oauth/authorize?redirect_uri=http://127.0.0.1:12345/cb&client_id=unregistered')).status).toBe(400)
  })
  it('binds the code to PKCE, client, redirect and resource', async () => {
    for (const overrides of [{ code_verifier: 'wrong'.repeat(10) }, { client_id: 'another-client' }, { redirect_uri: 'https://another.example/cb' }, { resource: 'https://another.example/mcp' }]) {
      expect((await exchange(await approved(), overrides)).status).toBe(400)
    }
  })
  it('refuses expired consent and authorization codes', async () => {
    vi.useFakeTimers()
    const f = await flow()
    vi.advanceTimersByTime(5 * 60_000 + 1)
    expect((await app.request('/mcp/oauth/authorize', post({ consent: f.nonce, decision: 'allow' }))).status).toBe(403)
    const g = await approved()
    vi.advanceTimersByTime(60_001)
    expect((await exchange(g)).status).toBe(400)
  })
  it('expires or revokes tokens and rechecks backing sessions on every request', async () => {
    const token = (await (await exchange(await approved())).json()).access_token
    const probe = () => app.request('/probe', { headers: { authorization: `Bearer ${token}` } })
    expect((await probe()).status).toBe(200)
    session.verify.mockResolvedValue(null)
    expect((await probe()).status).toBe(401)
    session.verify.mockResolvedValue('operator')
    const other = (await (await exchange(await approved())).json()).access_token
    await app.request('/mcp/oauth/revoke', post({ token: other }))
    expect((await app.request('/probe', { headers: { authorization: `Bearer ${other}` } })).status).toBe(401)
    const expiring = (await (await exchange(await approved())).json()).access_token
    vi.useFakeTimers(); vi.advanceTimersByTime(3600_001)
    expect((await app.request('/probe', { headers: { authorization: `Bearer ${expiring}` } })).status).toBe(401)
  })
  it('bounces an anonymous user to the platform login and refuses raw sessions as MCP credentials', async () => {
    const f = await flow()
    const response = await app.request(`/mcp/oauth/authorize?${f.q}`)
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toContain(`${BASE}/login?redirect=`)
    expect((await app.request('/probe', { headers: { authorization: `Bearer ${SESSION}` } })).status).toBe(401)
  })
  it('does not expose OAuth when strict authentication is off', async () => {
    vi.stubEnv('MCP_AUTH_REQUIRED', '0')
    const publicApp = new Hono<{ Variables: HonoVariables }>()
    registerOAuthRoutes(publicApp)
    expect((await publicApp.request('/.well-known/oauth-authorization-server')).status).toBe(404)
  })
})
