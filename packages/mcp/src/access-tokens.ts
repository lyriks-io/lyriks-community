import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto'

interface Grant {
  session: string
  subject: string
  clientId: string
  expiresAt: number
  /**
   * "skills": the playbook installer's sign-in, which reads playbooks only (skills-ticket.ts).
   * "session-wait": the waiting command of a live session, which only waits in it (session-ticket.ts).
   * "index-sync": the sync command of one project's index, which only reads where index keys belong and sends that index (index-ticket.ts).
   */
  scope?: TokenScope
  /** The one live session a "session-wait" grant may wait in. */
  sessionId?: string
  /** The one project an "index-sync" grant may read keys of and send the index of. */
  projectId?: string
}
export type TokenScope = 'skills' | 'session-wait' | 'index-sync'
const grants = new Map<string, Grant>()
const MAX_GRANTS = 1000
export const ACCESS_TOKEN_TTL_SECONDS = 3600
// Matches the thirty days each grant re-signs the wrapped platform session for
// (oauth.ts): the sign-in lives while it is used at least once every thirty
// days, and a refresh past the session's own expiry still fails at
// verifyPlatformSession, whatever this says.
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 3600
const REFRESH_PREFIX = 'lyriks_mcp_refresh_'
const digest = (token: string) => createHash('sha256').update(token).digest('hex')

/** Opaque credentials only resolve here; they cannot authenticate a browser or Back request. */
export function issueAccessToken(
  session: string,
  subject: string,
  clientId: string,
  opts: { scope?: TokenScope; ttlSeconds?: number; sessionId?: string; projectId?: string } = {},
): string | null {
  for (const [key, grant] of grants) if (grant.expiresAt <= Date.now()) grants.delete(key)
  if (grants.size >= MAX_GRANTS) return null
  const token = `lyriks_mcp_${randomBytes(32).toString('base64url')}`
  const expiresAt = Date.now() + (opts.ttlSeconds ?? ACCESS_TOKEN_TTL_SECONDS) * 1000
  grants.set(digest(token), {
    session, subject, clientId, expiresAt,
    ...(opts.scope ? { scope: opts.scope } : {}),
    ...(opts.sessionId ? { sessionId: opts.sessionId } : {}),
    ...(opts.projectId ? { projectId: opts.projectId } : {}),
  })
  return token
}

export function resolveAccessToken(token: string): Readonly<Grant> | null {
  if (token.startsWith(TICKET_PREFIX)) return resolveTicket(token)
  if (!/^lyriks_mcp_[A-Za-z0-9_-]{43}$/.test(token)) return null
  const key = digest(token)
  const grant = grants.get(key)
  if (!grant || grant.expiresAt <= Date.now()) {
    grants.delete(key)
    return null
  }
  return grant
}

export function revokeAccessToken(token: string): void {
  if (token.startsWith(TICKET_PREFIX)) {
    const grant = openTicket(token)
    pruneRevokedTickets()
    if (grant) revokedTickets.set(digest(token), grant.expiresAt)
    return
  }
  grants.delete(digest(token))
}

// ── Tickets of the commands an AI runs ───────────────────────────────────────
// The waiting command of a live session (session-ticket.ts) and the sync command
// of an index (index-ticket.ts) hold their ticket for twelve hours. Kept in the
// map above like an access token, a ticket died with the gateway: every deploy
// restarts it, the command then got 401, and the AI opened a second session
// beside the first or asked for a new command (criteria d3916c06, 6b918030).
// A ticket is self-contained instead, like a refresh token: its grant, encrypted
// and authenticated (AES-256-GCM) under a key of its own derived from the secret
// the gateway shares with the platform. It is exactly as narrow as before: every
// call still checks the platform session it carries (auth.ts), so signing out
// cuts it, its scope and what it is bound to (the one live session, the one
// project) travel inside the authenticated part, and the scope guards still
// refuse anything else. A revoked ticket is remembered until it expires; across
// a restart, the session check alone still refuses one whose sign-in is over.
const TICKET_PREFIX = 'lyriks_mcp_ticket_'
const revokedTickets = new Map<string, number>()
const MAX_REVOKED_TICKETS = 10_000

function ticketKey(): Buffer {
  return Buffer.from(hkdfSync('sha256', process.env.JWT_SECRET ?? 'dev-secret', '', 'lyriks-mcp-session-ticket', 32))
}

function pruneRevokedTickets(): void {
  for (const [key, expiresAt] of revokedTickets) if (expiresAt <= Date.now()) revokedTickets.delete(key)
  while (revokedTickets.size >= MAX_REVOKED_TICKETS) revokedTickets.delete(revokedTickets.keys().next().value!)
}

/** What a ticket is bound to: the live session it waits in, or the project whose index it sends. */
type TicketBinding = { scope: 'session-wait'; sessionId: string } | { scope: 'index-sync'; projectId: string }

/** A ticket for one command, for `ttlSeconds`, backed by `session` and bound as `binding` says. */
export function issueTicket(session: string, subject: string, clientId: string, binding: TicketBinding, ttlSeconds: number): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', ticketKey(), iv)
  const bound = binding.scope === 'session-wait' ? { i: binding.sessionId } : { p: binding.projectId }
  const claims = JSON.stringify({ s: session, u: subject, c: clientId, k: binding.scope, ...bound, e: Date.now() + ttlSeconds * 1000 })
  const body = Buffer.concat([cipher.update(claims, 'utf8'), cipher.final()])
  return TICKET_PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url')
}

/** A ticket that only waits in one live session, for `ttlSeconds`, backed by `session`. */
export function issueSessionWaitTicket(session: string, subject: string, clientId: string, sessionId: string, ttlSeconds: number): string {
  return issueTicket(session, subject, clientId, { scope: 'session-wait', sessionId }, ttlSeconds)
}

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.length > 0

function openTicket(token: string): Grant | null {
  if (!token.startsWith(TICKET_PREFIX) || token.length > 8192) return null
  try {
    const raw = Buffer.from(token.slice(TICKET_PREFIX.length), 'base64url')
    if (raw.length < 29) return null
    const decipher = createDecipheriv('aes-256-gcm', ticketKey(), raw.subarray(0, 12))
    decipher.setAuthTag(raw.subarray(12, 28))
    const claims = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'))
    if (typeof claims.s !== 'string' || typeof claims.u !== 'string' || typeof claims.c !== 'string' || typeof claims.e !== 'number') return null
    const grant = { session: claims.s, subject: claims.u, clientId: claims.c, expiresAt: claims.e }
    // A ticket always carries one narrow scope and what it is bound to; anything else opens nothing.
    if (claims.k === 'session-wait' && nonEmpty(claims.i)) return { ...grant, scope: 'session-wait', sessionId: claims.i }
    if (claims.k === 'index-sync' && nonEmpty(claims.p)) return { ...grant, scope: 'index-sync', projectId: claims.p }
    return null
  } catch {
    return null
  }
}

function resolveTicket(token: string): Readonly<Grant> | null {
  const grant = openTicket(token)
  if (!grant || grant.expiresAt <= Date.now()) return null
  const revokedUntil = revokedTickets.get(digest(token))
  return revokedUntil !== undefined && revokedUntil > Date.now() ? null : grant
}

// ── Refresh tokens ───────────────────────────────────────────────────────────
// Access tokens live an hour in this process. Without a refresh token every
// expiry, and every gateway restart, sent the MCP client back to the browser
// for a fresh consent: one tab per hour of use. A refresh token renews the
// access token silently for as long as the platform session behind it lives,
// which the token endpoint re-verifies on every refresh.
//
// The gateway keeps no database and no volume, so the token is self-contained:
// the grant, encrypted and authenticated (AES-256-GCM) under a key derived from
// the secret the gateway already shares with the platform. Only this gateway
// can open it, a restart or upgrade still honours it, and it cannot serve as a
// platform session because the platform never sees it. Refresh tokens rotate:
// each use spends the presented token and hands out a new one. The spent list
// is in memory, so a rotated-away token could be presented again after a
// restart; it then yields no more than the live client already holds, and only
// while the platform session is still valid.
//
// A token presented again within REUSE_GRACE_MS of its first use, by the same
// client, is honoured once more. One AI client often runs several processes on
// one token store (Claude Desktop: one for chat, one for Cowork and Code); after
// a gateway restart they all get a 401 at once and renew with the same token.
// Strict single use answered the second one invalid_grant, which makes a client
// discard the store they share and open a browser window. Past the grace, or
// once revoked, a reused token is refused as before.
interface Spent { expiresAt: number; spentAt: number }
const spent = new Map<string, Spent>()
const MAX_SPENT = 50_000
export const REUSE_GRACE_MS = 30_000

function refreshKey(): Buffer {
  return Buffer.from(hkdfSync('sha256', process.env.JWT_SECRET ?? 'dev-secret', '', 'lyriks-mcp-refresh-token', 32))
}
function pruneSpent(): void {
  for (const [key, entry] of spent) if (entry.expiresAt <= Date.now()) spent.delete(key)
  while (spent.size >= MAX_SPENT) spent.delete(spent.keys().next().value!)
}

export function issueRefreshToken(session: string, subject: string, clientId: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', refreshKey(), iv)
  const claims = JSON.stringify({ s: session, u: subject, c: clientId, e: Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000 })
  const body = Buffer.concat([cipher.update(claims, 'utf8'), cipher.final()])
  return REFRESH_PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url')
}

function openRefreshToken(token: string): Grant | null {
  if (!token.startsWith(REFRESH_PREFIX) || token.length > 8192) return null
  try {
    const raw = Buffer.from(token.slice(REFRESH_PREFIX.length), 'base64url')
    if (raw.length < 29) return null
    const decipher = createDecipheriv('aes-256-gcm', refreshKey(), raw.subarray(0, 12))
    decipher.setAuthTag(raw.subarray(12, 28))
    const claims = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'))
    if (typeof claims.s !== 'string' || typeof claims.u !== 'string' || typeof claims.c !== 'string' || typeof claims.e !== 'number') return null
    return { session: claims.s, subject: claims.u, clientId: claims.c, expiresAt: claims.e }
  } catch {
    return null
  }
}

/**
 * The grant a refresh token still carries, without spending it: the token
 * endpoint checks the session behind it first, so a platform that cannot
 * answer for a moment does not burn the client's only way back in.
 */
export function readRefreshToken(token: string, clientId: string): Readonly<Grant> | null {
  const grant = openRefreshToken(token)
  if (!grant || grant.expiresAt <= Date.now() || grant.clientId !== clientId) return null
  pruneSpent()
  const use = spent.get(digest(token))
  return !use || Date.now() - use.spentAt <= REUSE_GRACE_MS ? grant : null
}

/** Spent on first use, whatever the caller does with the grant; honoured again only within REUSE_GRACE_MS. */
export function redeemRefreshToken(token: string, clientId: string): Readonly<Grant> | null {
  const grant = readRefreshToken(token, clientId)
  if (!grant) return null
  const key = digest(token)
  if (!spent.has(key)) spent.set(key, { expiresAt: grant.expiresAt, spentAt: Date.now() })
  return grant
}

export function revokeRefreshToken(token: string): void {
  const grant = openRefreshToken(token)
  if (!grant) return
  pruneSpent()
  // Revoked, not used: outside any grace.
  spent.set(digest(token), { expiresAt: grant.expiresAt, spentAt: 0 })
}
