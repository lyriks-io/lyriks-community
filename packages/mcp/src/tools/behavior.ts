// Behavior-authoring tools: the WRITE half of the unspa vocabulary, folded into
// the authenticated Lyriks MCP so a user never leaves it for the standalone,
// unauthenticated engine (Fix #1). Each op batch is proxied to the wizard app's
// POST /api/behavior/apply, which applies it through the platform's own engine
// (inheriting auth + the residue/merge semantics) and writes the shared kernel
// store — so depth authored here survives a later wizard re-save.

import type { LyriksClient } from '../lyriks-client.js'
import { getPath, summarize } from '../util/shape.js'

export interface ApplyBehaviorBatchArgs {
  project_id: string
  feature_id: string
  operations?: Record<string, unknown>[]
  dry_run?: boolean
  commit?: string
  verbose?: boolean
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
 */
export async function applyBehaviorBatchHandler(
  args: ApplyBehaviorBatchArgs,
  lyriks: LyriksClient,
): Promise<unknown> {
  return lyriks.post('/api/behavior/apply', {
    projectId: args.project_id,
    featureId: args.feature_id,
    operations: args.operations ?? [],
    dryRun: args.dry_run === true,
    ...(args.commit ? { commit: args.commit } : {}),
    // Fix #6: opt into the per-issue verification report (lyriks relays it verbatim).
    ...(args.verbose === true ? { verbose: true } : {}),
  })
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
}

/** Read the canonical feature tree, retaining stable ids for follow-up batches. */
export async function readBehaviorFeatureHandler(
  args: ReadBehaviorFeatureArgs,
  lyriks: LyriksClient,
): Promise<unknown> {
  const q = new URLSearchParams({ projectId: args.project_id, featureId: args.feature_id })
  const result = await lyriks.get(`/api/behavior/feature?${q.toString()}`) as Record<string, unknown>
  if (args.paths?.length) {
    return {
      feature_id: args.feature_id,
      values: Object.fromEntries(args.paths.map((path) => [path, getPath(result, path)])),
    }
  }
  return args.summary ? summarize(result) : result
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

/**
 * Search the running engine's operation reference. Querying keeps responses
 * bounded while making every operation discoverable through this one MCP.
 */
export async function getBehaviorOperationsHandler(
  args: { project_id: string; query?: string },
  lyriks: LyriksClient,
): Promise<unknown> {
  const q = new URLSearchParams({ projectId: args.project_id })
  const result = await lyriks.get(`/api/behavior/operations?${q.toString()}`) as {
    reference?: unknown
  }
  const reference = typeof result.reference === 'string' ? result.reference : ''
  const query = args.query?.trim().toLowerCase()
  if (!query) {
    const headings = reference.split('\n').filter((line) => /^#{1,3}\s/.test(line))
    return {
      headings,
      hint: 'Call again with query set to an operation name or concept for its exact schema and guidance.',
    }
  }
  const lines = reference.split('\n')
  const hits = lines.flatMap((line, index) => line.toLowerCase().includes(query) ? [index] : [])
  const selected = new Set<number>()
  for (const hit of hits.slice(0, 20)) {
    for (let index = Math.max(0, hit - 3); index <= Math.min(lines.length - 1, hit + 10); index += 1) {
      selected.add(index)
    }
  }
  return {
    query: args.query,
    matches: hits.length,
    reference: [...selected].sort((a, b) => a - b).map((index) => lines[index]).join('\n'),
  }
}
