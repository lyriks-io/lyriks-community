import { LyriksClient } from './lyriks-client.js'

/** What the installation's edition opens, as the platform says (GET /api/scope). */
export interface EditionScope {
  readonly evolutions: boolean
}

/** The tools that drive Evolution requests and the roadmap: Community holds neither (EVO-001). */
export const EVOLUTION_TOOLS: ReadonlySet<string> = new Set([
  'get_evolution',
  'apply_evolution_batch',
  'start_evolution_session',
  'await_evolution_event',
  'update_evolution_session',
  'get_roadmap',
  'apply_roadmap_batch',
  'reconcile_roadmap_statuses',
])

/** Everything open: what is offered when the platform cannot be asked, since it refuses on its own anyway. */
export const OPEN_SCOPE: EditionScope = { evolutions: true }

const TTL_MS = 60_000
let cached: { scope: EditionScope; at: number } | null = null

/**
 * The scope, read once a minute: the edition only changes with a new key, and
 * the tool list is built on every call. A failed read offers every tool and is
 * not kept, so the next call asks again.
 */
export async function readEditionScope(token?: string, now = Date.now()): Promise<EditionScope> {
  if (cached && now - cached.at < TTL_MS) return cached.scope
  try {
    const answer = await new LyriksClient(token).get<{ evolutions?: unknown }>('/api/scope')
    const scope = { evolutions: answer?.evolutions !== false }
    cached = { scope, at: now }
    return scope
  } catch {
    return OPEN_SCOPE
  }
}

/** Forget the cached scope (tests). */
export function forgetEditionScope(): void {
  cached = null
}
