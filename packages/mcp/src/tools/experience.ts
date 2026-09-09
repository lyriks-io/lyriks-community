// Experience-prototype loop tools: the "verify" half that complements the
// authoring tools (build_screen / patch_section). Both hit read-only lyriks
// endpoints — coverage GETs the readiness report, simulate POSTs a scripted run
// — so an AI can author a screen, prove the flow behaves, read the remaining
// gaps, and patch exactly those, all without pulling the whole builder tree.

import type { LyriksClient } from '../lyriks-client.js'

export async function getExperienceCoverageHandler(
  args: { project_id: string },
  lyriks: LyriksClient,
): Promise<unknown> {
  return lyriks.get(`/api/draft/experience/coverage?projectId=${encodeURIComponent(args.project_id)}`)
}

export async function verifyExperienceHandler(
  args: {
    project_id: string
    gap_severity?: 'critical' | 'recommended'
    gap_limit?: number
    gap_offset?: number
  },
  lyriks: LyriksClient,
): Promise<unknown> {
  const params = new URLSearchParams({ projectId: args.project_id })
  if (args.gap_severity) params.set('gapSeverity', args.gap_severity)
  if (typeof args.gap_limit === 'number') params.set('gapLimit', String(args.gap_limit))
  if (typeof args.gap_offset === 'number') params.set('gapOffset', String(args.gap_offset))
  return lyriks.get(`/api/draft/experience/verify?${params.toString()}`)
}

export async function importDataCollectionsHandler(
  args: { project_id: string; entity_names?: string[]; refresh?: boolean },
  lyriks: LyriksClient,
): Promise<unknown> {
  return lyriks.post('/api/draft/experience/import-collections', {
    projectId: args.project_id,
    entityNames: Array.isArray(args.entity_names) ? args.entity_names : undefined,
    refresh: args.refresh === true ? true : undefined,
  })
}

export interface TargetMapArg {
  routes?: Record<string, string>
  selectors?: Record<string, string>
  observables?: Record<string, { kind: string; value?: string; selector?: string }>
}

export async function generateAcceptanceTestsHandler(
  args: { project_id: string; target_map?: TargetMapArg },
  lyriks: LyriksClient,
): Promise<unknown> {
  if (args.target_map)
    return lyriks.post('/api/draft/experience/acceptance-tests', {
      projectId: args.project_id,
      map: args.target_map,
    })
  return lyriks.get(`/api/draft/experience/acceptance-tests?projectId=${encodeURIComponent(args.project_id)}`)
}

export async function generateRepoScaffoldHandler(
  args: { project_id: string; target_map?: TargetMapArg },
  lyriks: LyriksClient,
): Promise<unknown> {
  if (args.target_map)
    return lyriks.post('/api/draft/experience/repo-scaffold', {
      projectId: args.project_id,
      map: args.target_map,
    })
  return lyriks.get(`/api/draft/experience/repo-scaffold?projectId=${encodeURIComponent(args.project_id)}`)
}

export interface SimActionArg {
  nodeId?: string
  label?: string
  screenId?: string
  trigger?: string
  type?: string
  rowIndex?: number
  tab?: number
  expectError?: boolean
}

export async function simulateExperienceHandler(
  args: {
    project_id: string
    persona_id?: string
    start_screen_id?: string
    actions?: SimActionArg[]
  },
  lyriks: LyriksClient,
): Promise<unknown> {
  return lyriks.post('/api/draft/experience/simulate', {
    projectId: args.project_id,
    personaId: args.persona_id ?? null,
    startScreenId: args.start_screen_id ?? null,
    actions: Array.isArray(args.actions) ? args.actions : [],
  })
}
