// The waiting command of a live session (feat-ai-session, criterion 26c95cc1).
// start_evolution_session hands the AI a command that waits for the person's
// clicks in the background (.lyriks/tools/await-event.mjs). That command is a
// process of its own and holds none of the AI client's credentials, so where
// sign-in is enforced it carries this ticket: backed by the same platform
// session as the client that opened the session (signing out cuts it), it
// lives twelve hours at most, and it can only call await_evolution_event in
// that one session. Nobody copies or sets a token.

import type { Context, Next } from 'hono'
import { issueAccessToken } from './access-tokens.js'
import type { HonoVariables } from './types.js'

/** Longer than any working day in session; the session itself ends sooner when idle. */
export const SESSION_TICKET_TTL_SECONDS = 12 * 3600

/** A ticket for the waiting command, with when it stops working; null when no grant can be issued now. */
export function issueSessionTicket(session: string, subject: string, sessionId: string): { token: string; expiresAt: string } | null {
  const token = issueAccessToken(session, subject, 'lyriks-session-waiter', {
    scope: 'session-wait',
    sessionId,
    ttlSeconds: SESSION_TICKET_TTL_SECONDS,
  })
  return token ? { token, expiresAt: new Date(Date.now() + SESSION_TICKET_TTL_SECONDS * 1000).toISOString() } : null
}

/**
 * Whether a JSON-RPC body (one message or a batch) stays within what a session
 * ticket may do: open the MCP session, list the tools, and wait in ITS live
 * session. Any other tool, a wait in another session, or a body that is not
 * JSON-RPC is refused.
 */
export function sessionTicketAllows(body: unknown, sessionId: string | null | undefined): boolean {
  if (!sessionId) return false
  const messages = Array.isArray(body) ? body : [body]
  if (messages.length === 0) return false
  return messages.every((message) => {
    if (!message || typeof message !== 'object') return false
    const { method, params } = message as { method?: unknown; params?: { name?: unknown; arguments?: { session_id?: unknown } } }
    if (typeof method !== 'string') return false
    if (method === 'initialize' || method === 'ping' || method === 'tools/list' || method.startsWith('notifications/')) return true
    return method === 'tools/call' && params?.name === 'await_evolution_event' && params.arguments?.session_id === sessionId
  })
}

/** Refuses, before any tool runs, a session ticket used for anything but waiting in its session. */
export async function sessionScopeGuard(c: Context<{ Variables: HonoVariables }>, next: Next): Promise<void | Response> {
  if (c.get('token_scope') === 'session-wait' && !sessionTicketAllows(await c.req.raw.clone().json().catch(() => null), c.get('token_session'))) {
    return c.json({ errors: [{ code: 'FORBIDDEN', message: 'This sign-in only waits for the clicks of the live session it was issued for (await_evolution_event).', field: null }] }, 403)
  }
  await next()
}
