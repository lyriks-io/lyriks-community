const MIN_SECRET_LENGTH = 32
const PLACEHOLDER_SECRETS = new Set(['dev-secret', 'change-me'])

/** Fail closed when strict multi-user authentication is enabled. */
export function assertStrictAuthConfiguration(): void {
  if (process.env.MCP_AUTH_REQUIRED !== '1') return

  const secret = process.env.JWT_SECRET ?? ''
  if (secret.length < MIN_SECRET_LENGTH || PLACEHOLDER_SECRETS.has(secret)) {
    throw new Error(
      `JWT_SECRET must be a generated secret of at least ${MIN_SECRET_LENGTH} characters when MCP_AUTH_REQUIRED=1`,
    )
  }

  // The OAuth flow leaves this process for a browser: clients read the
  // authorization endpoints out of discovery, and an unauthenticated authorize
  // bounces to <origin>/login. Both are built from PUBLIC_BASE_URL, and it
  // cannot be derived from the request — behind the proxy the Host is an
  // internal address. Empty, it falls back to this gateway's own origin, which
  // serves no login page: the browser opens the flow and gets a 404. Refuse to
  // start rather than advertise an authorization server nobody can complete.
  const publicBaseUrl = (process.env.PUBLIC_BASE_URL ?? '').trim()
  if (publicBaseUrl.length === 0) {
    throw new Error(
      'PUBLIC_BASE_URL must be the origin browsers reach this server on (e.g. https://lyriks.example.corp) when MCP_AUTH_REQUIRED=1',
    )
  }
  try {
    new URL(publicBaseUrl)
  } catch {
    throw new Error(`PUBLIC_BASE_URL must be an absolute URL; got "${publicBaseUrl}"`)
  }
}
