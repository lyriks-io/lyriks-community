import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto'

interface Grant {
  session: string
  subject: string
  clientId: string
  expiresAt: number
}
const grants = new Map<string, Grant>()
const MAX_GRANTS = 1000
export const ACCESS_TOKEN_TTL_SECONDS = 3600
// Bounded by the platform session it wraps (seven days): a refresh past the
// session's own expiry fails at verifyPlatformSession, whatever this says.
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 3600
const REFRESH_PREFIX = 'lyriks_mcp_refresh_'
const digest = (token: string) => createHash('sha256').update(token).digest('hex')

/** Opaque credentials only resolve here; they cannot authenticate a browser or Back request. */
export function issueAccessToken(session: string, subject: string, clientId: string): string | null {
  for (const [key, grant] of grants) if (grant.expiresAt <= Date.now()) grants.delete(key)
  if (grants.size >= MAX_GRANTS) return null
  const token = `lyriks_mcp_${randomBytes(32).toString('base64url')}`
  grants.set(digest(token), { session, subject, clientId, expiresAt: Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000 })
  return token
}

export function resolveAccessToken(token: string): Readonly<Grant> | null {
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
  grants.delete(digest(token))
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
const spent = new Map<string, number>()
const MAX_SPENT = 50_000

function refreshKey(): Buffer {
  return Buffer.from(hkdfSync('sha256', process.env.JWT_SECRET ?? 'dev-secret', '', 'lyriks-mcp-refresh-token', 32))
}
function pruneSpent(): void {
  for (const [key, expiresAt] of spent) if (expiresAt <= Date.now()) spent.delete(key)
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

/** Single use: a valid token is spent here whatever the caller does with the grant. */
export function redeemRefreshToken(token: string, clientId: string): Readonly<Grant> | null {
  const grant = openRefreshToken(token)
  if (!grant || grant.expiresAt <= Date.now() || grant.clientId !== clientId) return null
  pruneSpent()
  const key = digest(token)
  if (spent.has(key)) return null
  spent.set(key, grant.expiresAt)
  return grant
}

export function revokeRefreshToken(token: string): void {
  const grant = openRefreshToken(token)
  if (!grant) return
  pruneSpent()
  spent.set(digest(token), grant.expiresAt)
}
