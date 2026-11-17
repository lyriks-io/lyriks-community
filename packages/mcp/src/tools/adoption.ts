// Code → spec: the reverse direction of the authoring tools.
//
// Where `apply_behavior_batch` writes a model someone designed, these ingest a
// model that already EXISTS as running code — attach the files you read, trace
// every modeled element back to the exact span it came from, and refuse to
// finalize until nothing was invented. Everything proxies to the wizard app, which drives
// the Unspaghettit engine as a private subprocess: the engine's own MCP is never
// exposed, so this is the only door.
//
// The division of labour that shapes every signature: YOU hold the filesystem
// (you read the code, and you own `.unspa.json` in the checkout), the platform
// holds the spec. Nothing here makes the server open a file — content and
// locations are always pushed by the caller.

import { createHash } from 'node:crypto'
import type { LyriksClient } from '../lyriks-client.js'

export interface AttachSourceArgs {
  project_id: string
  feature_id: string
  file_name: string
  content: string
  kind?: 'file' | 'code'
  authority?: string
  artifact?: string
  /** The sha256 the client's shell computed over the file (`sha256sum` output accepted as is). */
  sha256?: string
  /** The register row (documents.sources id) the text belongs to: the row then names the stored text (feat-source-register 81dffe4f). */
  register_id?: string
}

/** Store a file you read as evidence for one feature's analysis. */
/** The sha256 of a text as UTF-8 bytes, lower-case hex: what `sha256sum` prints for the same file. */
export const sha256Of = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex')

/**
 * A file sent as a tool argument (Claude Cowork cannot run the attach script)
 * proves it arrived unaltered: the client gives the sha256 its shell computed
 * over the file, the gateway computes it over what arrived, and a different
 * one stores nothing (criterion 3dc1bafd). Without sha256 the attach is as before.
 */
export async function attachSourceHandler(args: AttachSourceArgs, lyriks: LyriksClient): Promise<unknown> {
  if (args.sha256 !== undefined) {
    const expected = args.sha256.trim().toLowerCase().split(/\s+/)[0] ?? ''
    const received = sha256Of(args.content)
    if (expected !== received) {
      return {
        ok: false,
        stored: false,
        error:
          `The content of ${args.file_name} did not arrive as it is on disk: its sha256 is ${received}, the file's is ${expected}. ` +
          'Nothing was stored. Send the file again exactly as `cat` prints it (every character, the final newline included), or check that the sha256 was computed on the same file.',
        sha256: { expected, received },
      }
    }
  }
  return lyriks.post('/api/behavior/sources', {
    projectId: args.project_id,
    featureId: args.feature_id,
    fileName: args.file_name,
    content: args.content,
    ...(args.kind ? { kind: args.kind } : {}),
    ...(args.authority ? { authority: args.authority } : {}),
    ...(args.artifact ? { artifact: args.artifact } : {}),
    ...(args.register_id ? { registerId: args.register_id } : {}),
  })
}

export interface CitePassagesArgs {
  project_id: string
  passages: { source_id: string; anchor: string; words: string; takes: string }[]
}

/**
 * Cite the passages elements rest on (feat-source-register f09da92d): the
 * platform finds each passage's words in the stored text of its register
 * source and records their place, refusing by name the words it cannot find.
 */
export async function citePassagesHandler(args: CitePassagesArgs, lyriks: LyriksClient): Promise<unknown> {
  return lyriks.post(`/api/projects/${encodeURIComponent(args.project_id)}/passages`, {
    passages: args.passages.map((p) => ({ sourceId: p.source_id, anchor: p.anchor, words: p.words, takes: p.takes })),
  })
}

export interface ListSourcesArgs {
  project_id: string
  name?: string
  source_id?: string
  offset?: number
  max_chars?: number
}

/** List a project's stored sources, or read one back when `source_id` is given. */
export async function listSourcesHandler(args: ListSourcesArgs, lyriks: LyriksClient): Promise<unknown> {
  const q = new URLSearchParams({ projectId: args.project_id })
  if (args.source_id) q.set('sourceId', args.source_id)
  if (args.offset !== undefined) q.set('offset', String(args.offset))
  if (args.max_chars !== undefined) q.set('maxChars', String(args.max_chars))
  const answer = await lyriks.get(`/api/behavior/sources?${q.toString()}`)
  return args.name && !args.source_id ? sourcesNamed(answer, args.name) : answer
}

/**
 * Keep the sources whose file name contains `name` (case aside): a project of a
 * hundred attached files lists past the response cap, and the one a span needs
 * must be reachable by the name the client knows it by.
 */
export function sourcesNamed(answer: unknown, name: string): unknown {
  if (!answer || typeof answer !== 'object' || !Array.isArray((answer as { sources?: unknown }).sources)) return answer
  const wanted = name.trim().toLowerCase()
  const body = answer as { sources: Array<{ name?: unknown }>; count?: unknown }
  const sources = body.sources.filter((s) => typeof s.name === 'string' && s.name.toLowerCase().includes(wanted))
  return { ...body, sources, count: sources.length }
}

export interface ClassifySourceArgs {
  project_id: string
  source_id: string
  authority?: string
  artifact?: string
}

/** Rank a stored source so a later contradiction resolves by authority. */
export async function classifySourceHandler(
  args: ClassifySourceArgs,
  lyriks: LyriksClient,
): Promise<unknown> {
  return lyriks.patch('/api/behavior/sources', {
    projectId: args.project_id,
    sourceId: args.source_id,
    classification: {
      ...(args.authority ? { authority: args.authority } : {}),
      ...(args.artifact ? { artifact: args.artifact } : {}),
    },
  })
}

export async function removeSourceHandler(
  args: { project_id: string; source_id: string },
  lyriks: LyriksClient,
): Promise<unknown> {
  const q = new URLSearchParams({ projectId: args.project_id, sourceId: args.source_id })
  return lyriks.delete(`/api/behavior/sources?${q.toString()}`)
}

export interface RecordSpansArgs {
  project_id: string
  feature_id: string
  source_id?: string
  spans: Array<{
    element_id: string
    start_offset: number
    end_offset: number
    source_id?: string
  }>
}

/**
 * What a span can point at (criterion 8636a090 of feat-mcp-authoring): the
 * engine traces exactly the elements its feature enumeration lists, whatever
 * its element-type vocabulary also names, so an effect, which the vocabulary
 * knows, is refused as "No element" all the same.
 */
export const SPAN_TARGETS_NOTE =
  'A span points at a surface, a state (by the id of its state definition, not its path), an action, a rule (of a surface or of an action), an invariant, a transition, an event or an entity; their ids are in get_behavior_feature. ' +
  'Effects carry no span of their own (trace the action or the rule that holds the effect), and neither do parameters, exposures, scenarios, reachability goals, personas, resources, constants or acceptance criteria: an item naming one is refused as "No element ... that a span or a candidate can point at". ' +
  'The same list holds for the element_id dispose_candidate takes with accepted or merged.'

/** Pin many modeled elements to the spans they were extracted from, in one call. */
export async function recordSpansHandler(args: RecordSpansArgs, lyriks: LyriksClient): Promise<unknown> {
  return lyriks.post('/api/behavior/analysis', {
    op: 'record_spans',
    projectId: args.project_id,
    featureId: args.feature_id,
    ...(args.source_id ? { sourceId: args.source_id } : {}),
    spans: args.spans.map((s) => ({
      elementId: s.element_id,
      startOffset: s.start_offset,
      endOffset: s.end_offset,
      ...(s.source_id ? { sourceId: s.source_id } : {}),
    })),
  })
}

export interface StageCandidatesArgs {
  project_id: string
  feature_id: string
  source_id?: string
  candidates: Array<{
    start_offset: number
    end_offset: number
    summary: string
    source_id?: string
    kind: string
    confidence?: number
  }>
}

/** The element types the engine stages a candidate as (its `proposedKind`). */
export const CANDIDATE_KINDS = ['surface', 'action', 'rule', 'invariant', 'transition', 'effect', 'state', 'event', 'entity'] as const

/** The decisions that close a staged candidate. */
export const CANDIDATE_DECISIONS = ['accepted', 'rejected', 'merged', 'out_of_scope', 'conflict'] as const

/** Park spans you have spotted but not modeled yet, so nothing is silently dropped. */
export async function stageCandidatesHandler(
  args: StageCandidatesArgs,
  lyriks: LyriksClient,
): Promise<unknown> {
  const answer = await lyriks.post('/api/behavior/analysis', {
    op: 'stage_candidates',
    projectId: args.project_id,
    featureId: args.feature_id,
    ...(args.source_id ? { sourceId: args.source_id } : {}),
    candidates: args.candidates.map((c) => ({
      startOffset: c.start_offset,
      endOffset: c.end_offset,
      summary: c.summary,
      ...(c.source_id ? { sourceId: c.source_id } : {}),
      kind: c.kind,
      ...(c.confidence !== undefined ? { confidence: c.confidence } : {}),
    })),
  })
  return withStagedCandidateIds(answer, args)
}

/** One staged candidate as the answer names it: the id dispose_candidate takes, beside what was sent for it (the platform's own spelling). */
export interface StagedCandidateRow {
  candidateId: string
  kind: string | null
  summary: string | null
  startOffset: number | null
  endOffset: number | null
  sourceId: string | null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Criterion 65c8df6d of feat-mcp-authoring: the ids of the candidates just
 * staged lead the answer, as `created`, so dispose_candidate is called without
 * reading the provenance back. A platform that already sends `created` is
 * relayed as is; for an older one the rows are paired here, from the engine's
 * `results` (one per item, in the order sent, the staged ones carrying their
 * `candidateId`). When those rows do not line up with what was sent, a row keeps
 * only what the engine said rather than pairing an id with the wrong summary.
 */
export function withStagedCandidateIds(answer: unknown, args: StageCandidatesArgs): unknown {
  if (!isRecord(answer) || 'created' in answer || !Array.isArray(answer.results)) return answer
  const rows = answer.results
  const paired = rows.length === args.candidates.length
  const created: StagedCandidateRow[] = []
  rows.forEach((row, index) => {
    if (!isRecord(row) || row.ok !== true || typeof row.candidateId !== 'string') return
    const sent = paired ? args.candidates[index] : undefined
    created.push({
      candidateId: row.candidateId,
      kind: typeof row.proposedKind === 'string' ? row.proposedKind : (sent?.kind ?? null),
      summary: sent?.summary ?? null,
      startOffset: sent?.start_offset ?? null,
      endOffset: sent?.end_offset ?? null,
      sourceId: sent ? (sent.source_id ?? args.source_id ?? null) : null,
    })
  })
  return { created, ...answer }
}

export interface DisposeCandidateArgs {
  project_id: string
  feature_id: string
  candidate_id: string
  disposition?: string
  rationale?: string
  element_id?: string
}

/** Close out a staged candidate: modeled (give `element_id`) or deliberately dropped. */
export async function disposeCandidateHandler(
  args: DisposeCandidateArgs,
  lyriks: LyriksClient,
): Promise<unknown> {
  return lyriks.post('/api/behavior/analysis', {
    op: 'dispose_candidate',
    projectId: args.project_id,
    featureId: args.feature_id,
    candidateId: args.candidate_id,
    ...(args.disposition ? { disposition: args.disposition } : {}),
    ...(args.rationale ? { rationale: args.rationale } : {}),
    ...(args.element_id ? { elementId: args.element_id } : {}),
  })
}

export interface FlagConflictArgs {
  project_id: string
  feature_id: string
  summary: string
  statements: Array<{ source_id: string; statement: string }>
  affected_elements?: string[]
}

/** Record that two sources disagree, instead of silently believing the last one read. */
export async function flagConflictHandler(args: FlagConflictArgs, lyriks: LyriksClient): Promise<unknown> {
  return lyriks.post('/api/behavior/analysis', {
    op: 'flag_conflict',
    projectId: args.project_id,
    featureId: args.feature_id,
    summary: args.summary,
    statements: args.statements.map((s) => ({
      sourceId: s.source_id,
      statement: s.statement,
    })),
    ...(args.affected_elements ? { affectedElements: args.affected_elements } : {}),
  })
}

export interface ResolveConflictArgs {
  project_id: string
  feature_id: string
  conflict_id: string
  status: 'resolved' | 'accepted_ambiguity'
  resolution: string
  resolved_in_favor_of?: string
}

export async function resolveConflictHandler(
  args: ResolveConflictArgs,
  lyriks: LyriksClient,
): Promise<unknown> {
  return lyriks.post('/api/behavior/analysis', {
    op: 'resolve_conflict',
    projectId: args.project_id,
    featureId: args.feature_id,
    conflictId: args.conflict_id,
    status: args.status,
    resolution: args.resolution,
    ...(args.resolved_in_favor_of ? { resolvedInFavorOf: args.resolved_in_favor_of } : {}),
  })
}

/** Close the analysis. Refuses — by design — while any element is untraced. */
export async function finalizeAnalysisHandler(
  args: { project_id: string; feature_id: string },
  lyriks: LyriksClient,
): Promise<unknown> {
  return lyriks.post('/api/behavior/analysis', {
    op: 'finalize',
    projectId: args.project_id,
    featureId: args.feature_id,
  })
}

export async function resetAnalysisHandler(
  args: { project_id: string; feature_id: string },
  lyriks: LyriksClient,
): Promise<unknown> {
  return lyriks.post('/api/behavior/analysis', {
    op: 'reset',
    projectId: args.project_id,
    featureId: args.feature_id,
  })
}

export interface ProvenanceArgs {
  project_id: string
  feature_id: string
  coverage?: boolean
  source_id?: string
}

/** What the model is made of: element → span, open candidates, open conflicts. */
export async function getProvenanceHandler(args: ProvenanceArgs, lyriks: LyriksClient): Promise<unknown> {
  const q = new URLSearchParams({ projectId: args.project_id, featureId: args.feature_id })
  if (args.coverage === true) q.set('coverage', 'true')
  if (args.source_id) q.set('sourceId', args.source_id)
  return lyriks.get(`/api/behavior/provenance?${q.toString()}`)
}
