import { afterEach, expect, it, vi } from 'vitest'
import { verifyPlatformSession } from '../session.js'
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
it('uses the configured platform and refuses redirects, role failures and deleted sessions', async () => {
  vi.stubEnv('LYRIKS_BASE_URL', 'http://platform:3000')
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'operator' })))
  vi.stubGlobal('fetch', fetchMock)
  expect(await verifyPlatformSession('session')).toBe('operator')
  expect(fetchMock).toHaveBeenCalledWith('http://platform:3000/api/auth/session', expect.objectContaining({ headers: { cookie: 'lyriks_session=session' }, redirect: 'manual' }))
  for (const status of [302, 401, 403, 500]) {
    fetchMock.mockResolvedValue(new Response('', { status }))
    expect(await verifyPlatformSession('session')).toBeNull()
  }
  fetchMock.mockRejectedValue(new Error('offline'))
  expect(await verifyPlatformSession('session')).toBeNull()
  expect(await verifyPlatformSession('bad;cookie=value')).toBeNull()
})
