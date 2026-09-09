/** Validate the session and MCP role through the platform's current identity policy. */
export async function verifyPlatformSession(token: string): Promise<string | null> {
  if (!token || /[\r\n;]/.test(token)) return null
  const base = (process.env.LYRIKS_BASE_URL ?? process.env.V3_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '')
  try {
    const response = await fetch(`${base}/api/auth/session`, {
      headers: { cookie: `lyriks_session=${encodeURIComponent(token)}` },
      redirect: 'manual',
      signal: AbortSignal.timeout(4000),
    })
    if (!response.ok) return null
    const body = await response.json() as { id?: unknown }
    return typeof body.id === 'string' && body.id ? body.id : null
  } catch {
    return null
  }
}
