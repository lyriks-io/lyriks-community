// Section tools: read/write every section of a Lyriks project so the MCP can do
// everything a user can do in the UI (and stay in sync — same store).
//
// Writes go through the wizard app's existing per-section PUT /api/draft/* endpoints, which
// already carry the correct sync side-effects (behavior/back/unspa). Reads go
// through the generic GET /api/sections. Section documents are passed through
// whole and validated server-side by the wizard app, so this surface auto-adapts when a
// section's draft shape changes.
//
// Section keys are WIRE ids, not UI labels: several no longer name anything the
// user reads (`rules` is a Features tab). `describe_section` returns the mapping
// as `uiLocation` — quote THAT to a user, never the key.

import type { LyriksClient } from '../lyriks-client.js'
import { getPath, selectPaths, summarize } from '../util/shape.js'
import { dedupeCoherenceIssues } from '../util/advisory-dedupe.js'
import { INCREMENTAL_OPS, validateSectionPatch, type IncrementalOp } from '../util/validate-section-patch.js'

/** Section key -> lyriks write endpoint. */
const WRITE_PATHS = {
  scope:          '/api/draft/scope',
  foundation:     '/api/draft/foundation',
  users:          '/api/draft/users',
  features:       '/api/draft/features',
  experience:     '/api/draft/experience',
  rules:          '/api/draft/rules',
  data:           '/api/draft/data',
  architecture:   '/api/draft/architecture',
  coherence:      '/api/draft/coherence',
  glossary:       '/api/draft/glossary',
  approvals:      '/api/draft/approvals',
  baselines:      '/api/draft/baselines',
  // The project evidence register. Every other section cites it by stable id
  // (`sourceIds`), so an author that cannot write here cannot source anything.
  documents:      '/api/draft/documents',
  // The Evolution dossiers. Readable here; WRITTEN only through the typed
  // lifecycle tools (get_evolution / apply_evolution_batch), which apply every
  // guard of the lifecycle server-side. A raw section write is refused below.
  evolution:      '/api/draft/evolution',
} as const

export type Section = keyof typeof WRITE_PATHS
/** What a raw section write may target: Evolution is driven by its typed tools. */
export const SECTIONS = Object.keys(WRITE_PATHS).filter((section) => section !== 'evolution') as [Section, ...Section[]]
/**
 * What a READ may target, Evolution included. Describing and reading it is
 * legitimate (the completion ledger names it, and its shape is documented like
 * every other section); only writing it raw is refused. Keeping `evolution` out
 * of this list is what made `describe_section("evolution")` answer with an
 * enumeration of thirteen sections that did not contain the one being asked for.
 */
export const READABLE_SECTIONS = Object.keys(WRITE_PATHS) as [Section, ...Section[]]

export async function listProjectsHandler(_args: unknown, lyriks: LyriksClient): Promise<unknown> {
  return lyriks.get('/api/projects')
}

/**
 * Create a WIZARD project through lyriks under auth (Fix #4) — the one you can then
 * drive with set_section / build_screen / apply_behavior_batch. Distinct from the
 * portfolio `create_project` tool, which mints a back UUID with no linked lyriks
 * wizard draft (so set_section 404s on it under the enterprise guard). lyriks runs its
 * real CreateProject use-case (owned + workspace-scoped, so the creator keeps
 * access) and returns `{ projectId, workspaceId }` — the `projectId` is the slug
 * the section tools address. Auth-on, `workspace_id` names the owning team
 * (required only when the caller belongs to more than one).
 */
export async function createWizardProjectHandler(
  args: {
    name: string
    description?: string
    workspace_id?: string
    domain_id?: string
    stage?: string
    source_mode?: string
  },
  lyriks: LyriksClient,
): Promise<unknown> {
  return lyriks.post('/api/projects', {
    name: args.name,
    description: args.description,
    workspaceId: args.workspace_id,
    domainId: args.domain_id,
    stage: args.stage,
    sourceMode: args.source_mode,
  })
}

export async function describeSectionHandler(
  args: { section: Section },
  lyriks: LyriksClient,
): Promise<unknown> {
  return lyriks.get(`/api/sections/describe?section=${encodeURIComponent(args.section)}`)
}

export async function getImplementationContextHandler(
  args: { project_id: string; screen_id: string },
  lyriks: LyriksClient,
): Promise<unknown> {
  const qs = `projectId=${encodeURIComponent(args.project_id)}&screen=${encodeURIComponent(args.screen_id)}`
  return lyriks.get(`/api/sections/context?${qs}`)
}

export async function getSectionHandler(
  args: { project_id: string; section: Section; paths?: string[]; summary?: boolean },
  lyriks: LyriksClient,
): Promise<unknown> {
  const qs = `projectId=${encodeURIComponent(args.project_id)}&section=${encodeURIComponent(args.section)}`
  const read = (await lyriks.get(`/api/sections?${qs}`)) as Record<string, unknown>
  // The big document stays here in the MCP server — only return what was asked.
  const draft = (read && typeof read === 'object' && 'draft' in read ? read.draft : read) as Record<string, unknown>

  if (args.summary) {
    return { section: args.section, projectId: args.project_id, revision: read.revision, summary: summarize(draft ?? {}) }
  }
  if (args.paths && args.paths.length > 0) {
    const { values: selected, missingPaths } = selectPaths(draft, args.paths)
    return { section: args.section, projectId: args.project_id, revision: read.revision, selected, missingPaths }
  }
  return read // full document (back-compat) — avoid for big sections; prefer summary/paths
}

/** A sub-tree worth warning about when silently dropped: a non-empty array or object. */
function isNonEmptySubtree(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0
  return typeof value === 'object' && value !== null && Object.keys(value).length > 0
}

/**
 * Server-DERIVED sub-trees per section: the save use-case recomputes these from
 * the authored inputs, so omitting them from a full-replace loses nothing — the
 * next read shows them repopulated. Warning about them is a false alarm that
 * sends authors chasing phantom data loss (observed for every section below).
 * Authored sub-trees (e.g. contract `draft`, experience `brand`) are NOT listed
 * here, so a genuine omission is still reported.
 */
const DERIVED_SUBTREES: Partial<Record<Section, readonly string[]>> = {
  rules: ['inventory'],
  architecture: ['derivedTech'],
  experience: ['derivedCores', 'prototype'],
}

/**
 * The sections whose writes go through a typed tool instead of a raw section
 * document, because their rules (who may decide what, when a gate opens) are
 * applied by the platform on each operation and a raw replace would skip them.
 */
const TYPED_WRITE_ONLY: Partial<Record<Section, string>> = {
  evolution:
    'The evolution section is written through apply_evolution_batch (typed operations, every lifecycle guard applied server-side) and read through get_evolution; a raw section write would skip the guards, so it is refused. Use get_evolution for reads.',
}

function refuseTypedWriteOnly(section: Section): unknown | null {
  const reason = TYPED_WRITE_ONLY[section]
  return reason ? { refused: true, section, reason } : null
}

export async function setSectionHandler(
  args: { project_id: string; section: Section; document: Record<string, unknown>; expected_revision?: number },
  lyriks: LyriksClient,
): Promise<unknown> {
  const typedOnly = refuseTypedWriteOnly(args.section)
  if (typedOnly) return typedOnly
  // Patch escape hatch: a document of the shape { __ops: [...] } is a targeted
  // patch, not a full replace — so callers can edit a section without resending
  // huge sub-trees (e.g. the Experience builder). Delegates to patchSectionHandler.
  const ops = (args.document as { __ops?: unknown }).__ops
  if (Array.isArray(ops)) {
    return patchSectionHandler({ project_id: args.project_id, section: args.section, operations: ops as PatchOp[], expected_revision: args.expected_revision }, lyriks)
  }
  // Guard against the classic full-replace trap: warn (post-write) when the
  // stored draft holds non-empty sub-trees the incoming document omits — e.g.
  // `collections` seeded by import_data_collections, or `builder`. Read errors
  // block writes: without the current revision, a replacement is unsafe.
  const warnings: string[] = []
  let revision: number | undefined
  {
    const qs = `projectId=${encodeURIComponent(args.project_id)}&section=${encodeURIComponent(args.section)}`
    const read = (await lyriks.get(`/api/sections?${qs}`)) as Record<string, unknown>
    revision = sectionRevision(read, args.expected_revision)
    const current = ((read && typeof read === 'object' && 'draft' in read ? read.draft : read) ?? {}) as Record<string, unknown>
    const derived = new Set(DERIVED_SUBTREES[args.section] ?? [])
    const dropped = Object.keys(current).filter(
      (k) => k !== 'projectId' && !derived.has(k) && isNonEmptySubtree(current[k]) && !(k in args.document),
    )
    if (dropped.length) {
      warnings.push(
        `Full replace DROPPED existing non-empty sub-trees absent from your document: ${dropped.join(', ')}. ` +
          `If that was unintended, restore them (get_section) or use patch_section / {__ops:[...]} for targeted edits.`,
      )
    }
  }
  // lyriks endpoints key off projectId in the body — stamp it so the caller can't drift.
  const body = { ...args.document, projectId: args.project_id }
  const raw = await lyriks.put(WRITE_PATHS[args.section], body, revisionHeaders(revision))
  if (revision === undefined) warnings.push(UNGUARDED_WRITE_WARNING)
  const result = dedupeCoherenceIssues(`${args.project_id}:${args.section}`, raw)
  const guard = { writeGuard: writeGuard(revision), ...(warnings.length ? { warnings } : {}) }
  return typeof result === 'object' && result !== null ? { ...result, ...guard } : { result, ...guard }
}

/**
 * One targeted edit on a section draft. Two ops cover the wizard's normalized
 * shape:
 *   - `set`   : assign a scalar/object at a dotted `path` (e.g. "activeTab",
 *               "builder.entryScreenId"). Intermediate objects are created.
 *   - `merge` : shallow-merge `value` into the item of array `collection` whose
 *               `id` matches (the wizard's arrays are id-keyed: journeys, steps,
 *               screens, components, ...). No match → the op is a no-op unless
 *               `insert` is true, in which case `value` is appended as a new item.
 *   - `append`: add one row at the END of array `collection`, with NO selector
 *               at all. The op to reach for when the row does not exist yet:
 *               `merge` has to point at a row to find, so adding one meant
 *               either knowing an id the section has not minted or counting the
 *               existing rows to `set` an index. Give `id` to stamp one on the
 *               new row (id-keyed collections); leave it out for a keyless one
 *               (users `permissions[]`), whose sections reject unknown fields.
 *               Idempotent: an id already present, or a row the collection
 *               already holds verbatim, reports `unchanged` instead of
 *               duplicating. The array is created when the section has none yet.
 *
 * Keyless collections (rows without an `id`, e.g. users `permissions[]`) are
 * addressed with `match` — field equality on the row — instead of `id`. Inserts
 * via `match` append `value` verbatim: no `id` is injected, because sections
 * that own keyless rows reject unknown fields on save.
 * `collection` accepts a dotted path (with numeric indices) for nested arrays,
 * e.g. "builder.collections" or "builder.collections.7.fields".
 */
export interface PatchOp {
  op: 'set' | 'merge' | 'append' | 'remove' | IncrementalOp
  path?: string
  collection?: string
  id?: string
  match?: Record<string, unknown>
  insert?: boolean
  value?: unknown
  /** replace_text: the text to replace; it must occur exactly once. */
  find?: string
  /** append_text: what goes between the current text and `value` (default: a blank line). */
  separator?: string
}

/**
 * Incremental ops: they ADD to a list or a text instead of assigning it, so the
 * caller never resends the whole value and never erases what a concurrent
 * writer added to it. Each one is idempotent: a retry finds its work done and
 * reports `unchanged` instead of duplicating.
 *   - `add_to_set`      : append scalar `value` to the array at `path` unless present (array created when absent).
 *   - `remove_from_set` : remove every occurrence of `value` from the array at `path`.
 *   - `append_text`     : append `separator` + `value` to the string at `path` unless it already contains `value`.
 *   - `replace_text`    : replace `find` by `value` in the string at `path` when `find` occurs exactly once.
 * With `collection` + `id`/`match`, `path` is read inside that row, so a row is
 * addressed by its id rather than by a position another writer can shift.
 */
const isIncremental = (op: string): op is IncrementalOp => (INCREMENTAL_OPS as readonly string[]).includes(op)

function setPath(root: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.')
  let node: Record<string, unknown> = root
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]
    if (typeof node[k] !== 'object' || node[k] === null) node[k] = {}
    node = node[k] as Record<string, unknown>
  }
  node[keys[keys.length - 1]] = value
}

function deletePath(root: Record<string, unknown>, path: string): boolean {
  const keys = path.split('.')
  let node: Record<string, unknown> = root
  for (let i = 0; i < keys.length - 1; i++) {
    const next = node[keys[i]]
    if (typeof next !== 'object' || next === null) return false
    node = next as Record<string, unknown>
  }
  const last = keys[keys.length - 1]
  if (last in node) {
    delete node[last]
    return true
  }
  return false
}

/** Resolve `collection` — a top-level key or a dotted path into nested arrays. */
function resolveCollection(draft: Record<string, unknown>, collection: string): unknown {
  return collection.includes('.') ? getPath(draft, collection) : draft[collection]
}

function rowMatches(row: Record<string, unknown>, match: Record<string, unknown>): boolean {
  return Object.entries(match).every(([k, v]) => row[k] === v)
}

function findRow(arr: unknown[], op: PatchOp): number {
  return arr.findIndex((x) => {
    if (!x || typeof x !== 'object') return false
    if (op.id !== undefined) return (x as { id?: unknown }).id === op.id
    return op.match ? rowMatches(x as Record<string, unknown>, op.match) : false
  })
}

/** The container of the last segment of `path`. Missing objects are created on
 *  the way when `create` is set; a scalar or a missing array index on the way is
 *  never overwritten (null), unlike `set`, because these ops must not destroy. */
function parentOf(root: unknown, path: string, create: boolean): { node: Record<string, unknown>; key: string } | null {
  const keys = path.split('.')
  let node = root
  for (const k of keys.slice(0, -1)) {
    const next = getPath(node, k)
    if (next === undefined && create && !Array.isArray(node)) {
      const made: Record<string, unknown> = {}
      ;(node as Record<string, unknown>)[k] = made
      node = made
    } else if (typeof next === 'object' && next !== null) node = next
    else return null
  }
  const key = keys[keys.length - 1]
  // An array only takes an index it already holds: no sparse rows.
  if (Array.isArray(node) && getPath(node, key) === undefined) return null
  return { node: node as Record<string, unknown>, key }
}

/** Every index at which `needle` occurs, without overlaps. */
function occurrences(text: string, needle: string): number[] {
  const at: number[] = []
  for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + needle.length)) at.push(i)
  return at
}

/** Whether the text around the `find` at index `at` already reads as `value`. A
 *  `value` that extends `find` ("Hello" by "Hello world") leaves `find` in the
 *  text, and a retry must not take that for a target and write it twice. */
function readsAsValue(text: string, at: number, find: string, value: string): boolean {
  for (let k = value.indexOf(find); k !== -1; k = value.indexOf(find, k + 1)) {
    if (at - k >= 0 && text.startsWith(value, at - k)) return true
  }
  return false
}

type OpOutcome = 'changed' | 'unchanged' | { notApplied: string }

function applyIncremental(draft: Record<string, unknown>, op: PatchOp): OpOutcome {
  let base: unknown = draft
  if (op.collection) {
    const arr = resolveCollection(draft, op.collection)
    const idx = Array.isArray(arr) ? findRow(arr, op) : -1
    if (idx < 0) return { notApplied: 'no row matched in the collection' }
    base = (arr as unknown[])[idx]
  }
  const path = op.path as string
  const creates = op.op === 'add_to_set' || op.op === 'append_text'
  const parent = parentOf(base, path, creates)
  if (!parent) return { notApplied: creates ? 'the path crosses a value that is not an object' : 'nothing at this path' }
  const { node, key } = parent
  const current = getPath(node, key)
  const absent = current === undefined || current === null

  if (op.op === 'add_to_set' || op.op === 'remove_from_set') {
    if (absent && op.op === 'add_to_set') {
      node[key] = [op.value]
      return 'changed'
    }
    if (!Array.isArray(current)) return { notApplied: absent ? 'no array at this path' : 'the value at this path is not an array' }
    if (op.op === 'add_to_set') {
      if (current.includes(op.value)) return 'unchanged'
      current.push(op.value)
      return 'changed'
    }
    if (!current.includes(op.value)) return 'unchanged'
    node[key] = current.filter((item) => item !== op.value)
    return 'changed'
  }

  const value = op.value as string
  if (op.op === 'append_text') {
    if (!absent && typeof current !== 'string') return { notApplied: 'the value at this path is not a string' }
    const text = absent ? '' : (current as string)
    if (text.includes(value)) return 'unchanged'
    node[key] = text ? `${text}${op.separator ?? '\n\n'}${value}` : value
    return 'changed'
  }

  // replace_text
  if (typeof current !== 'string') return { notApplied: absent ? 'no text at this path' : 'the value at this path is not a string' }
  const find = op.find as string
  const hits = occurrences(current, find)
  if (hits.length > 1) return { notApplied: `\`find\` occurs ${hits.length} times in the text: extend it until it is unique` }
  if (hits.length === 0) {
    // Not counted as done: `value` may sit in the text for another reason, and a
    // typo in `find` would then pass for an edit that landed.
    const retry = value && current.includes(value) ? '; the text already contains `value`, so this may be a retry of an edit that landed' : ''
    return { notApplied: `\`find\` occurs 0 times in the text${retry}` }
  }
  if (find === value || readsAsValue(current, hits[0], find, value)) return 'unchanged'
  node[key] = current.slice(0, hits[0]) + value + current.slice(hits[0] + find.length)
  return 'changed'
}

/**
 * Why an op found nothing. A `merge` that matched no row is the classic way an
 * author tries to ADD a line, so the reason names the op that does it instead
 * of leaving them to discover `insert` or to count rows for a `set` by index.
 */
function noTargetReason(op: PatchOp): string {
  if (op.op === 'merge' && op.collection) {
    return (
      'matched no target: merge edits a row that already exists. ' +
      `To ADD one, use { op: "append", collection: "${op.collection}", value: { ... } }` +
      (op.id !== undefined ? ` with id: "${op.id}"` : ' (no id for a keyless collection)') +
      '.'
    )
  }
  return 'matched no target'
}

/** What one op is aimed at, for the change report. */
const opTarget = (op: PatchOp): string => {
  const row = op.collection !== undefined ? `${op.collection}[${op.id ?? (op.match ? JSON.stringify(op.match) : '?')}]` : ''
  return row && op.path ? `${row}.${op.path}` : row || op.path || '?'
}

/**
 * Append one row to a collection. Separate from `applyLegacy` because it can
 * report `unchanged`: a retry of an append must find its work done rather than
 * write the row twice, the same contract as the incremental ops.
 */
function applyAppend(draft: Record<string, unknown>, op: PatchOp): OpOutcome {
  const collection = op.collection as string
  let arr = resolveCollection(draft, collection)
  if (arr === undefined || arr === null) {
    // Nothing there yet: create the array, but never carve a path through a
    // scalar or invent a missing parent row.
    const parent = parentOf(draft, collection, false)
    if (!parent) return { notApplied: 'no collection at this path, and its parent does not exist' }
    parent.node[parent.key] = []
    arr = parent.node[parent.key]
  }
  if (!Array.isArray(arr)) return { notApplied: 'the value at this path is not a collection' }
  const rows = arr as unknown[]
  const row = op.id !== undefined ? { id: op.id, ...(op.value as object) } : { ...(op.value as object) }
  const already =
    op.id !== undefined
      ? rows.some((x) => !!x && typeof x === 'object' && (x as { id?: unknown }).id === op.id)
      : rows.some((x) => !!x && typeof x === 'object' && JSON.stringify(x) === JSON.stringify(row))
  if (already) return 'unchanged'
  rows.push(row)
  return 'changed'
}

/** set / merge / remove: true when the op found its target. */
function applyLegacy(draft: Record<string, unknown>, op: PatchOp): boolean {
  if (op.op === 'set' && op.path) {
    setPath(draft, op.path, op.value)
    return true
  }
  if (op.op === 'merge' && op.collection && (op.id !== undefined || op.match)) {
    const arr = resolveCollection(draft, op.collection)
    if (!Array.isArray(arr)) return false
    const idx = findRow(arr, op)
    if (idx >= 0) {
      Object.assign(arr[idx] as object, op.value as object)
      return true
    }
    if (!op.insert) return false
    // Stamp `id` only for id-addressed rows: keyless collections (users
    // permissions, ...) reject unknown fields on save.
    arr.push(op.id !== undefined ? { id: op.id, ...(op.value as object) } : { ...(op.value as object) })
    return true
  }
  if (op.op === 'remove') {
    // Remove an id/match-keyed array item, or delete a key at a dotted path
    // (e.g. an object-map entry like "builder.nodes.<id>").
    if (op.collection && (op.id !== undefined || op.match)) {
      const arr = resolveCollection(draft, op.collection)
      if (!Array.isArray(arr)) return false
      const idx = findRow(arr, op)
      if (idx < 0) return false
      arr.splice(idx, 1)
      return true
    }
    return !!op.path && deletePath(draft, op.path)
  }
  return false
}

export interface PatchReport {
  /** Ops that found their target, whether or not they had anything left to change. */
  applied: number
  /** Targets of the ops that changed the draft. */
  changed: string[]
  /** Targets of the ops that found their work already done (an idempotent retry). */
  unchanged: string[]
  /** Ops that found no target, with the reason. */
  notApplied: Array<{ index: number; op: string; target: string; reason: string }>
}

/** Apply `operations` in order and say, op by op, what each one did. */
export function applySectionPatchReport(draft: Record<string, unknown>, operations: PatchOp[]): PatchReport {
  validateSectionPatch(operations)
  const report: PatchReport = { applied: 0, changed: [], unchanged: [], notApplied: [] }
  for (const [index, op] of operations.entries()) {
    const outcome = isIncremental(op.op)
      ? applyIncremental(draft, op)
      : op.op === 'append'
        ? applyAppend(draft, op)
        : applyLegacy(draft, op)
          ? 'changed'
          : { notApplied: noTargetReason(op) }
    if (typeof outcome === 'object') {
      report.notApplied.push({ index, op: op.op, target: opTarget(op), reason: outcome.notApplied })
      continue
    }
    report.applied++
    report[outcome].push(opTarget(op))
  }
  return report
}

/** The number of ops that found their target. */
export function applySectionPatch(draft: Record<string, unknown>, operations: PatchOp[]): number {
  return applySectionPatchReport(draft, operations).applied
}

/**
 * Targeted section write: read the current draft, apply `operations` in order,
 * write it back through the wizard app's real save use-case (with its sync side-effects).
 * The big read/merge happens here in the MCP server, so the caller only sends a
 * small patch — never the whole document.
 */
export async function patchSectionHandler(
  args: { project_id: string; section: Section; operations: PatchOp[]; dry_run?: boolean; expected_revision?: number },
  lyriks: LyriksClient,
): Promise<unknown> {
  const typedOnly = refuseTypedWriteOnly(args.section)
  if (typedOnly) return typedOnly
  validateSectionPatch(args.operations)
  const qs = `projectId=${encodeURIComponent(args.project_id)}&section=${encodeURIComponent(args.section)}`
  const read = (await lyriks.get(`/api/sections?${qs}`)) as Record<string, unknown>
  const revision = sectionRevision(read, args.expected_revision)
  // /api/sections returns { section, projectId, draft }; tolerate a bare draft too.
  const draft = structuredClone((read && typeof read === 'object' && 'draft' in read
    ? (read.draft as Record<string, unknown>)
    : read) ?? {})
  const report = applySectionPatchReport(draft, args.operations)
  const body = { ...draft, projectId: args.project_id }
  // Tiny change report so the caller doesn't need a verify-read to know what landed.
  const outcome = {
    opsApplied: report.applied,
    opsTotal: args.operations.length,
    changed: report.changed,
    unchanged: report.unchanged,
    ...(report.notApplied.length ? { notApplied: report.notApplied } : {}),
  }
  if (args.dry_run === true) {
    const preview = { dryRun: true, persisted: false, baseRevision: revision, ...outcome,
      warnings: report.notApplied.length ? [`${report.notApplied.length} operation(s) matched no target; inspect ids and collection paths before applying.`] : [] }
    let validation: unknown
    try {
      validation = await lyriks.post('/api/sections/validate', { projectId: args.project_id, section: args.section, draft: body })
    } catch (err) {
      // An older platform has no validation route. The section read just
      // succeeded, so a 404 HERE is the route, not the project: answer with what
      // the local application of the ops showed instead of failing the preview.
      if (!isMissingValidateRoute(err)) throw err
      return { ...preview, dryRunUnavailable: true,
        reason: 'This platform version has no POST /api/sections/validate route (404), so its authoring guards could not run on the preview. The operations were applied to a local copy only: opsApplied and notApplied say which of them matched. Nothing was saved. Upgrade the platform for a validated dry run.' }
    }
    return { ...preview, validation,
      next: 'If the preview is acceptable, call patch_section with dry_run:false. Pass baseRevision as expected_revision to reject changes since this preview. This is not a reserved transaction or commit token.' }
  }
  const result = dedupeCoherenceIssues(
    `${args.project_id}:${args.section}`,
    (await lyriks.put(WRITE_PATHS[args.section], body, revisionHeaders(revision))) as Record<string, unknown>,
  )
  return { ...result, ...outcome, writeGuard: writeGuard(revision),
    ...(revision === undefined ? { warnings: [UNGUARDED_WRITE_WARNING] } : {}) }
}

const isMissingValidateRoute = (err: unknown): boolean =>
  err instanceof Error && /^lyriks 404 on POST \/api\/sections\/validate(?:\s|:)/.test(err.message)

/**
 * Whether the write went out under the revision check. An older platform's
 * section read carries no revision, so no `x-lyriks-rev` header is sent, yet its
 * PUT answer may still show a `revision`: next to a vague warning that read as a
 * guarded write. The status is explicit on every write answer instead.
 */
const writeGuard = (revision: number | undefined): 'revision-checked' | 'unavailable' =>
  revision === undefined ? 'unavailable' : 'revision-checked'

const UNGUARDED_WRITE_WARNING =
  'This write was NOT protected against concurrent edits: the section read of this older platform returned no revision, so no revision check was sent with it. Any `revision` in this answer is the one AFTER the write, not a check that was made. Upgrade the platform for guarded writes.'

/** A preview token is optional; the read's token still protects read/modify/write. */
function sectionRevision(read: Record<string, unknown>, expected?: number): number | undefined {
  const revision = typeof read.revision === 'number' && Number.isInteger(read.revision) && read.revision >= 0
    ? read.revision : undefined
  if (expected !== undefined && revision !== expected) {
    throw new Error(revision === undefined
      ? 'The platform did not return a revision; upgrade it before using expected_revision.'
      : 'Section revision conflict: reload and review the concurrent edit before retrying.')
  }
  return revision
}
function revisionHeaders(revision: number | undefined): Record<string, string> {
  return revision === undefined ? {} : { 'x-lyriks-rev': String(revision) }
}
