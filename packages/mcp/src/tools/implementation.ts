// The spec↔code map: which spec element lives where in the codebase, how much
// of the spec is implemented, and which entries were audited against a spec
// that has since moved.
//
// The map itself is `.unspa.json` in YOUR checkout — the platform never stores a
// copy and never reads one. So `seed_implementation_index` hands you entries to
// write, and every reading tool takes the index back as an argument. One index,
// in the repo, versioned with the code it describes.

import type { LyriksClient } from '../lyriks-client.js'
import { RESULT_CAP } from '../util/shape.js'

type Row = Record<string, unknown>

const isRow = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v)
// Long lists are cut here; their `total` keeps the real length.
const LIST_HEAD = 50

export interface SeedIndexArgs {
  project_id: string
  feature_id: string
  overwrite?: boolean
}

/**
 * Turn a finalized analysis into index entries. Returns them; writes nothing.
 * Every code span becomes `{file, line, signature}` with a stamped specVersion,
 * which is what makes `get_implementation_drift` meaningful afterwards.
 */
export async function seedIndexHandler(args: SeedIndexArgs, lyriks: LyriksClient): Promise<unknown> {
  const q = new URLSearchParams({ projectId: args.project_id, featureId: args.feature_id })
  if (args.overwrite === true) q.set('overwrite', 'true')
  return lyriks.get(`/api/behavior/implementation/index?${q.toString()}`)
}

export interface SyncIndexArgs {
  project_id: string
  index: Record<string, unknown>
  verbose?: boolean
}

/**
 * What each counter of a sync answer means. Agents read `skipped` as refused
 * entries and a zero `stale` as "the code still matches the spec"; neither is
 * what the engine counts, so the answer carries the definitions with it.
 */
export const SYNC_SEMANTICS = {
  ok: 'true only when every report succeeded, no orphan key was found and something actually landed. An index carrying only acceptance criteria posts no action or surface report, and that counts as landing: read `criteria.indexed` and an empty `orphans`.',
  synced: 'Implementation reports written: one per action and one per surface that has its own entry in the index you sent.',
  successes: 'Reports the engine accepted.',
  failures: 'Reports the engine refused; their rows are in failedAcks.',
  skipped: 'Actions and surfaces of the spec with NO entry of their own in the index you sent. They are left untouched: their previous reports stay.',
  children: 'Child keys (rule, state, invariant, transition, event) are folded into the report of their parent action or surface and are not counted separately.',
  stale: 'About code LOCATION only: entries whose signature is no longer found at their line. NOT evaluated when the index is sent inline, which is always the case through this gateway, so zero here is not a clean bill. Run get_implementation_drift for spec drift.',
  healed: 'About code LOCATION only: entries whose signature was found again at another line and re-pointed. NOT evaluated when the index is sent inline, which is always the case through this gateway.',
  shared: 'Keys that SEVERAL features declare (a state path is not unique across features): the index holds one entry per key, so its file and line describe one of them and the others resolve to that same location. Reported, never fatal, and it does not affect ok.',
  orphans: 'Index keys that match no spec entity (typo, renamed or removed entity, or wrong key format). ok is false while any remain.',
} as const

/** Keep the head of a `{ total, entries }` block; `total` still says how many there are. */
function headEntries(block: unknown): unknown {
  if (!isRow(block) || !Array.isArray(block.entries) || block.entries.length <= LIST_HEAD) return block
  return { ...block, total: block.total ?? block.entries.length, entries: block.entries.slice(0, LIST_HEAD), entriesReturned: LIST_HEAD }
}

/**
 * A sync answer an agent can read. The engine acknowledges every action and
 * surface (1,146 rows of "fine" on a large project), which buried the counters
 * under the cap: only the refused rows are kept unless `verbose` asks for all.
 * An answer without the engine's counters (a refusal) passes through unchanged.
 *
 * A newer engine also answers `criteria` (every acceptance criterion with what
 * verifies it and how that last went) and `verified` (the actions PROVEN against
 * the code, apart from located). Both pass through, `criteria.entries` cut to
 * its head like the other lists; an older engine sends neither and neither is
 * invented.
 */
export function shapeSyncAnswer(answer: unknown, verbose = false, sentKeys?: readonly string[]): unknown {
  if (!isRow(answer) || !(Array.isArray(answer.acks) || typeof answer.synced === 'number')) return answer
  const { acks, orphans, shared, criteria, featureIds, ...rest } = answer
  const rows = Array.isArray(acks) ? acks : []
  const failed = rows.filter((ack) => isRow(ack) && ack.ok === false)
  const sent = sentKeys ? aboutSentKeys(sentKeys, criteria, orphans) : undefined
  return {
    // What the keys you sent came to, first: eight keys sent used to come back
    // under the project's ninety feature ids and fifty unrelated criteria.
    ...(sent ? { sent } : {}),
    ...rest,
    ...(Array.isArray(featureIds)
      ? verbose
        ? { featureIds }
        : { projectFeatures: featureIds.length }
      : {}),
    ...(orphans !== undefined ? { orphans: headEntries(orphans) } : {}),
    ...(shared !== undefined ? { shared: headEntries(shared) } : {}),
    ...(criteria !== undefined
      ? { criteria: verbose || !sentKeys?.some((k) => k.startsWith('criterion:')) ? headEntries(criteria) : criteriaOfSent(criteria, sentKeys) }
      : {}),
    ...(verbose
      ? { acks: rows }
      : { failedAcks: failed.slice(0, LIST_HEAD), ...(failed.length > LIST_HEAD ? { failedAcksReturned: LIST_HEAD } : {}) }),
    semantics: SYNC_SEMANTICS,
  }
}

/**
 * The part of a sync answer about the keys the caller sent: how many, how many
 * the spec did not recognise, and for the `criterion:` keys among them how
 * many are verified, failing or only recorded. The engine's own counters stay
 * below it and are about the whole project.
 */
function aboutSentKeys(keys: readonly string[], criteria: unknown, orphans: unknown): Row {
  const sent = new Set(keys)
  const orphanRows = isRow(orphans) && Array.isArray(orphans.entries) ? orphans.entries : []
  const orphaned = orphanRows.filter((o) => isRow(o) && typeof o.key === 'string' && sent.has(o.key)).length
  const entries = isRow(criteria) && Array.isArray(criteria.entries) ? criteria.entries.filter(isRow) : []
  const mine = entries.filter((e) => typeof e.key === 'string' && sent.has(e.key))
  const result = (e: Row) => (isRow(e.verification) && isRow(e.verification.lastResult) ? e.verification.lastResult.passed : undefined)
  const criterionKeys = keys.filter((k) => k.startsWith('criterion:')).length
  return {
    keys: keys.length,
    orphans: orphaned,
    ...(criterionKeys > 0
      ? {
          criteria: {
            sent: criterionKeys,
            verified: mine.filter((e) => result(e) === true).length,
            failing: mine.filter((e) => result(e) === false).length,
            unverified: mine.filter((e) => e.indexed === true && result(e) === undefined).length,
            howToVerify:
              'A criterion reads verified when its index entry carries verification.lastResult.passed:true (what ran, when). Record the test that proves it there, then sync again.',
          },
        }
      : {}),
  }
}

/** The criteria block with its rows cut to the criteria the caller sent; the project counters stay. */
function criteriaOfSent(criteria: unknown, keys: readonly string[]): unknown {
  if (!isRow(criteria) || !Array.isArray(criteria.entries)) return criteria
  const sent = new Set(keys)
  const entries = criteria.entries.filter((e) => isRow(e) && typeof e.key === 'string' && sent.has(e.key))
  return { ...criteria, entries: entries.slice(0, LIST_HEAD), entriesScope: 'the criterion keys you sent; verbose:true lists the project' }
}

/** Push coverage for a whole project from the index you hold. */
export async function syncIndexHandler(args: SyncIndexArgs, lyriks: LyriksClient): Promise<unknown> {
  const answer = await lyriks.post('/api/behavior/implementation/index', {
    projectId: args.project_id,
    index: args.index,
  })
  return shapeSyncAnswer(answer, args.verbose === true, Object.keys(args.index ?? {}))
}

export interface FoundEntityArg {
  entity_type: string
  entity_id: string
  locations: Array<{ file: string; line?: number; snippet?: string }>
}

export interface ReportStatusArgs {
  project_id: string
  feature_id: string
  action_id?: string
  surface_id?: string
  found_entities?: FoundEntityArg[]
  entries?: Array<{
    action_id?: string
    surface_id?: string
    found_entities: FoundEntityArg[]
  }>
}

const toFoundEntities = (entities: FoundEntityArg[]) =>
  entities.map((e) => ({
    entityType: e.entity_type,
    entityId: e.entity_id,
    locations: e.locations,
  }))

/** Report where spec entities live in code — one scope, or many via `entries`. */
export async function reportStatusHandler(args: ReportStatusArgs, lyriks: LyriksClient): Promise<unknown> {
  return lyriks.post('/api/behavior/implementation/status', {
    projectId: args.project_id,
    featureId: args.feature_id,
    ...(args.entries
      ? {
          entries: args.entries.map((entry) => ({
            ...(entry.action_id ? { actionId: entry.action_id } : {}),
            ...(entry.surface_id ? { surfaceId: entry.surface_id } : {}),
            foundEntities: toFoundEntities(entry.found_entities),
          })),
        }
      : {
          ...(args.action_id ? { actionId: args.action_id } : {}),
          ...(args.surface_id ? { surfaceId: args.surface_id } : {}),
          foundEntities: toFoundEntities(args.found_entities ?? []),
        }),
  })
}

export interface GetStatusArgs {
  project_id: string
  feature_id: string
  surface_id?: string
  action_id?: string
}

export async function getStatusHandler(args: GetStatusArgs, lyriks: LyriksClient): Promise<unknown> {
  const q = new URLSearchParams({ projectId: args.project_id, featureId: args.feature_id })
  if (args.surface_id) q.set('surfaceId', args.surface_id)
  if (args.action_id) q.set('actionId', args.action_id)
  return lyriks.get(`/api/behavior/implementation/status?${q.toString()}`)
}

export interface GapsArgs {
  project_id: string
  index: Record<string, unknown>
  feature_id?: string
  entries?: boolean
  filters?: Record<string, unknown>
}

/** What the spec declares that the index has not located in code yet. */
export async function gapsHandler(args: GapsArgs, lyriks: LyriksClient): Promise<unknown> {
  return lyriks.post('/api/behavior/implementation/gaps', {
    projectId: args.project_id,
    index: args.index,
    ...(args.feature_id ? { featureId: args.feature_id } : {}),
    ...(args.entries === true ? { entries: true } : {}),
    ...(args.filters ? { filters: args.filters } : {}),
  })
}

export type DriftBucket = 'stale' | 'unversioned' | 'orphans'

export interface DriftArgs {
  project_id: string
  index: Record<string, unknown>
  feature_id?: string
  limit?: number
  offset?: number
  bucket?: DriftBucket
}

const DRIFT_PAGE = { default: 50, max: 200 } as const

/** Occurrences per key, most frequent first, cut to the head with the rest counted. */
function tally(keys: string[]): { top: Record<string, number>; more: number } {
  const counts = new Map<string, number>()
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1)
  const sorted = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return { top: Object.fromEntries(sorted.slice(0, LIST_HEAD)), more: Math.max(0, sorted.length - LIST_HEAD) }
}

/**
 * A drift answer an agent can act on. The platform relays every row (1.4 MB on
 * a large project), which the cap reduced to `stale: array(4973)`: nothing to
 * plan from. So: the totals and where the drift concentrates first, then ONE
 * bucket, paged, each stale row carrying the file and line the caller's own
 * index maps it to. The page is sized under the response cap so the generic
 * cap never samples it, which would open holes in the paging. Any other field
 * of the platform answer passes through; an answer that is not a drift report
 * (a refusal, an unavailable engine) is returned unchanged.
 */
export function shapeDriftAnswer(answer: unknown, args: Pick<DriftArgs, 'index' | 'limit' | 'offset' | 'bucket'>): unknown {
  if (!isRow(answer) || answer.ok === false || answer.available === false) return answer
  if (![answer.stale, answer.unversioned, answer.orphans].some(Array.isArray)) return answer
  const { stale: staleRaw, unversioned: unversionedRaw, orphans: orphansRaw, summary: engineSummary, ...rest } = answer
  const index = isRow(args.index) ? args.index : {}
  const located = (key: unknown): Row => {
    const entry = typeof key === 'string' && Object.hasOwn(index, key) ? index[key] : undefined
    if (!isRow(entry)) return {}
    return { ...(entry.file !== undefined ? { file: entry.file } : {}), ...(entry.line !== undefined ? { line: entry.line } : {}) }
  }
  const stale = (Array.isArray(staleRaw) ? staleRaw : []).map((row) => (isRow(row) ? { ...row, ...located(row.key) } : row))
  const buckets: Record<DriftBucket, unknown[]> = {
    stale,
    unversioned: Array.isArray(unversionedRaw) ? unversionedRaw : [],
    orphans: Array.isArray(orphansRaw) ? orphansRaw : [],
  }
  const staleRows = stale.filter(isRow)
  const text = (rows: Row[], field: string) => rows.map((row) => row[field]).filter((v): v is string => typeof v === 'string')
  const byFeature = tally(text(staleRows, 'featureId'))
  const byFile = tally(text(staleRows, 'file'))
  const head = {
    summary: {
      checked: rest.checked,
      stale: buckets.stale.length,
      unversioned: buckets.unversioned.length,
      orphans: buckets.orphans.length,
      staleByScope: tally(text(staleRows, 'scope')).top,
      staleByFeature: byFeature.top,
      moreFeatures: byFeature.more,
      staleByFile: byFile.top,
      moreFiles: byFile.more,
    },
    ...rest,
    ...(engineSummary !== undefined ? { engineSummary } : {}),
  }

  const bucket: DriftBucket = args.bucket ?? 'stale'
  const all = buckets[bucket]
  const offset = Number.isSafeInteger(args.offset) ? Math.max(0, args.offset!) : 0
  const limit = Number.isSafeInteger(args.limit) ? Math.max(1, Math.min(DRIFT_PAGE.max, args.limit!)) : DRIFT_PAGE.default
  const rows: unknown[] = []
  let room = RESULT_CAP - JSON.stringify(head).length - 256
  for (const row of all.slice(offset, offset + limit)) {
    room -= JSON.stringify(row).length + 1
    // Always one row, so a page makes progress even under a tiny cap.
    if (room < 0 && rows.length) break
    rows.push(row)
  }
  const next = offset + rows.length
  return { ...head, bucket, total: all.length, offset, returned: rows.length, nextOffset: next < all.length ? next : null, rows }
}

/** Entries audited against an older spec than the one now in the kernel. */
export async function driftHandler(args: DriftArgs, lyriks: LyriksClient): Promise<unknown> {
  const answer = await lyriks.post('/api/behavior/implementation/drift', {
    projectId: args.project_id,
    index: args.index,
    ...(args.feature_id ? { featureId: args.feature_id } : {}),
  })
  return shapeDriftAnswer(answer, args)
}
