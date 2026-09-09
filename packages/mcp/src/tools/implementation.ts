// The spec↔code map: which spec element lives where in the codebase, how much
// of the spec is implemented, and which entries were audited against a spec
// that has since moved.
//
// The map itself is `.unspa.json` in YOUR checkout — the platform never stores a
// copy and never reads one. So `seed_implementation_index` hands you entries to
// write, and every reading tool takes the index back as an argument. One index,
// in the repo, versioned with the code it describes.

import type { LyriksClient } from '../lyriks-client.js'

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
}

/** Push coverage for a whole project from the index you hold. */
export async function syncIndexHandler(args: SyncIndexArgs, lyriks: LyriksClient): Promise<unknown> {
  return lyriks.post('/api/behavior/implementation/index', {
    projectId: args.project_id,
    index: args.index,
  })
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

export interface DriftArgs {
  project_id: string
  index: Record<string, unknown>
  feature_id?: string
}

/** Entries audited against an older spec than the one now in the kernel. */
export async function driftHandler(args: DriftArgs, lyriks: LyriksClient): Promise<unknown> {
  return lyriks.post('/api/behavior/implementation/drift', {
    projectId: args.project_id,
    index: args.index,
    ...(args.feature_id ? { featureId: args.feature_id } : {}),
  })
}
