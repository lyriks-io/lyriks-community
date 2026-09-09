import { createHash, randomBytes } from 'node:crypto'

interface Grant {
  session: string
  subject: string
  clientId: string
  expiresAt: number
}
const grants = new Map<string, Grant>()
const MAX_GRANTS = 1000
export const ACCESS_TOKEN_TTL_SECONDS = 3600
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
