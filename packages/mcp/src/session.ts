import { SignJWT, jwtVerify } from 'jose'

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

// A sign-in lives while it is used: each grant re-signs the session this far
// out, so only thirty days of silence, or the platform revoking the session,
// ends it.
export const SESSION_EXTENSION_SECONDS = 30 * 24 * 3600

/**
 * Re-sign the platform session to expire SESSION_EXTENSION_SECONDS from now,
 * every other claim kept as it is (sub, iss, iat, session_version): the
 * platform still recognises the account, and still revokes it by bumping
 * session_version, whatever the new expiry says. Only for a session the
 * platform has just confirmed. Anything the shared secret does not verify
 * (another signer, a tampered token, an opaque value) is returned as presented.
 */
export async function extendPlatformSession(token: string): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? 'dev-secret')
  try {
    const { payload, protectedHeader } = await jwtVerify(token, secret, { algorithms: ['HS256'] })
    return await new SignJWT({ ...payload, exp: Math.floor(Date.now() / 1000) + SESSION_EXTENSION_SECONDS })
      .setProtectedHeader(protectedHeader)
      .sign(secret)
  } catch {
    return token
  }
}
