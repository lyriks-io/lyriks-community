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

import type { LyriksClient } from '../lyriks-client.js'

export interface AttachSourceArgs {
  project_id: string
  feature_id: string
  file_name: string
  content: string
  kind?: 'file' | 'code'
  authority?: string
  artifact?: string
}

/** Store a file you read as evidence for one feature's analysis. */
export async function attachSourceHandler(args: AttachSourceArgs, lyriks: LyriksClient): Promise<unknown> {
  return lyriks.post('/api/behavior/sources', {
    projectId: args.project_id,
    featureId: args.feature_id,
    fileName: args.file_name,
    content: args.content,
    ...(args.kind ? { kind: args.kind } : {}),
    ...(args.authority ? { authority: args.authority } : {}),
    ...(args.artifact ? { artifact: args.artifact } : {}),
  })
}

export interface ListSourcesArgs {
  project_id: string
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
  return lyriks.get(`/api/behavior/sources?${q.toString()}`)
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
    kind?: string
    confidence?: number
  }>
}

/** Park spans you have spotted but not modeled yet, so nothing is silently dropped. */
export async function stageCandidatesHandler(
  args: StageCandidatesArgs,
  lyriks: LyriksClient,
): Promise<unknown> {
  return lyriks.post('/api/behavior/analysis', {
    op: 'stage_candidates',
    projectId: args.project_id,
    featureId: args.feature_id,
    ...(args.source_id ? { sourceId: args.source_id } : {}),
    candidates: args.candidates.map((c) => ({
      startOffset: c.start_offset,
      endOffset: c.end_offset,
      summary: c.summary,
      ...(c.source_id ? { sourceId: c.source_id } : {}),
      ...(c.kind ? { kind: c.kind } : {}),
      ...(c.confidence !== undefined ? { confidence: c.confidence } : {}),
    })),
  })
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
  statements?: Array<{ source_id: string; statement: string }>
  affected_elements?: string[]
}

/** Record that two sources disagree, instead of silently believing the last one read. */
export async function flagConflictHandler(args: FlagConflictArgs, lyriks: LyriksClient): Promise<unknown> {
  return lyriks.post('/api/behavior/analysis', {
    op: 'flag_conflict',
    projectId: args.project_id,
    featureId: args.feature_id,
    summary: args.summary,
    ...(args.statements
      ? {
          statements: args.statements.map((s) => ({
            sourceId: s.source_id,
            statement: s.statement,
          })),
        }
      : {}),
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
