/**
 * Tests: auth middleware
 * AU01–AU06  JWT validation + context variables
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Hono }  from 'hono'
import { SignJWT } from 'jose'
import { authenticate } from '../auth.js'
import type { HonoVariables } from '../types.js'

// ── helpers ──────────────────────────────────────────────────────────────────

const SECRET      = new TextEncoder().encode('test-secret-for-vitest')
const USER_ID     = 'user-1'

async function makeToken(sub: string, expiresIn = '7d'): Promise<string> {
  return new SignJWT({ sub })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(expiresIn)
    .sign(SECRET)
}

const app = new Hono<{ Variables: HonoVariables }>()
app.use('*', authenticate)
app.get('/probe', (c) =>
  c.json({ user_id: c.get('user_id'), has_token: Boolean(c.get('user_token')) }),
)

async function req(token?: string) {
  const headers: Record<string, string> = {}
  if (token !== undefined) headers['Authorization'] = `Bearer ${token}`
  const res = await app.request('/probe', { headers })
  return { status: res.status, json: await res.json() as Record<string, unknown> }
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('authenticate middleware', () => {
  // These assert the strict (multi-user) posture, where a missing/invalid token
  // is rejected. In the default dev posture the middleware instead falls through
  // to a best-effort dev identity.
  beforeAll(() => {
    process.env.MCP_AUTH_REQUIRED = '1'
  })
  afterAll(() => {
    delete process.env.MCP_AUTH_REQUIRED
  })

  it('AU01 — raw browser JWTs cannot authenticate as MCP access tokens', async () => {
    const token = await makeToken(USER_ID)
    const { status, json } = await req(token)
    expect(status).toBe(401)
  })

  it('AU02 — 401 with no Authorization header', async () => {
    const { status } = await req()
    expect(status).toBe(401)
  })

  it('AU03 — 401 with non-Bearer Authorization', async () => {
    const { status } = await req('Basic some-token')
    expect(status).toBe(401)
  })

  it('AU04 — 401 with invalid JWT signature', async () => {
    const token = await makeToken(USER_ID)
    const tampered = token.slice(0, -5) + 'XXXXX'
    const { status } = await req(tampered)
    expect(status).toBe(401)
  })

  it('AU05 — 401 with expired JWT', async () => {
    // Use a numeric expiry in the past (unix seconds)
    const pastExp = Math.floor(Date.now() / 1000) - 10
    const token = await new SignJWT({ sub: USER_ID })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(pastExp)
      .sign(SECRET)
    const { status } = await req(token)
    expect(status).toBe(401)
  })

  it('AU06 — 401 with malformed token string', async () => {
    const { status } = await req('not.a.jwt')
    expect(status).toBe(401)
  })
})

describe('authenticate middleware in optional development mode', () => {
  beforeAll(() => {
    delete process.env.MCP_AUTH_REQUIRED
  })

  afterAll(() => {
    delete process.env.MCP_AUTH_REQUIRED
  })

  it('AU07 — rejects an invalid supplied token instead of using the dev identity', async () => {
    const { status } = await req('not.a.jwt')
    expect(status).toBe(401)
  })

  it('AU08 — permits an anonymous request with the explicit dev identity', async () => {
    const { status, json } = await req()
    expect(status).toBe(200)
    expect(json.user_id).toBe('dev')
  })
})
