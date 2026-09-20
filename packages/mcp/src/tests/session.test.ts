import { afterEach, expect, it, vi } from 'vitest'
import { SignJWT, jwtVerify } from 'jose'
import { SESSION_EXTENSION_SECONDS, SESSION_UNAVAILABLE, extendPlatformSession, verifyPlatformSession } from '../session.js'
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
it('uses the configured platform and refuses role failures and deleted sessions', async () => {
  vi.stubEnv('LYRIKS_BASE_URL', 'http://platform:3000')
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'operator' })))
  vi.stubGlobal('fetch', fetchMock)
  expect(await verifyPlatformSession('session')).toBe('operator')
  expect(fetchMock).toHaveBeenCalledWith('http://platform:3000/api/auth/session', expect.objectContaining({ headers: { cookie: 'lyriks_session=session' }, redirect: 'manual' }))
  for (const status of [401, 403]) {
    fetchMock.mockResolvedValue(new Response('', { status }))
    expect(await verifyPlatformSession('session')).toBeNull()
  }
  expect(await verifyPlatformSession('bad;cookie=value')).toBeNull()
  expect(await verifyPlatformSession('')).toBeNull()
})
it('reads a platform that cannot answer as no verdict, never as a signed-out session', async () => {
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  // A failure of the platform or its account service, a redirect, an answer without an account.
  for (const response of [new Response('', { status: 503 }), new Response('', { status: 500 }), new Response('', { status: 502 }), new Response('', { status: 302 }), new Response('{}')]) {
    fetchMock.mockResolvedValue(response)
    expect(await verifyPlatformSession('session')).toBe(SESSION_UNAVAILABLE)
  }
  // Unreachable, or past the timeout.
  fetchMock.mockRejectedValue(new Error('offline'))
  expect(await verifyPlatformSession('session')).toBe(SESSION_UNAVAILABLE)
  fetchMock.mockRejectedValue(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))
  expect(await verifyPlatformSession('session')).toBe(SESSION_UNAVAILABLE)
})
it('re-signs only what the shared secret verifies, thirty days out, every other claim untouched', async () => {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? 'dev-secret')
  const now = Math.floor(Date.now() / 1000)
  const token = await new SignJWT({ sub: 'u1', iss: 'lyriks-platform', iat: now - 5 * 24 * 3600, session_version: 7, exp: now + 2 * 24 * 3600 })
    .setProtectedHeader({ alg: 'HS256' }).sign(secret)
  const extended = await extendPlatformSession(token)
  expect(extended).not.toBe(token)
  const { payload } = await jwtVerify(extended, secret, { algorithms: ['HS256'] })
  expect(payload).toMatchObject({ sub: 'u1', iss: 'lyriks-platform', iat: now - 5 * 24 * 3600, session_version: 7 })
  expect(payload.exp).toBeGreaterThanOrEqual(now + SESSION_EXTENSION_SECONDS)
  // Signed by someone else, tampered with, or not a JWT at all: as presented.
  const foreign = await new SignJWT({ sub: 'u1', exp: now + 3600 }).setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode('another-secret'))
  for (const presented of [foreign, 'not-a-jwt', token.slice(0, -2) + (token.endsWith('aa') ? 'bb' : 'aa')]) {
    expect(await extendPlatformSession(presented)).toBe(presented)
  }
})
