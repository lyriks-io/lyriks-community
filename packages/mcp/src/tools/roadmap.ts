// The roadmap as one aggregate: releases and sprints with derived lifecycle
// and progress, feature statuses joined with implementation coverage, and the
// backlog. Reading it or driving it takes one call each, with no recomputing
// of the dashboard's rules from a raw features section document.

import type { LyriksClient } from '../lyriks-client.js'

export interface GetRoadmapArgs {
  project_id: string
}

/** One aggregate read: what the Roadmap tab shows, plus drift flags. */
export async function getRoadmapHandler(args: GetRoadmapArgs, lyriks: LyriksClient): Promise<unknown> {
  const q = new URLSearchParams({ projectId: args.project_id })
  return lyriks.get(`/api/roadmap?${q.toString()}`)
}

export interface ApplyRoadmapBatchArgs {
  project_id: string
  operations: Array<Record<string, unknown>>
}

/**
 * Typed roadmap mutations, applied atomically by the platform: every cascade
 * the dashboard performs (release removal cleaning its assignments, sprint
 * removal detaching its items) happens server-side, so no dangling rows.
 */
export async function applyRoadmapBatchHandler(
  args: ApplyRoadmapBatchArgs,
  lyriks: LyriksClient,
): Promise<unknown> {
  return lyriks.post('/api/roadmap', {
    projectId: args.project_id,
    operations: args.operations,
  })
}

export interface ReconcileRoadmapArgs {
  project_id: string
  feature_ids?: string[]
}

/** Raise feature statuses to match recorded implementation coverage (never lowers). */
export async function reconcileRoadmapHandler(
  args: ReconcileRoadmapArgs,
  lyriks: LyriksClient,
): Promise<unknown> {
  return lyriks.post('/api/behavior/implementation/reconcile', {
    projectId: args.project_id,
    ...(args.feature_ids ? { featureIds: args.feature_ids } : {}),
  })
}
