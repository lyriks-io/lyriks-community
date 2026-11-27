// The waker's sign-in (feat-ai-session, action "Keep my waker listening",
// criterion ab716003). start_evolution_session hands the AI a command that
// starts the person's waker (.lyriks/tools/wake-ai.mjs): a program of their
// own machine that waits for their clicks on one project and starts their AI
// without a window when one waits and none of their AIs is in session. That
// program outlives the AI's conversation and holds none of its credentials, so
// where sign-in is enforced it carries this ticket: backed by the same
// platform session as the client that opened the session (signing out cuts
// it), it lives wakeTicketDays at most, and it can only wait for wakes on that
// one project (await_ai_wake). Nobody copies or sets a token.

import type { Context, Next } from 'hono'
import { issueTicket } from './access-tokens.js'
import type { HonoVariables } from './types.js'

/** PROVISIONAL constant wakeTicketDays (30): as long as an AI client's sign-in is refreshed for. */
export const WAKE_TICKET_TTL_SECONDS = 30 * 24 * 3600

/** A ticket for the person's waker on one project, with when it stops working. */
export function issueWakeTicket(session: string, subject: string, projectId: string): { token: string; expiresAt: string } {
  const token = issueTicket(session, subject, 'lyriks-ai-waker', { scope: 'ai-wake', projectId }, WAKE_TICKET_TTL_SECONDS)
  return { token, expiresAt: new Date(Date.now() + WAKE_TICKET_TTL_SECONDS * 1000).toISOString() }
}

/**
 * Whether a JSON-RPC body (one message or a batch) stays within what a waker
 * ticket may do: open the MCP session, list the tools, and wait for wakes on
 * its project. Any other tool, another project, or a body that is not JSON-RPC
 * is refused.
 */
export function wakeTicketAllows(body: unknown, projectId: string | null | undefined): boolean {
  if (!projectId) return false
  const messages = Array.isArray(body) ? body : [body]
  if (messages.length === 0) return false
  return messages.every((message) => {
    if (!message || typeof message !== 'object') return false
    const { method, params } = message as { method?: unknown; params?: { name?: unknown; arguments?: { project_id?: unknown } } }
    if (typeof method !== 'string') return false
    if (method === 'initialize' || method === 'ping' || method === 'tools/list' || method.startsWith('notifications/')) return true
    return method === 'tools/call' && params?.name === 'await_ai_wake' && params.arguments?.project_id === projectId
  })
}

/** Refuses, before any tool runs, a waker ticket used for anything but waiting for wakes on its project. */
export async function wakeScopeGuard(c: Context<{ Variables: HonoVariables }>, next: Next): Promise<void | Response> {
  if (c.get('token_scope') === 'ai-wake' && !wakeTicketAllows(await c.req.raw.clone().json().catch(() => null), c.get('token_project'))) {
    return c.json({ errors: [{ code: 'FORBIDDEN', message: `This sign-in only waits for the person's wakes on project ${c.get('token_project') ?? '(none)'} (await_ai_wake).`, field: null }] }, 403)
  }
  await next()
}
