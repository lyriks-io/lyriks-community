// The Evolution section as one aggregate: the board and the dossiers with their
// derived readings (maturity, gates, coherence, impact, report, pending
// proposals), readable in one call and driven with typed operations the
// platform guards server-side. Reading the raw section document and
// recomputing the dossier's rules from it is exactly what this replaces.

import type { LyriksClient } from '../lyriks-client.js'
import { HttpStatusError } from '../util/http-error.js'
import { RESULT_CAP } from '../util/shape.js'

export const DOSSIER_PARTS = [
  'summary',
  'drafts',
  'fields',
  'proposals',
  'impact',
  'report',
  'readings',
  'history',
  // Without request_id: the board's own lists, paged.
  'leaves',
  'sources',
] as const
export type DossierPart = (typeof DOSSIER_PARTS)[number]

export interface GetEvolutionArgs {
  project_id: string
  request_id?: string
  part?: DossierPart
  section?: string
  verdict?: string
  /** report: the request's own lines, or what the touched features already held. */
  scope?: 'request' | 'inherited'
  /** impact: which run to read. The three hypotheses are all kept. */
  hypothesis?: string
  /** fields, proposals, readings, drafts: keep what belongs to one touched feature. */
  leaf?: string
  offset?: number
  limit?: number
}

/**
 * The origin a person's browser reaches the pages on. On an installation it is
 * PUBLIC_BASE_URL, the same origin the sign-in is served from; in development
 * the pages run on the Vite server while this server listens elsewhere.
 */
export function pageOrigin(): string {
  return (process.env.PUBLIC_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '')
}

/**
 * Every `href` the platform put on a place a person acts on (a request, a
 * field, a proposal, the next gate, a report line, an observation) is a path
 * relative to the installation. A client has no way to know which installation
 * it talks to, so the link is made whole here, where that is known, and handed
 * over as a link a person opens with one click.
 */
export function withPageLinks<T>(answer: T, origin: string = pageOrigin()): T {
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk)
    if (value === null || typeof value !== 'object') return value
    const out: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = key === 'href' && typeof v === 'string' && v.startsWith('/') ? `${origin}${v}` : walk(v)
    }
    return out
  }
  return walk(answer) as T
}

/**
 * The board (one card per live request), one dossier in counts, or one of its
 * lists (every field, every proposal, every impacted node, every report line,
 * the readings, the timeline), one at a time, narrowed to one touched feature
 * and paged, so the answer stays under the result cap however many features
 * the request touches.
 */
export async function getEvolutionHandler(
  args: GetEvolutionArgs,
  lyriks: LyriksClient,
  budget: number = RESULT_CAP - PAGE_MARGIN,
): Promise<unknown> {
  const read = async (limit: number | undefined) => {
    const q = new URLSearchParams({ projectId: args.project_id })
    if (args.request_id) q.set('requestId', args.request_id)
    if (args.part && args.part !== 'summary') q.set('part', args.part)
    if (args.section) q.set('section', args.section)
    if (args.verdict) q.set('verdict', args.verdict)
    if (args.scope) q.set('scope', args.scope)
    if (args.hypothesis) q.set('hypothesis', args.hypothesis)
    if (args.leaf) q.set('leaf', args.leaf)
    if (args.offset !== undefined) q.set('offset', String(args.offset))
    if (limit !== undefined) q.set('limit', String(limit))
    return withPageLinks(await lyriks.get(`/api/evolution?${q.toString()}`))
  }
  return fitPage(read, args.limit, budget)
}

/** Room kept under the result cap for the tool's own wrapping. */
const PAGE_MARGIN = 1500
/** Attempts at a smaller page before letting the cap's safety net have it. */
const PAGE_TRIES = 6

/** Where a paged list sits in an answer, and what its rows are called. */
function pagedList(answer: unknown): { block: Record<string, unknown>; rows: unknown[] } | null {
  if (!answer || typeof answer !== 'object') return null
  const top = answer as Record<string, unknown>
  const holder = top.request && typeof top.request === 'object' ? (top.request as Record<string, unknown>) : top
  for (const [owner, rowsKey] of LIST_HOMES) {
    const block = holder[owner] ?? top[owner]
    if (block && typeof block === 'object' && Array.isArray((block as Record<string, unknown>)[rowsKey]))
      return { block: block as Record<string, unknown>, rows: (block as Record<string, unknown>)[rowsKey] as unknown[] }
  }
  return null
}

const LIST_HOMES: ReadonlyArray<readonly [string, string]> = [
  ['drafts', 'entries'],
  ['fields', 'entries'],
  ['proposals', 'entries'],
  ['readings', 'entries'],
  ['impact', 'findings'],
  ['report', 'lines'],
  ['leaves', 'entries'],
  ['sources', 'entries'],
]

/**
 * A paged part that does not fit the result cap is read again with a smaller
 * page, so the answer keeps ITS OWN shape and says where the next page starts.
 * Left to the cap's safety net, the same list came back as `{total, returned,
 * items}` wrapped in `partial`, a different shape from one page to the next,
 * and every reader broke on it once.
 */
export async function fitPage(
  read: (limit: number | undefined) => Promise<unknown>,
  asked: number | undefined,
  budget: number,
): Promise<unknown> {
  let answer = await read(asked)
  for (let tries = 0; tries < PAGE_TRIES; tries++) {
    const size = JSON.stringify(answer)?.length ?? 0
    const list = pagedList(answer)
    if (!list) return answer
    if (size <= budget) return withNextOffset(answer, list, tries > 0)
    if (list.rows.length <= 1) return answer
    const smaller = Math.max(1, Math.min(list.rows.length - 1, Math.floor((list.rows.length * budget) / size * 0.9)))
    answer = await read(smaller)
  }
  return answer
}

/** The page answer with `nextOffset` on its list block when rows remain beyond it. */
function withNextOffset(
  answer: unknown,
  list: { block: Record<string, unknown>; rows: unknown[] },
  shrunk: boolean,
): unknown {
  const offset = typeof list.block.offset === 'number' ? list.block.offset : 0
  const matched = [list.block.matched, list.block.total].find((n): n is number => typeof n === 'number')
  const next = offset + list.rows.length
  if (matched === undefined || next >= matched) return answer
  list.block.nextOffset = next
  if (shrunk) list.block.pageNote = `Page shortened to ${list.rows.length} rows to stay under the result cap; read on with offset ${next}.`
  return answer
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
    return withPageLinks(
      await lyriks.post('/api/evolution', {
        projectId: args.project_id,
        operations: args.operations,
        as_person: args.as_person === true,
      }),
    )
  } catch (err) {
    // A refused batch (422) or a stale read (409) is an answer, not a failure:
    // the platform names each operation and the reason, and the agent acts on
    // that rather than on a bare HTTP status.
    const refused = parseRefusal(err)
    if (refused) return withPageLinks(refused)
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
