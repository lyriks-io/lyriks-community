import { resolveAccessToken, revokeAccessToken } from './access-tokens.js'
import { verifyPlatformSession } from './session.js'
// Strict mode resolves opaque MCP grants and revalidates their backing session
// with the platform. The session is forwarded internally; it is never returned
// as the client's credential. Optional development mode retains local JWTs.

import { jwtVerify }  from 'jose'
import type { Context, Next } from 'hono'
import { randomUUID } from 'crypto'
import type { HonoVariables } from './types.js'
import { enterprise } from './enterprise/index.js'
import { wwwAuthenticate } from './oauth.js'

const JWT_SECRET   = new TextEncoder().encode(process.env.JWT_SECRET ?? 'dev-secret')

// Point unauthenticated callers at OAuth discovery (RFC 9728 §5.1) so an MCP
// client's `/mcp` login flow can bootstrap from the 401.
const unauthorized = (c: Context, message: string) =>
  c.json({ errors: [{ code: 'UNAUTHORIZED', message, field: null }] }, 401, {
    'WWW-Authenticate': wwwAuthenticate(),
  })

export async function authenticate(
  c: Context<{ Variables: HonoVariables }>,
  next: Next,
): Promise<void | Response> {
  c.set('request_id', randomUUID())

  // Read at call-time (not module-load) so the posture can be toggled per
  // process/test without re-importing. Strict multi-user auth iff =1.
  const authRequired = process.env.MCP_AUTH_REQUIRED === '1'
  const authHeader = c.req.header('Authorization') ?? ''

  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    try {
      if (authRequired) {
        const grant = resolveAccessToken(token)
        if (!grant || await verifyPlatformSession(grant.session) !== grant.subject) {
          revokeAccessToken(token)
          return unauthorized(c, 'Invalid or expired MCP token')
        }
        c.set('user_id', grant.subject)
        c.set('user_token', grant.session)
        return await next()
      }
      const { payload } = await jwtVerify(token, JWT_SECRET)
      const sub = payload.sub
      if (typeof sub !== 'string') throw new Error('missing sub')
      c.set('user_id',    sub)
      c.set('user_token', token)
      return await next()
    } catch {
      // A presented credential is an explicit authentication attempt. Never
      // downgrade a forged or expired credential to the privileged dev identity.
      return unauthorized(c, 'Invalid or expired token')
    }
  } else if (authRequired) {
    return unauthorized(c, 'Bearer token required')
  }

  // Dev / single-tenant appliance: no token and auth not required.
  // With the Enterprise overlay, forward its dev-user token (the project owner)
  // so the Back-backed tools work; best-effort, since the section tools reach
  // the platform without it, so a failed dev login must not block the request.
  // Without the overlay there is no Back to log in to: an empty token.
  c.set('user_id', 'dev')
  try {
    c.set('user_token', enterprise ? await enterprise.devToken() : '')
  } catch {
    c.set('user_token', '')
  }
  await next()
}
