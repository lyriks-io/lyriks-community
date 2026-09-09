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
import { getPath, summarize } from '../util/shape.js'
import { dedupeCoherenceIssues } from '../util/advisory-dedupe.js'

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
  contract:       '/api/draft/contract',
  generation:     '/api/draft/generation',
  glossary:       '/api/draft/glossary',
  supervision:    '/api/draft/supervision',
  finops:         '/api/draft/finops',
  approvals:      '/api/draft/approvals',
  baselines:      '/api/draft/baselines',
  // The project evidence register. Every other section cites it by stable id
  // (`sourceIds`), so an author that cannot write here cannot source anything.
  documents:      '/api/draft/documents',
} as const

export type Section = keyof typeof WRITE_PATHS
export const SECTIONS = Object.keys(WRITE_PATHS) as [Section, ...Section[]]

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
    return { section: args.section, projectId: args.project_id, summary: summarize(draft ?? {}) }
  }
  if (args.paths && args.paths.length > 0) {
    const selected: Record<string, unknown> = {}
    for (const p of args.paths) selected[p] = getPath(draft, p)
    return { section: args.section, projectId: args.project_id, selected }
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
  contract: ['compilation'],
}

export async function setSectionHandler(
  args: { project_id: string; section: Section; document: Record<string, unknown> },
  lyriks: LyriksClient,
): Promise<unknown> {
  // Patch escape hatch: a document of the shape { __ops: [...] } is a targeted
  // patch, not a full replace — so callers can edit a section without resending
  // huge sub-trees (e.g. the Experience builder). Delegates to patchSectionHandler.
  const ops = (args.document as { __ops?: unknown }).__ops
  if (Array.isArray(ops)) {
    return patchSectionHandler({ project_id: args.project_id, section: args.section, operations: ops as PatchOp[] }, lyriks)
  }
  // Guard against the classic full-replace trap: warn (post-write) when the
  // stored draft holds non-empty sub-trees the incoming document omits — e.g.
  // `collections` seeded by import_data_collections, or `builder`. Best-effort:
  // an unreadable current draft never blocks the write.
  const warnings: string[] = []
  try {
    const qs = `projectId=${encodeURIComponent(args.project_id)}&section=${encodeURIComponent(args.section)}`
    const read = (await lyriks.get(`/api/sections?${qs}`)) as Record<string, unknown>
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
  } catch {
    // best-effort guard only
  }
  // lyriks endpoints key off projectId in the body — stamp it so the caller can't drift.
  const body = { ...args.document, projectId: args.project_id }
  const raw = await lyriks.put(WRITE_PATHS[args.section], body)
  const result = dedupeCoherenceIssues(`${args.project_id}:${args.section}`, raw)
  if (!warnings.length) return result
  return typeof result === 'object' && result !== null ? { ...result, warnings } : { result, warnings }
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
 *
 * Keyless collections (rows without an `id`, e.g. users `permissions[]`) are
 * addressed with `match` — field equality on the row — instead of `id`. Inserts
 * via `match` append `value` verbatim: no `id` is injected, because sections
 * that own keyless rows reject unknown fields on save.
 * `collection` accepts a dotted path (with numeric indices) for nested arrays,
 * e.g. "builder.collections" or "builder.collections.7.fields".
 */
export interface PatchOp {
  op: 'set' | 'merge' | 'remove'
  path?: string
  collection?: string
  id?: string
  match?: Record<string, unknown>
  insert?: boolean
  value?: unknown
}

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

export function applySectionPatch(draft: Record<string, unknown>, operations: PatchOp[]): number {
  let applied = 0
  for (const op of operations) {
    if (op.op === 'set' && op.path) {
      setPath(draft, op.path, op.value)
      applied++
    } else if (op.op === 'merge' && op.collection && (op.id !== undefined || op.match)) {
      const arr = resolveCollection(draft, op.collection)
      if (!Array.isArray(arr)) continue
      const idx = findRow(arr, op)
      if (idx >= 0) {
        Object.assign(arr[idx] as object, op.value as object)
        applied++
      } else if (op.insert) {
        // Stamp `id` only for id-addressed rows — keyless collections (users
        // permissions, ...) reject unknown fields on save.
        arr.push(op.id !== undefined ? { id: op.id, ...(op.value as object) } : { ...(op.value as object) })
        applied++
      }
    } else if (op.op === 'remove') {
      // Remove an id/match-keyed array item, or delete a key at a dotted path
      // (e.g. an object-map entry like "builder.nodes.<id>").
      if (op.collection && (op.id !== undefined || op.match)) {
        const arr = resolveCollection(draft, op.collection)
        if (!Array.isArray(arr)) continue
        const idx = findRow(arr, op)
        if (idx >= 0) {
          arr.splice(idx, 1)
          applied++
        }
      } else if (op.path) {
        if (deletePath(draft, op.path)) applied++
      }
    }
  }
  return applied
}

/**
 * Targeted section write: read the current draft, apply `operations` in order,
 * write it back through the wizard app's real save use-case (with its sync side-effects).
 * The big read/merge happens here in the MCP server, so the caller only sends a
 * small patch — never the whole document.
 */
export async function patchSectionHandler(
  args: { project_id: string; section: Section; operations: PatchOp[] },
  lyriks: LyriksClient,
): Promise<unknown> {
  const qs = `projectId=${encodeURIComponent(args.project_id)}&section=${encodeURIComponent(args.section)}`
  const read = (await lyriks.get(`/api/sections?${qs}`)) as Record<string, unknown>
  // /api/sections returns { section, projectId, draft }; tolerate a bare draft too.
  const draft = (read && typeof read === 'object' && 'draft' in read
    ? (read.draft as Record<string, unknown>)
    : read) ?? {}
  const applied = applySectionPatch(draft, args.operations)
  const body = { ...draft, projectId: args.project_id }
  const result = dedupeCoherenceIssues(
    `${args.project_id}:${args.section}`,
    (await lyriks.put(WRITE_PATHS[args.section], body)) as Record<string, unknown>,
  )
  // Tiny change report so the caller doesn't need a verify-read to know what landed.
  const changed = args.operations.map((o) =>
    o.path ? o.path : o.collection !== undefined ? `${o.collection}[${o.id ?? (o.match ? JSON.stringify(o.match) : '?')}]` : '?'
  )
  return { ...result, opsApplied: applied, opsTotal: args.operations.length, changed }
}
