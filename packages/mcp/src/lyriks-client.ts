// HTTP client for the Lyriks wizard app — the SOURCE OF TRUTH for all wizard
// sections (foundation, users, features, ...). Separate from the Back client
// of the Enterprise overlay (which targets the Back API, a downstream
// read-replica): section writes MUST hit lyriks so they show up in the UI and
// vice-versa.
//
// Base URL: LYRIKS_BASE_URL env var (default http://localhost:5173).
// lyriks endpoints return raw JSON (no { data } envelope).

// V3_BASE_URL is the former name of this variable, still honoured because the
// appliance carries its compose file across upgrades: every install predating
// the rename sets the old name, and an image that read only the new one would
// fall back to the localhost default — inside a container, nothing. The MCP
// would then start clean and fail every section tool, with no error naming the
// cause. Prefer the new name; drop the old one only once no supported release
// still ships a compose that sets it.
const BASE_URL =
	process.env.LYRIKS_BASE_URL ?? process.env.V3_BASE_URL ?? 'http://localhost:5173'

/**
 * The lyriks dev server intermittently 500s with an ENOENT on a `.svelte-kit/types`
 * proxy file while vite regenerates route types mid-request. It is a transient
 * race, not a caller error — a single retry after a short pause reliably lands.
 */
function isDevServerTypegenRace(status: number, bodyText: string): boolean {
  return status >= 500 && bodyText.includes('ENOENT') && bodyText.includes('.svelte-kit')
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class LyriksClient {
  // The caller's API JWT (forwarded by the MCP auth middleware — a real user in
  // strict mode, the dev/service user otherwise). When lyriks runs with
  // LYRIKS_AUTH_REQUIRED=1 it gates every /api/* call on the `lyriks_session`
  // cookie, so we present the token as that cookie. lyriks validates it against the
  // same packages/api, authenticating us as that user. Empty token => no cookie
  // (single-tenant appliance with auth off — unchanged behaviour).
  constructor(private readonly token?: string) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.token) h['Cookie'] = `lyriks_session=${this.token}`
    return h
  }

  private async request<T>(method: 'GET' | 'PUT' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
    const init: RequestInit = { method, headers: this.headers() }
    if (body !== undefined) init.body = JSON.stringify(body)
    let retried = false
    for (;;) {
      const res = await fetch(`${BASE_URL}${path}`, init)
      if (res.ok) return (await res.json()) as T
      const text = await res.text()
      if (!retried && isDevServerTypegenRace(res.status, text)) {
        retried = true
        await sleep(400)
        continue
      }
      const note = retried ? ' (dev server busy — already retried once)' : ''
      throw new Error(`lyriks ${res.status} on ${method} ${path}${note}: ${text}`)
    }
  }

  async get<T = unknown>(path: string): Promise<T> {
    return this.request<T>('GET', path)
  }

  async put<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, body)
  }

  // POST for read-only computations that need a request body (e.g. simulate) —
  // distinct from put(), which targets the section save endpoints.
  async post<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body)
  }

  async patch<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body)
  }

  async delete<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('DELETE', path, body)
  }
}
