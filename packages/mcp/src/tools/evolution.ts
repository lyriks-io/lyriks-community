// The Evolution section as one aggregate: the board and the dossiers with their
// derived readings (maturity, gates, coherence, impact, report, pending
// proposals), readable in one call and driven with typed operations the
// platform guards server-side. Reading the raw section document and
// recomputing the dossier's rules from it is exactly what this replaces.

import type { LyriksClient } from '../lyriks-client.js'
import { HttpStatusError } from '../util/http-error.js'

export const DOSSIER_PARTS = [
  'summary',
  'fields',
  'proposals',
  'impact',
  'report',
  'readings',
  'history',
] as const
export type DossierPart = (typeof DOSSIER_PARTS)[number]

export interface GetEvolutionArgs {
  project_id: string
  request_id?: string
  part?: DossierPart
  section?: string
  verdict?: string
  /** fields, proposals, readings: keep what belongs to one touched feature. */
  leaf?: string
  offset?: number
  limit?: number
}

/**
 * The board (one card per live request), one dossier in counts, or one of its
 * lists (every field, every proposal, every impacted node, every report line,
 * the readings, the timeline), one at a time, narrowed to one touched feature
 * and paged, so the answer stays under the result cap however many features
 * the request touches.
 */
export async function getEvolutionHandler(args: GetEvolutionArgs, lyriks: LyriksClient): Promise<unknown> {
  const q = new URLSearchParams({ projectId: args.project_id })
  if (args.request_id) q.set('requestId', args.request_id)
  if (args.part && args.part !== 'summary') q.set('part', args.part)
  if (args.section) q.set('section', args.section)
  if (args.verdict) q.set('verdict', args.verdict)
  if (args.leaf) q.set('leaf', args.leaf)
  if (args.offset !== undefined) q.set('offset', String(args.offset))
  if (args.limit !== undefined) q.set('limit', String(args.limit))
  return lyriks.get(`/api/evolution?${q.toString()}`)
}

export interface ApplyEvolutionBatchArgs {
  project_id: string
  operations: Array<Record<string, unknown>>
  as_person?: boolean
}

/**
 * Typed lifecycle operations, applied atomically by the platform under the
 * same guards the dossier page applies. `as_person` relays the signed-in
 * person's own decision: the act lands as theirs, with the channel stamped.
 */
export async function applyEvolutionBatchHandler(
  args: ApplyEvolutionBatchArgs,
  lyriks: LyriksClient,
): Promise<unknown> {
  try {
    return await lyriks.post('/api/evolution', {
      projectId: args.project_id,
      operations: args.operations,
      as_person: args.as_person === true,
    })
  } catch (err) {
    // A refused batch (422) or a stale read (409) is an answer, not a failure:
    // the platform names each operation and the reason, and the agent acts on
    // that rather than on a bare HTTP status.
    const refused = parseRefusal(err)
    if (refused) return refused
    throw err
  }
}

/** The platform's refusal body out of the client's error message, when it is one. */
export function parseRefusal(err: unknown): unknown | null {
  const message = err instanceof Error ? err.message : String(err)
  const m = /^lyriks (409|422) on POST \/api\/evolution(?: \([^)]*\))?: ([\s\S]*)$/.exec(message)
  if (!m) return null
  // The message only carries a short detail; the refusal is the whole body.
  const body = err instanceof HttpStatusError ? err.body : m[2]
  try {
    return { ...(JSON.parse(body) as Record<string, unknown>), httpStatus: Number(m[1]) }
  } catch {
    return { ok: false, applied: false, httpStatus: Number(m[1]), message: m[2] }
  }
}
