// The playbook installer's sign-in (criterion 3f42911b). sync_skills offers a
// command that installs every guide, hook and script from the disk instead of
// through the conversation; in a deployment that enforces sign-in, the
// command carries this token. It lives ten minutes, is backed by the same
// platform session as the client that asked for it (so signing out cuts it
// too), and reads playbooks only: any other tool refuses it.

import type { Context, Next } from 'hono'
import { issueAccessToken } from './access-tokens.js'
import type { HonoVariables } from './types.js'

export const SKILLS_TICKET_TTL_SECONDS = 600

/** The only tools a skills ticket may call. */
export const SKILLS_TICKET_TOOLS: ReadonlySet<string> = new Set(['sync_skills', 'get_skill', 'list_skills'])

/** A ticket for the installer, with when it stops working; null when no grant can be issued now. */
export function issueSkillsTicket(session: string, subject: string): { token: string; expiresAt: string } | null {
  const token = issueAccessToken(session, subject, 'lyriks-skills-installer', { scope: 'skills', ttlSeconds: SKILLS_TICKET_TTL_SECONDS })
  return token ? { token, expiresAt: new Date(Date.now() + SKILLS_TICKET_TTL_SECONDS * 1000).toISOString() } : null
}

/**
 * Whether a JSON-RPC body (one message or a batch) stays within what a skills
 * ticket may do: open the session, list the tools, and call the three
 * playbook tools. Anything else, or a body that is not JSON-RPC, is refused.
 */
export function skillsTicketAllows(body: unknown): boolean {
  const messages = Array.isArray(body) ? body : [body]
  if (messages.length === 0) return false
  return messages.every((message) => {
    if (!message || typeof message !== 'object') return false
    const { method, params } = message as { method?: unknown; params?: { name?: unknown } }
    if (typeof method !== 'string') return false
    if (method === 'initialize' || method === 'ping' || method === 'tools/list' || method.startsWith('notifications/')) return true
    return method === 'tools/call' && typeof params?.name === 'string' && SKILLS_TICKET_TOOLS.has(params.name)
  })
}

/** Refuses, before any tool runs, a skills ticket used for anything but the playbooks. */
export async function skillsScopeGuard(c: Context<{ Variables: HonoVariables }>, next: Next): Promise<void | Response> {
  if (c.get('token_scope') === 'skills' && !skillsTicketAllows(await c.req.raw.clone().json().catch(() => null))) {
    return c.json({ errors: [{ code: 'FORBIDDEN', message: 'This sign-in only reads the Lyriks playbooks (sync_skills, get_skill, list_skills).', field: null }] }, 403)
  }
  await next()
}
