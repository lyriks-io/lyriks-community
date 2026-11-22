// Behavior-authoring tools: the WRITE half of the unspa vocabulary, folded into
// the authenticated Lyriks MCP so a user never leaves it for the standalone,
// unauthenticated engine (Fix #1). Each op batch is proxied to the wizard app's
// POST /api/behavior/apply, which applies it through the platform's own engine
// (inheriting auth + the residue/merge semantics) and writes the shared kernel
// store — so depth authored here survives a later wizard re-save.

import type { LyriksClient } from '../lyriks-client.js'
import { codePlacesForRead } from './code-places.js'
import { withPageLinks } from './evolution.js'
import { RESULT_CAP, selectPaths, summarize } from '../util/shape.js'
import { disabledCounts, markerOf } from './disabled.js'

export interface ApplyBehaviorBatchArgs {
  project_id: string
  feature_id: string
  operations?: Record<string, unknown>[]
  dry_run?: boolean
  commit?: string
  verbose?: boolean
  expected_updated_at?: string
}

/**
 * Apply a batch of Unspaghettit ops to one feature. Mirrors the standalone
 * engine's `apply_batch`: lyriks returns `{ available, batch }` where
 * `batch.ok:false` is a REJECTED batch (read `batch.errors`) and a thrown lyriks
 * error (404/503) means the feature isn't in the project / the engine is down.
 *
 * A valid `dry_run` returns `batch.commitToken`; pass it back as `commit` (with no
 * `operations`) to save that exact validated batch without resending the ops
 * (Fix #8). Tokens are single-use and expire after 5 minutes.
 *
 * `expected_updated_at` is the feature `updatedAt` the batch was written against.
 * A newer engine refuses the batch when the feature moved since (several writers
 * on one feature); an older engine, or a platform that does not relay the field
 * yet, ignores it and applies the batch as before.
 */
export async function applyBehaviorBatchHandler(
  args: ApplyBehaviorBatchArgs,
  lyriks: LyriksClient,
): Promise<unknown> {
  return surfaceBatchFields(await lyriks.post('/api/behavior/apply', {
    projectId: args.project_id,
    featureId: args.feature_id,
    operations: args.operations ?? [],
    dryRun: args.dry_run === true,
    ...(args.commit ? { commit: args.commit } : {}),
    // Fix #6: opt into the per-issue verification report (lyriks relays it verbatim).
    ...(args.verbose === true ? { verbose: true } : {}),
    ...(args.expected_updated_at ? { expectedUpdatedAt: args.expected_updated_at } : {}),
  }))
}

const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0

/**
 * What a newer engine answers under `batch.raw` that a client reads first, in
 * the order it is surfaced, each held to the type the engine gives it:
 * - a refused overwrite: `conflict`, `currentUpdatedAt`, `changedSince` (the
 *   elements that moved since the version the batch was written against) and
 *   `changedSinceTotal`;
 * - a success: `previousUpdatedAt` and `updatedAt`, the version to send next,
 *   `scenarios: { scope, run, passed, failed[], truncated? }`, the scenarios of
 *   what the batch touched, and `relatedElsewhere`, what the batch touches in
 *   OTHER features;
 * - `created` and `renamed`: the ids the batch minted and the state paths it
 *   moved, in a dry run as in a commit.
 */
const RAW_FIELDS: ReadonlyArray<readonly [string, (v: unknown) => boolean]> = [
  ['conflict', (v) => typeof v === 'boolean'],
  ['currentUpdatedAt', isText],
  ['changedSince', Array.isArray],
  ['changedSinceTotal', (v) => typeof v === 'number'],
  ['previousUpdatedAt', isText],
  ['updatedAt', isText],
  // isRow is declared further down: named here, it would be read before it exists.
  ['scenarios', (v) => isRow(v)],
  ['relatedElsewhere', (v) => isRow(v) || Array.isArray(v)],
  // Every element the batch minted, ref or not (`{ op, kind, id, path?, key? }`,
  // `key` being its .unspa.json key), and every state path it renamed
  // (`{ from, to, ... }`): what an index is written from without reading the
  // whole feature back.
  ['created', Array.isArray],
  ['renamed', Array.isArray],
]

/**
 * The platform relays the engine answer under `batch.raw`, where a client does
 * not look (the platform's own apply-batch helper reads `batch.scenarios`). So
 * the fields above are copied onto `batch`, ahead of `raw`, which verbose:true
 * makes long; `raw` keeps them too. An older engine sends nothing: a field stays
 * absent, never invented, and one the platform sets itself is left alone.
 */
export function surfaceBatchFields(answer: unknown): unknown {
  if (!isRow(answer) || !isRow(answer.batch)) return answer
  const { raw, ...batch } = answer.batch
  if (!isRow(raw)) return answer
  const lifted = RAW_FIELDS.filter(([key, holds]) => batch[key] === undefined && holds(raw[key]))
  if (!lifted.length) return answer
  return { ...answer, batch: { ...batch, ...Object.fromEntries(lifted.map(([key]) => [key, raw[key]])), raw: withoutLongTwins(raw, batch, lifted.map(([key]) => key)) } }
}

/**
 * The lists that grow with the batch (one row per element minted or moved, one
 * ref per op) are MOVED out of `raw` rather than copied: carried twice, a
 * 128-op commit answered 25 KB and the gateway capped it, which the shipped
 * apply-batch helper then read as a failure. `refs` stays where the platform
 * put it and leaves `raw` when it says the same.
 */
const LONG_LISTS = new Set(['created', 'renamed'])

function withoutLongTwins(raw: Record<string, unknown>, batch: Record<string, unknown>, lifted: readonly string[]): Record<string, unknown> {
  const moved = lifted.filter((key) => LONG_LISTS.has(key))
  const sameRefs = 'refs' in raw && JSON.stringify(raw.refs) === JSON.stringify(batch.refs)
  if (!moved.length && !sameRefs) return raw
  const out = { ...raw }
  for (const key of moved) delete out[key]
  if (sameRefs) delete out.refs
  return out
}

export interface BehaviorContextArgs {
  project_id: string
  journey_id?: string
  step_id?: string
  screen_id?: string
  surface_id?: string
  action_id?: string
}

/**
 * The id bridge (Fix #2): resolve a wizard journey/step/screen id into the kernel
 * feature/surface/action ids apply_behavior_batch needs, plus a connectivity
 * snapshot. Proxies to the wizard app GET /api/behavior/context.
 */
export async function getBehaviorContextHandler(
  args: BehaviorContextArgs,
  lyriks: LyriksClient,
): Promise<unknown> {
  const q = new URLSearchParams({ projectId: args.project_id })
  if (args.journey_id) q.set('journeyId', args.journey_id)
  if (args.step_id) q.set('stepId', args.step_id)
  if (args.screen_id) q.set('screenId', args.screen_id)
  if (args.surface_id) q.set('surfaceId', args.surface_id)
  if (args.action_id) q.set('actionId', args.action_id)
  return lyriks.get(`/api/behavior/context?${q.toString()}`)
}

export interface ReadBehaviorFeatureArgs {
  project_id: string
  feature_id: string
  paths?: string[]
  summary?: boolean
  surface_id?: string
  action_id?: string
  index_keys?: boolean
  limit?: number
  offset?: number
}

export type Row = Record<string, unknown>

export const isRow = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v)
// The platform relays the engine snapshot untyped, so every field may be missing.
export const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.filter(isRow) : [])
const count = (v: unknown): number => (Array.isArray(v) ? v.length : 0)
const idName = (r: Row) => ({ id: r.id, name: r.name })

const FEATURE_COLLECTIONS = [
  'surfaces', 'acceptanceCriteria', 'featureInvariants', 'reachabilityGoals', 'events',
  'entities', 'personas', 'resources', 'valueSets', 'constants',
] as const

// The wrapper and the generic cap's own envelope need the rest.
const TOC_BUDGET = RESULT_CAP * 0.9

export function featureOf(result: unknown): Row | null {
  const snapshot = isRow(result) ? result.snapshot : undefined
  return isRow(snapshot) && isRow(snapshot.feature) ? snapshot.feature : null
}

/**
 * The table of contents of a feature: every id an agent needs to pick what to
 * read next, with counts where the content would be. The generic two-level
 * shape answered `feature: "object(15 keys)"`, which names nothing.
 */
export function featureToc(feature: Row): Row {
  const surfaces = rows(feature.surfaces).map((surface): Row => ({
    id: surface.id,
    name: surface.name,
    stateCount: count(surface.stateDefinitions),
    ruleCount: count(surface.rules),
    invariants: rows(surface.invariants).map(idName),
    actions: rows(surface.actions).map((action) => {
      const disabled = markerOf(action)
      return {
        id: action.id,
        name: action.name,
        rules: count(action.rules),
        effects: count(action.effects),
        scenarios: count(action.scenarios),
        parameters: count(action.parameters),
        ...(disabled ? { disabled } : {}),
      }
    }),
  }))
  // A disabled element is still in the tree, readable; it is counted apart,
  // so a reader tells what is in force from what is put aside.
  const disabled = disabledCounts(feature)
  const featureMarker = markerOf(feature)
  const toc: Row = {
    featureId: feature.id,
    name: feature.name,
    updatedAt: feature.updatedAt,
    counts: Object.fromEntries(FEATURE_COLLECTIONS.map((key) => [key, count(feature[key])])),
    acceptanceCriteria: rows(feature.acceptanceCriteria).map((c) => ({ id: c.id, title: c.title })),
    ...(featureMarker ? { disabledFeature: featureMarker } : {}),
    ...(disabled.total > 0 ? { disabled } : {}),
    surfaces,
    next: 'surface_id or action_id returns one element whole; paths reads an exact branch.',
  }
  // A huge feature: give up the action rows of the largest surfaces first, and
  // say so, rather than let the generic cap flatten the whole table.
  const trimmed: unknown[] = []
  for (const surface of [...surfaces].sort((a, b) => count(b.actions) - count(a.actions))) {
    if (JSON.stringify(toc).length <= TOC_BUDGET || !count(surface.actions)) break
    surface.actionCount = count(surface.actions)
    delete surface.actions
    trimmed.push(surface.id)
  }
  if (trimmed.length) {
    toc.actionsOmitted = {
      surfaceIds: trimmed,
      reason: 'The table of contents exceeded the response cap, so the action rows of the largest surfaces were dropped. Read each of them with surface_id.',
    }
  }
  return toc
}

/** Surfaces and their actions by id and name: what an unknown id is answered with. */
export const availableIds = (feature: Row, withActions: boolean) =>
  rows(feature.surfaces).map((surface) => ({
    ...idName(surface),
    ...(withActions ? { actions: rows(surface.actions).map(idName) } : {}),
  }))

/**
 * The requirement sentences of the elements read (their rules and statements in
 * EARS, their scenarios in Given/When/Then), picked from the `statements` the
 * platform derives for the whole feature. Absent when the platform sends none.
 */
function statementsOf(elements: Row[], statements: unknown): { statements?: Record<string, string> } {
  if (!statements || typeof statements !== 'object') return {}
  const all = statements as Record<string, unknown>
  const picked: Record<string, string> = {}
  const take = (kind: string, list: unknown) => {
    for (const item of rows(list)) {
      const key = `${kind}:${String(item.id)}`
      if (typeof all[key] === 'string') picked[key] = all[key] as string
    }
  }
  for (const element of elements) {
    take('rule', element.rules)
    take('invariant', element.invariants)
    take('scenario', element.scenarios)
  }
  return Object.keys(picked).length > 0 ? { statements: picked } : {}
}

/**
 * One surface or one action, whole, selected by its stable id. A positional
 * path (`snapshot.feature.surfaces.5`) points at another element as soon as a
 * concurrent writer adds a surface; an id does not.
 */
export function selectFeatureElement(
  feature: Row,
  args: { surface_id?: string; action_id?: string },
  statements?: unknown,
): Row {
  const featureId = feature.id
  if (args.action_id) {
    for (const surface of rows(feature.surfaces)) {
      const action = rows(surface.actions).find((a) => a.id === args.action_id)
      if (action) return { found: true, featureId, surfaceId: surface.id, surfaceName: surface.name, action, ...statementsOf([action], statements) }
    }
    return { found: false, featureId, action_id: args.action_id, reason: 'No action of this feature has this id.', available: availableIds(feature, true) }
  }
  const surface = rows(feature.surfaces).find((s) => s.id === args.surface_id)
  if (surface) {
    return { found: true, featureId, surfaceId: surface.id, surfaceName: surface.name, surface, ...statementsOf([surface, ...rows(surface.actions)], statements) }
  }
  return { found: false, featureId, surface_id: args.surface_id, reason: 'No surface of this feature has this id.', available: availableIds(feature, false) }
}

/**
 * The implementation-index keys that belong to a feature. Index entries usually
 * carry no featureId, so a repository can only slice its `.unspa.json` by
 * feature from the spec side. The grammar and the order are the engine's own
 * (buildKeyOwners in unspaghettit mcp-server/tools/implementationStatus.ts, the
 * universe its orphan check validates against): a key spelled any other way
 * would come back as an orphan. A state path or an event name several features
 * declare is one key in every one of them.
 */
export function featureIndexKeys(feature: Row): string[] {
  const keys = new Set<string>()
  const own = (type: string, id: unknown) => {
    if ((typeof id === 'string' && id) || typeof id === 'number') keys.add(`${type}:${id}`)
  }
  const each = (list: unknown, type: string, field = 'id') => rows(list).forEach((r) => own(type, r[field]))
  each(feature.featureInvariants, 'invariant')
  each(feature.events, 'event', 'name')
  each(feature.entities, 'entity')
  for (const surface of rows(feature.surfaces)) {
    own('surface', surface.id)
    each(surface.stateDefinitions, 'state', 'path')
    each(surface.rules, 'surface_rule')
    each(surface.invariants, 'surface_invariant')
    each(surface.transitions, 'transition')
    for (const action of rows(surface.actions)) {
      own('action', action.id)
      // Emitted events are bare names; declared or not, they are keyed the same.
      for (const event of Array.isArray(action.emittedEvents) ? action.emittedEvents : []) own('event', isRow(event) ? event.name : event)
      each(action.rules, 'rule')
      each(action.invariants, 'invariant')
      each(action.transitions, 'transition')
    }
  }
  // Not in buildKeyOwners yet: a newer engine resolves acceptance criteria, an
  // older one lists these keys as orphans. Last, so the engine's order stays whole.
  each(feature.acceptanceCriteria, 'criterion')
  return [...keys]
}

/**
 * `{ featureId, updatedAt, total, keys }`. A feature of 30 actions holds 100 to
 * 300 short keys, far under the cap; a huge one is paged the way drift is
 * (offset, returned, nextOffset), so the generic cap never samples the list.
 */
export function featureIndexKeysAnswer(feature: Row, args: Pick<ReadBehaviorFeatureArgs, 'limit' | 'offset'>): Row {
  const all = featureIndexKeys(feature)
  const offset = Number.isSafeInteger(args.offset) ? Math.max(0, args.offset!) : 0
  const limit = Number.isSafeInteger(args.limit) ? Math.max(1, args.limit!) : all.length
  const head = { featureId: feature.id, updatedAt: feature.updatedAt, total: all.length }
  const keys: string[] = []
  let room = RESULT_CAP - JSON.stringify(head).length - 256
  for (const key of all.slice(offset, offset + limit)) {
    room -= JSON.stringify(key).length + 1
    // Always one key, so a page makes progress even under a tiny cap.
    if (room < 0 && keys.length) break
    keys.push(key)
  }
  const next = offset + keys.length
  const whole = offset === 0 && keys.length === all.length
  return { ...head, ...(whole ? {} : { offset, returned: keys.length, nextOffset: next < all.length ? next : null }), keys }
}

/** Read the canonical feature tree, retaining stable ids for follow-up batches. */
export async function readBehaviorFeatureHandler(
  args: ReadBehaviorFeatureArgs,
  lyriks: LyriksClient,
): Promise<unknown> {
  const q = new URLSearchParams({ projectId: args.project_id, featureId: args.feature_id })
  const result = await lyriks.get(`/api/behavior/feature?${q.toString()}`) as Record<string, unknown>
  // Every form of the read says which language the spec is written in.
  const language = result.specLanguage !== undefined ? { specLanguage: result.specLanguage } : {}
  if (args.paths?.length) {
    return {
      feature_id: args.feature_id,
      ...selectPaths(result, args.paths),
      ...language,
    }
  }
  const feature = featureOf(result)
  if (args.index_keys) {
    if (!feature) return { found: false, featureId: args.feature_id, reason: 'The platform answer carries no snapshot.feature.', answer: summarize(result) }
    return { ...featureIndexKeysAnswer(feature, args), ...language }
  }
  if (args.surface_id || args.action_id) {
    if (!feature) return { found: false, featureId: args.feature_id, reason: 'The platform answer carries no snapshot.feature.', answer: summarize(result) }
    const selected = selectFeatureElement(feature, args, result.statements)
    // The read ends where the client's code tools start (criterion 97ef2d0d).
    const code = await codePlacesForRead(lyriks, args, selected)
    return { ...selected, ...(code ? { code } : {}), ...language }
  }
  if (!args.summary) {
    // Shortened by the cap, the snapshot would cost a whole answer and still have
    // to be read again by id (criterion 250ecf3d).
    const fullReadChars = JSON.stringify(result).length
    if (!feature || fullReadChars <= RESULT_CAP) return result
    return { ...featureToc(feature), fullReadChars, ...language }
  }
  return feature ? { ...featureToc(feature), ...language } : summarize(result)
}

export interface ScoreBehaviorFeatureArgs {
  project_id: string
  feature_id: string
  include_issues?: boolean
  surface_id?: string
  area?: string
  severity?: 'critical' | 'recommended'
}

/** Return maturity confidence and the exact issues an author can fix next. */
export async function scoreBehaviorFeatureHandler(
  args: ScoreBehaviorFeatureArgs,
  lyriks: LyriksClient,
): Promise<unknown> {
  const q = new URLSearchParams({
    projectId: args.project_id,
    featureId: args.feature_id,
    includeIssues: String(args.include_issues !== false),
  })
  if (args.surface_id) q.set('surfaceId', args.surface_id)
  if (args.area) q.set('area', args.area)
  if (args.severity) q.set('severity', args.severity)
  return lyriks.get(`/api/behavior/score?${q.toString()}`)
}

export async function assessBehaviorFeatureHandler(
  args: { project_id: string; feature_id: string },
  lyriks: LyriksClient,
): Promise<unknown> {
  const q = new URLSearchParams({ projectId: args.project_id, featureId: args.feature_id })
  return lyriks.get(`/api/features/behavior?${q.toString()}`)
}

export interface SimulateBehaviorArgs {
  project_id: string
  feature_id: string
  steps?: Record<string, unknown>[]
  operations?: Record<string, unknown>[]
  run_scenarios?: boolean
  model_check?: boolean | { max_depth?: number; max_states?: number }
  snapshot?: Record<string, unknown>
  persona_id?: string
  stop_on_blocked?: boolean
  /** Ids of elements disabled for this call only, in memory: nothing is saved. */
  disable?: string[]
}

/**
 * Walk a feature step by step through the platform's engine, saving nothing.
 * The platform resolves a draft id (`draft:…`) to what the change would leave:
 * the feature it amends, or an empty feature for an addition.
 */
export async function simulateBehaviorHandler(
  args: SimulateBehaviorArgs,
  lyriks: LyriksClient,
): Promise<unknown> {
  return lyriks.post('/api/behavior/simulate', {
    projectId: args.project_id,
    featureId: args.feature_id,
    ...(args.steps && args.steps.length > 0 ? { steps: args.steps } : {}),
    ...(args.run_scenarios === true ? { runScenarios: true } : {}),
    ...(args.model_check
      ? {
          modelCheck:
            typeof args.model_check === 'object'
              ? {
                  ...(args.model_check.max_depth !== undefined ? { maxDepth: args.model_check.max_depth } : {}),
                  ...(args.model_check.max_states !== undefined ? { maxStates: args.model_check.max_states } : {}),
                }
              : true,
        }
      : {}),
    ...(args.operations && args.operations.length > 0 ? { operations: args.operations } : {}),
    ...(args.snapshot ? { snapshot: args.snapshot } : {}),
    ...(args.persona_id ? { personaId: args.persona_id } : {}),
    ...(args.stop_on_blocked === true ? { stopOnBlocked: true } : {}),
    ...(args.disable && args.disable.length > 0 ? { disable: args.disable } : {}),
  })
}

/**
 * What a change would do to a feature, saving nothing and without a language
 * model: the platform's solver proves the feature before and after, runs its
 * scenarios on both, and answers the difference. A draft id (`draft:…`) is
 * compared as its behaviour model would leave the feature.
 */
export async function whatIfHandler(
  args: { project_id: string; feature_id: string; operations?: Record<string, unknown>[]; max_steps?: number },
  lyriks: LyriksClient,
): Promise<unknown> {
  return lyriks.post('/api/behavior/what-if', {
    projectId: args.project_id,
    featureId: args.feature_id,
    ...(args.operations && args.operations.length > 0 ? { operations: args.operations } : {}),
    ...(args.max_steps !== undefined ? { maxSteps: args.max_steps } : {}),
  })
}

/**
 * The oracle's verdict on every rule that spans the project (its project
 * invariants, the data model's among them). Each rule's `href` becomes the
 * absolute link a person opens on it.
 */
export async function proveProjectRulesHandler(
  args: { project_id: string; invariant_ids?: string[]; max_steps?: number },
  lyriks: LyriksClient,
): Promise<unknown> {
  const query = new URLSearchParams({ projectId: args.project_id })
  for (const id of args.invariant_ids ?? []) query.append('invariantId', id)
  if (args.max_steps !== undefined) query.set('maxSteps', String(args.max_steps))
  return withPageLinks(await lyriks.get(`/api/behavior/project/rules?${query}`))
}

/** What a change to the project's rules would do, nothing saved; links made whole. */
export async function whatIfProjectHandler(
  args: { project_id: string; operations: Record<string, unknown>[]; max_steps?: number },
  lyriks: LyriksClient,
): Promise<unknown> {
  return withPageLinks(
    await lyriks.post('/api/behavior/project/what-if', {
      projectId: args.project_id,
      operations: args.operations,
      ...(args.max_steps !== undefined ? { maxSteps: args.max_steps } : {}),
    }),
  )
}

/** The data model's fields with the behaviour states that carry them, or could. */
export async function getDataLinksHandler(
  args: { project_id: string; table?: string; unlinked_only?: boolean; offset?: number; limit?: number },
  lyriks: LyriksClient,
): Promise<unknown> {
  const query = new URLSearchParams({ projectId: args.project_id })
  if (args.table) query.set('table', args.table)
  if (args.unlinked_only) query.set('unlinked', '1')
  if (args.offset !== undefined) query.set('offset', String(args.offset))
  if (args.limit !== undefined) query.set('limit', String(args.limit))
  return lyriks.get(`/api/draft/data/links?${query}`)
}

/** Link many data fields to their states (and name existence states), by table and field names. */
export async function linkDataFieldsHandler(
  args: {
    project_id: string
    links?: { table: string; field: string; state_path: string | null; also?: boolean }[]
    existence?: { table: string; state_path: string | null }[]
  },
  lyriks: LyriksClient,
): Promise<unknown> {
  return lyriks.post('/api/draft/data/links', {
    projectId: args.project_id,
    links: (args.links ?? []).map((l) => ({ table: l.table, field: l.field, statePath: l.state_path, ...(l.also ? { also: true } : {}) })),
    existence: (args.existence ?? []).map((e) => ({ table: e.table, statePath: e.state_path })),
  })
}

/** Author what holds across a project's features, in one atomic engine batch. */
export async function applyProjectBehaviorBatchHandler(
  args: { project_id: string; operations: Record<string, unknown>[]; dry_run?: boolean },
  lyriks: LyriksClient,
): Promise<unknown> {
  return lyriks.post('/api/behavior/project', {
    projectId: args.project_id,
    operations: args.operations,
    ...(args.dry_run === true ? { dryRun: true } : {}),
  })
}

/** What the engine holds for a project beyond its features. */
export async function readProjectBehaviorHandler(
  args: { project_id: string },
  lyriks: LyriksClient,
): Promise<unknown> {
  return lyriks.get(`/api/behavior/project?${new URLSearchParams({ projectId: args.project_id })}`)
}

/** Every place a feature reads or writes a state path. */
export async function findStateReferencesHandler(
  args: { project_id: string; feature_id: string; state_path: string },
  lyriks: LyriksClient,
): Promise<unknown> {
  const q = new URLSearchParams({
    projectId: args.project_id,
    featureId: args.feature_id,
    statePath: args.state_path,
  })
  return lyriks.get(`/api/behavior/references?${q}`)
}

/** The TypeScript module mirroring a feature, as source. */
export async function generateBehaviorTypesHandler(
  args: { project_id: string; feature_id: string },
  lyriks: LyriksClient,
): Promise<unknown> {
  const q = new URLSearchParams({ projectId: args.project_id, featureId: args.feature_id })
  return lyriks.get(`/api/behavior/types?${q}`)
}

/**
 * Search the running engine's operation reference. Querying keeps responses
 * bounded while making every operation discoverable through this one MCP.
 */
export async function getBehaviorOperationsHandler(
  args: { project_id?: string; query?: string; offset?: number; max_chars?: number },
  lyriks: LyriksClient,
): Promise<unknown> {
  // The vocabulary is the engine's own and is the same for every project, so a
  // caller who has no project yet can still read it: the id is forwarded only
  // when there is one. Asking for a project before the first project exists was
  // a door with nothing behind it.
  const q = new URLSearchParams(args.project_id ? { projectId: args.project_id } : {})
  const result = await lyriks.get(`/api/behavior/operations?${q.toString()}`) as {
    reference?: unknown
    patterns?: Array<{ id: string; title: string; keywords: string[]; steps: string[]; verificationBoundary: string }>
  }
  const reference = typeof result.reference === 'string' ? result.reference : ''
  const query = args.query?.trim().toLowerCase()
  if (!query) {
    const headings = reference.split('\n').filter((line) => /^#{1,3}\s/.test(line))
    return {
      headings,
      patterns: (result.patterns ?? []).map(({ id, title }) => ({ id, title })),
      hint: 'Call again with query set to an operation name or concept for its exact schema and guidance.',
    }
  }
  const lines = reference.split('\n')
  const terms = [...new Set(query.split(/[\s,;]+/).filter(Boolean))]
  const guidance = (result.patterns ?? []).filter(pattern => terms.some(term =>
    pattern.id.includes(term) || pattern.keywords.some(keyword => keyword.includes(term))
  ))
  const hits = lines.flatMap((line, index) => terms.some(term => line.toLowerCase().includes(term)) ? [index] : [])
  const selected = new Set<number>()
  for (const hit of hits) {
    for (let index = Math.max(0, hit - 3); index <= Math.min(lines.length - 1, hit + 10); index += 1) {
      selected.add(index)
    }
  }
  const excerpt = [...selected].sort((a, b) => a - b).map((index) => lines[index]).join('\n')
  const offset = Number.isSafeInteger(args.offset) ? Math.max(0, args.offset!) : 0
  const size = Number.isSafeInteger(args.max_chars) ? Math.max(1, Math.min(16000, args.max_chars!)) : 12000
  let page = excerpt.slice(offset, offset + size)
  // JSON escaping counts too: avoid the universal cap replacing the actual
  // schema with an unusable shape. The cursor follows the returned characters.
  while (JSON.stringify({ reference: page, guidance }).length > 18000 && page.length > 1)
    page = page.slice(0, Math.max(1, Math.floor(page.length * 0.8)))
  return {
    query: args.query,
    terms,
    guidance,
    unmatchedTerms: terms.filter(term => !reference.toLowerCase().includes(term) && !guidance.some(pattern => pattern.id.includes(term) || pattern.keywords.some(keyword => keyword.includes(term)))),
    matches: hits.length,
    reference: page,
    totalChars: excerpt.length,
    offset,
    nextOffset: offset + page.length < excerpt.length ? offset + page.length : null,
    hint: hits.length || guidance.length ? 'Engine schema excerpts and domain-neutral authoring guidance. Continue with the same query and offset:nextOffset until null; guidance is not a schema or proof of runtime correctness.' : 'No matching terms. Omit query to list headings, then search an operation name or concept.',
  }
}
