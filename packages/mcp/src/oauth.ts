// Browser authorization for MCP: explicit per-client consent, PKCE, and opaque grants.
import type { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { createHash, randomUUID, randomBytes, timingSafeEqual } from 'node:crypto'
import type { HonoVariables } from './types.js'
import { verifyPlatformSession } from './session.js'
import { issueAccessToken, revokeAccessToken, ACCESS_TOKEN_TTL_SECONDS } from './access-tokens.js'

function baseUrl(): string {
  return (process.env.PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? '3001'}`).replace(/\/$/, '')
}
const cors = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
const LIMIT = 1000
interface Client { redirectUris: string[]; name: string; expiresAt: number }
interface Authorization {
  session: string; subject: string; clientId: string; redirectUri: string
  challenge: string; state: string; expiresAt: number
}
const clients = new Map<string, Client>()
const pending = new Map<string, Authorization>()
const codes = new Map<string, Authorization>()
const randomToken = () => randomBytes(32).toString('base64url')
const s256 = (text: string) => createHash('sha256').update(text).digest('base64url')
function same(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}
function prune<T extends { expiresAt: number }>(map: Map<string, T>): void {
  for (const [key, entry] of map) if (entry.expiresAt <= Date.now()) map.delete(key)
}
function safeRedirect(uri: string): boolean {
  try {
    const u = new URL(uri)
    if (uri.length > 2048 || /[\s\\]/.test(uri) || u.username || u.password || u.hash || !/^[A-Za-z0-9.:[\]-]+$/.test(u.hostname)) return false
    return u.protocol === 'https:' || (u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname))
  } catch { return false }
}
function sessionCookie(header: string): string {
  try {
    const match = /(?:^|;\s*)lyriks_session=([^;]+)/.exec(header)
    return match ? decodeURIComponent(match[1]) : ''
  } catch { return '' }
}
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
function callback(entry: Authorization, params: Record<string, string>): string {
  const url = new URL(entry.redirectUri)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  if (entry.state) url.searchParams.set('state', entry.state)
  return url.toString()
}
export function wwwAuthenticate(): string {
  return `Bearer resource_metadata="${baseUrl()}/.well-known/oauth-protected-resource"`
}
export function oauthEnabled(): boolean { return process.env.MCP_AUTH_REQUIRED === '1' }

export function registerOAuthRoutes(app: Hono<{ Variables: HonoVariables }>): void {
  if (!oauthEnabled()) return
  // Smaller than the JSON-RPC cap, including public registration and consent submissions.
  app.use('/mcp/oauth/*', bodyLimit({ maxSize: 16 * 1024 }))
  const protectedResource = { resource: `${baseUrl()}/mcp`, authorization_servers: [baseUrl()], bearer_methods_supported: ['header'] }
  for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
    app.get(path, c => c.json(protectedResource, 200, cors))
  }
  const metadata = {
    issuer: baseUrl(), authorization_endpoint: `${baseUrl()}/mcp/oauth/authorize`,
    token_endpoint: `${baseUrl()}/mcp/oauth/token`, registration_endpoint: `${baseUrl()}/mcp/oauth/register`,
    revocation_endpoint: `${baseUrl()}/mcp/oauth/revoke`,
    response_types_supported: ['code'], grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'], scopes_supported: ['mcp'],
  }
  for (const path of ['/.well-known/oauth-authorization-server', '/.well-known/oauth-authorization-server/mcp']) {
    app.get(path, c => c.json(metadata, 200, cors))
  }
  app.post('/mcp/oauth/register', async c => {
    const body = await c.req.json().catch(() => null)
    if (!body || !Array.isArray(body.redirect_uris) || !body.redirect_uris.length || body.redirect_uris.length > 10 ||
      !body.redirect_uris.every((uri: unknown) => typeof uri === 'string' && safeRedirect(uri)) ||
      (body.client_name !== undefined && (typeof body.client_name !== 'string' || body.client_name.length > 128))) {
      return c.json({ error: 'invalid_client_metadata' }, 400, cors)
    }
    prune(clients)
    if (clients.size >= LIMIT) return c.json({ error: 'temporarily_unavailable' }, 429, cors)
    const clientId = randomUUID()
    clients.set(clientId, { redirectUris: body.redirect_uris, name: body.client_name || 'MCP client', expiresAt: Date.now() + 24 * 3600_000 })
    return c.json({ client_id: clientId, redirect_uris: body.redirect_uris, token_endpoint_auth_method: 'none', grant_types: ['authorization_code'], response_types: ['code'] }, 201, cors)
  })

  app.get('/mcp/oauth/authorize', async c => {
    const q = new URL(c.req.url).searchParams
    prune(clients)
    const clientId = q.get('client_id') ?? ''
    const redirectUri = q.get('redirect_uri') ?? ''
    const client = clients.get(clientId)
    // Registration is required even for loopback callbacks.
    if (!client || !client.redirectUris.includes(redirectUri)) return c.text('invalid client or redirect_uri', 400)
    if (q.get('response_type') !== 'code' || q.get('code_challenge_method') !== 'S256' ||
      !/^[A-Za-z0-9_-]{43}$/.test(q.get('code_challenge') ?? '') ||
      (q.has('scope') && q.get('scope') !== 'mcp') ||
      (q.has('resource') && q.get('resource') !== `${baseUrl()}/mcp`) || (q.get('state')?.length ?? 0) > 2048) {
      return c.json({ error: 'invalid_request' }, 400, cors)
    }
    const session = sessionCookie(c.req.header('cookie') ?? '')
    const subject = await verifyPlatformSession(session)
    if (!subject) return c.redirect(`${baseUrl()}/login?redirect=${encodeURIComponent(c.req.path + new URL(c.req.url).search)}`)
    prune(pending)
    if (pending.size >= LIMIT) return c.json({ error: 'temporarily_unavailable' }, 429, cors)
    const nonce = randomToken()
    pending.set(nonce, { session, subject, clientId, redirectUri, challenge: q.get('code_challenge')!, state: q.get('state') ?? '', expiresAt: Date.now() + 5 * 60_000 })
    c.header('Cache-Control', 'no-store')
    c.header('Referrer-Policy', 'no-referrer')
    c.header('X-Frame-Options', 'DENY')
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Content-Security-Policy', `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${new URL(redirectUri).origin}; frame-ancestors 'none'; base-uri 'none'`)
    return c.html(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Connect MCP client</title><style>body{font:16px/1.6 system-ui;max-width:38rem;margin:4rem auto;padding:1rem}button{font:inherit;margin-right:1rem;padding:.5rem 1rem}code{overflow-wrap:anywhere}</style><main><h1>Connect ${escapeHtml(client.name)}?</h1><p>This client will be able to read and change the Lyriks projects your account can access.</p><p>Client callback: <code>${escapeHtml(redirectUri)}</code></p><p>Approve only if you started this connection and trust this client.</p><form method="post" action="/mcp/oauth/authorize"><input type="hidden" name="consent" value="${nonce}"><button name="decision" value="allow">Allow access</button><button name="decision" value="deny">Cancel</button></form></main></html>`)
  })

  app.post('/mcp/oauth/authorize', async c => {
    // Same-origin POST plus a single-use, session-bound unpredictable consent nonce.
    if (c.req.header('origin') !== new URL(baseUrl()).origin) return c.text('cross-origin request blocked', 403)
    const form = await c.req.parseBody().catch(() => ({})) as Record<string, unknown>
    const nonce = typeof form.consent === 'string' ? form.consent : ''
    const entry = pending.get(nonce)
    const session = sessionCookie(c.req.header('cookie') ?? '')
    if (!entry || entry.expiresAt <= Date.now() || !same(entry.session, session)) return c.text('invalid consent', 403)
    pending.delete(nonce)
    if (await verifyPlatformSession(session) !== entry.subject) return c.text('session expired', 401)
    if (form.decision === 'deny') return c.redirect(callback(entry, { error: 'access_denied' }), 303)
    if (form.decision !== 'allow') return c.text('invalid decision', 400)
    prune(codes)
    if (codes.size >= LIMIT) return c.json({ error: 'temporarily_unavailable' }, 429, cors)
    const code = randomToken()
    codes.set(code, { ...entry, expiresAt: Date.now() + 60_000 })
    return c.redirect(callback(entry, { code }), 303)
  })

  app.post('/mcp/oauth/token', async c => {
    const form = await c.req.parseBody().catch(() => ({})) as Record<string, unknown>
    if (form.grant_type !== 'authorization_code') return c.json({ error: 'unsupported_grant_type' }, 400, cors)
    const code = typeof form.code === 'string' ? form.code : ''
    const entry = codes.get(code)
    codes.delete(code)
    if (!entry || entry.expiresAt <= Date.now() || entry.clientId !== form.client_id || entry.redirectUri !== form.redirect_uri ||
      typeof form.code_verifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(form.code_verifier) ||
      !same(s256(form.code_verifier), entry.challenge) ||
      (form.resource !== undefined && form.resource !== `${baseUrl()}/mcp`) ||
      await verifyPlatformSession(entry.session) !== entry.subject) {
      return c.json({ error: 'invalid_grant' }, 400, cors)
    }
    const token = issueAccessToken(entry.session, entry.subject, entry.clientId)
    if (!token) return c.json({ error: 'temporarily_unavailable' }, 429, cors)
    return c.json({ access_token: token, token_type: 'Bearer', expires_in: ACCESS_TOKEN_TTL_SECONDS, scope: 'mcp' }, 200, cors)
  })
  app.post('/mcp/oauth/revoke', async c => {
    const form = await c.req.parseBody().catch(() => ({})) as Record<string, unknown>
    if (typeof form.token === 'string') revokeAccessToken(form.token)
    return c.body(null, 200, cors)
  })
}
