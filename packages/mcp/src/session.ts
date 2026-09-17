/**
 * No verdict on the session: the platform, or the account service behind it,
 * did not answer in time or answered with a failure of its own. It says nothing
 * about the session, so it must never be treated as a signed-out user: MCP
 * clients answer a signed-out verdict by throwing their tokens away and opening
 * a browser window, one per client process, every time the platform restarts
 * or runs slow.
 */
export const SESSION_UNAVAILABLE: unique symbol = Symbol('platform session check unavailable')
export type SessionCheck = string | null | typeof SESSION_UNAVAILABLE

// The platform checks the account and then its role, each against the account
// service with its own 4 s budget: a shorter wait here gave up on answers that
// were on their way.
const SESSION_CHECK_TIMEOUT_MS = 10_000

/**
 * Validate the session and MCP role through the platform's current identity policy:
 * the account id, `null` when the platform says the session is not (or no longer)
 * a valid MCP session, or SESSION_UNAVAILABLE when it could not say.
 */
export async function verifyPlatformSession(token: string): Promise<SessionCheck> {
  if (!token || /[\r\n;]/.test(token)) return null
  const base = (process.env.LYRIKS_BASE_URL ?? process.env.V3_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '')
  try {
    const response = await fetch(`${base}/api/auth/session`, {
      headers: { cookie: `lyriks_session=${encodeURIComponent(token)}` },
      redirect: 'manual',
      signal: AbortSignal.timeout(SESSION_CHECK_TIMEOUT_MS),
    })
    if (response.status === 401 || response.status === 403) return null
    if (!response.ok) return SESSION_UNAVAILABLE
    const body = await response.json() as { id?: unknown }
    return typeof body.id === 'string' && body.id ? body.id : SESSION_UNAVAILABLE
  } catch {
    return SESSION_UNAVAILABLE
  }
}
