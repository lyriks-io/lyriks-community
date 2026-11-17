// Where the code implements what a spec read returns (criterion 97ef2d0d).
//
// Lyriks answers what the product must do; the AI client's own code tools (its
// search, a code search service, a code graph, its editor) answer how the code
// is written. A read of one action or one surface therefore ends where those
// tools start: the places the implementation index last located, each with the
// file, the line, the code line and how far it can be trusted, and one sentence
// saying what to do with them. Field use on a large codebase showed what happens
// without it: the agent read the rule, then searched the code from nothing, and
// rated the spec as a detour.
//
// The places come from the implementation-status record the index sync keeps
// (one report per action and per surface). This module never opens a file: the
// server holds no checkout, so a place is what the last sync said, and its
// `stale` / `unverified` marks say how far that still holds.

import type { LyriksClient } from '../lyriks-client.js'

type Row = Record<string, unknown>

const isRow = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v)
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.filter(isRow) : [])
const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined)

/** Enough rows to read a large action whole, few enough to keep the answer small. */
export const MAX_PLACES = 80
const MAX_CODE_CHARS = 240
const MAX_NAME_CHARS = 100

const CODE_TOOLS = 'your own code tools (your search, a code search service, a code graph, your editor)'

export const NEXT_LOCATED =
  'These are the places where the code implements what this answer reads, as the implementation index last located them. ' +
  `Open them with ${CODE_TOOLS}, and check that the code line still stands at that line before you trust a place: ` +
  'the server holds no checkout, so a place is what the last sync said. ' +
  'Read there how the code is written, check it against the rules read here, ' +
  'and tell the person where the code does otherwise instead of resolving it either way. ' +
  'A place marked stale moved since it was located (movedToLine when known), one marked unverified was claimed without code evidence, ' +
  'and get_implementation_drift says which were located against an older version of the spec. ' +
  'What is not located yet is searched the same way, by its name.'

export const NEXT_NOT_LINKED =
  'The spec is not linked to the code yet: the implementation index locates nothing of what this answer reads. ' +
  `Search the code with ${CODE_TOOLS} by the names this answer gives (the action, its rules, its states and events), ` +
  'and tell the person where you found it and where the code does otherwise than the rules read here.'

const nextUnavailable = (reason: string) =>
  `The places in the code could not be read (${reason}). The element above is complete: search the code with ${CODE_TOOLS} by the names it gives.`

/** One element of the spec read, keyed the way its report keys it. */
type Expected = { type: string; id: string; key: string; name?: string }

const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}…` : value)

function expectedOfAction(action: Row): Expected[] {
  const out: Expected[] = []
  const id = text(action.id)
  if (id) out.push({ type: 'action', id, key: `action:${id}`, name: text(action.name) })
  for (const rule of rows(action.rules)) {
    const rid = text(rule.id)
    if (rid) out.push({ type: 'rule', id: rid, key: `rule:${rid}`, name: text(rule.description) ?? text(rule.name) })
  }
  for (const inv of rows(action.invariants)) {
    const iid = text(inv.id)
    if (iid) out.push({ type: 'invariant', id: iid, key: `invariant:${iid}`, name: text(inv.name) })
  }
  for (const tr of rows(action.transitions)) {
    const tid = text(tr.id)
    if (tid) out.push({ type: 'transition', id: tid, key: `transition:${tid}`, name: text(tr.label) ?? text(tr.description) })
  }
  const events = Array.isArray(action.emittedEvents) ? action.emittedEvents : []
  for (const event of events) {
    const name = typeof event === 'string' ? event : isRow(event) ? text(event.name) : undefined
    if (name) out.push({ type: 'event', id: name, key: `event:${name}`, name })
  }
  return out
}

function expectedOfSurface(surface: Row): Expected[] {
  const out: Expected[] = []
  for (const sd of rows(surface.stateDefinitions)) {
    const sid = text(sd.id)
    const path = text(sd.path)
    if (sid || path) out.push({ type: 'state', id: sid ?? path!, key: `state:${path ?? sid}`, name: path })
  }
  for (const rule of rows(surface.rules)) {
    const rid = text(rule.id)
    if (rid) out.push({ type: 'surface_rule', id: rid, key: `surface_rule:${rid}`, name: text(rule.description) })
  }
  for (const inv of rows(surface.invariants)) {
    const iid = text(inv.id)
    if (iid) out.push({ type: 'surface_invariant', id: iid, key: `surface_invariant:${iid}`, name: text(inv.name) })
  }
  for (const action of rows(surface.actions)) out.push(...expectedOfAction(action))
  return out
}

/** The index key a reported entity answers to: a state by its path, the rest by id. */
function reportedKey(entity: Row): string | undefined {
  const type = text(entity.entityType)
  const id = text(entity.entityId)
  if (!type || !id) return undefined
  if (type === 'state') return `state:${text(entity.entityName) ?? id}`
  return `${type}:${id}`
}

function placesOf(entity: Row, key: string, name: string | undefined): Row[] {
  return rows(entity.locations)
    .filter((loc) => text(loc.file))
    .map((loc) => {
      const code = text(loc.snippet)
      return {
        key,
        ...(name ? { name: clip(name, MAX_NAME_CHARS) } : {}),
        file: loc.file,
        ...(typeof loc.line === 'number' ? { line: loc.line } : {}),
        ...(code ? { code: clip(code, MAX_CODE_CHARS) } : {}),
        ...(loc.stale === true ? { stale: true } : {}),
        ...(loc.stale === true && typeof loc.suggestedLine === 'number' ? { movedToLine: loc.suggestedLine } : {}),
        ...(loc.unverified === true ? { unverified: true } : {}),
        ...(text(entity.capturedAt) ? { locatedAt: entity.capturedAt } : {}),
      }
    })
}

/** The audit an action or surface report carries: when, on which commit, and whether it was proven. */
function auditOf(report: Row, key: string): Row {
  const meta = isRow(report.auditMeta) ? report.auditMeta : {}
  return {
    key,
    ...(text(report.reportedAt) ? { reportedAt: report.reportedAt } : {}),
    ...(text(meta.auditedAt) ? { auditedAt: meta.auditedAt } : {}),
    ...(text(meta.gitCommit) ? { commit: meta.gitCommit } : {}),
    provenAgainstCode: text(meta.verifiedAt) ?? false,
  }
}

/**
 * The `code` block of a read, from the spec element read and the reports that
 * cover it. Pure: the caller fetched the reports.
 */
export function buildCodePlaces(expected: Expected[], reports: Array<{ key: string; report: Row }>): Row {
  const names = new Map(expected.map((e) => [e.key, e.name]))
  const located = new Set<string>()
  const places: Row[] = []
  const missing = new Map<string, string | undefined>()
  for (const { report } of reports) {
    for (const entity of rows(report.foundEntities)) {
      const key = reportedKey(entity)
      if (!key) continue
      const found = placesOf(entity, key, names.get(key) ?? text(entity.entityName))
      if (found.length) {
        located.add(key)
        places.push(...found)
      }
    }
    for (const entity of rows(report.missingEntities)) {
      const key = reportedKey(entity)
      if (key) missing.set(key, names.get(key) ?? text(entity.entityName))
    }
  }
  // What the spec holds now and no report locates: added after the last sync, or never indexed.
  for (const e of expected) if (!located.has(e.key) && !missing.has(e.key)) missing.set(e.key, e.name)
  for (const key of located) missing.delete(key)

  const notLocatedYet = [...missing].map(([key, name]) => ({ key, ...(name ? { name: clip(name, MAX_NAME_CHARS) } : {}) }))
  const kept = places.slice(0, MAX_PLACES)
  return {
    linked: located.size > 0,
    located: located.size,
    notLocated: notLocatedYet.length,
    ...(kept.length ? { places: kept } : {}),
    ...(places.length > kept.length ? { morePlaces: places.length - kept.length } : {}),
    ...(notLocatedYet.length ? { notLocatedYet } : {}),
    ...(reports.length ? { audits: reports.map(({ key, report }) => auditOf(report, key)) } : {}),
    next: located.size > 0 ? NEXT_LOCATED : NEXT_NOT_LINKED,
  }
}

/** A refusal, an unreachable engine or a platform that answers something else. */
function unavailable(reason: string): Row {
  return { available: false, reason, next: nextUnavailable(reason) }
}

/**
 * The `code` block for one element a read selected, or undefined when the read
 * carries none (nothing found, a draft: a draft has no code of its own yet).
 */
export async function codePlacesForRead(
  lyriks: LyriksClient,
  args: { project_id: string; feature_id: string },
  selected: Row,
): Promise<Row | undefined> {
  if (selected.found !== true || args.feature_id.startsWith('draft:')) return undefined
  const action = isRow(selected.action) ? selected.action : null
  const surface = !action && isRow(selected.surface) ? selected.surface : null
  if (!action && !surface) return undefined

  const q = new URLSearchParams({ projectId: args.project_id, featureId: args.feature_id })
  // One action: its own report. One surface: the whole record, since the
  // surface's actions each carry a report of their own.
  if (action) q.set('actionId', String(action.id))
  let answer: unknown
  try {
    answer = await lyriks.get(`/api/behavior/implementation/status?${q.toString()}`)
  } catch (e) {
    return unavailable(clip((e as Error)?.message || 'the implementation status could not be read', 200))
  }
  if (!isRow(answer)) return unavailable('the platform sent no implementation status')
  if (answer.ok === false) return unavailable(clip(text(answer.error) ?? 'the engine refused the read', 200))

  const reports: Array<{ key: string; report: Row }> = []
  if (action) {
    if (isRow(answer.action)) reports.push({ key: `action:${String(action.id)}`, report: answer.action })
    else if (!('action' in answer) && !('status' in answer)) return unavailable('the platform sent no implementation status')
    return buildCodePlaces(expectedOfAction(action), reports)
  }
  const surfaceId = String(surface!.id)
  if (!('surfaces' in answer) && !('actions' in answer) && !('status' in answer)) {
    return unavailable('the platform sent no implementation status')
  }
  const own = rows(answer.surfaces).find((s) => s.surfaceId === surfaceId)
  if (own) reports.push({ key: `surface:${surfaceId}`, report: own })
  const actionIds = new Set(rows(surface!.actions).map((a) => String(a.id)))
  for (const report of rows(answer.actions)) {
    if (report.surfaceId === surfaceId || actionIds.has(String(report.actionId))) {
      reports.push({ key: `action:${String(report.actionId)}`, report })
    }
  }
  return buildCodePlaces(expectedOfSurface(surface!), reports)
}
