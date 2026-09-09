import type { LyriksClient } from '../lyriks-client.js'

const path = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/completion`

export function assessProjectCompletenessHandler(
  args: { project_id: string },
  lyriks: LyriksClient,
): Promise<unknown> {
  return lyriks.get(path(args.project_id))
}

export function assessPortfolioCompletenessHandler(
  _args: unknown,
  lyriks: LyriksClient,
): Promise<unknown> {
  return lyriks.get('/api/projects/completion')
}

export function auditProjectScopeHandler(
  args: { project_id: string },
  lyriks: LyriksClient,
): Promise<unknown> {
  return lyriks.post(path(args.project_id), { action: 'audit' })
}

export function finishProjectHandler(
  args: { project_id: string },
  lyriks: LyriksClient,
): Promise<unknown> {
  return lyriks.post(path(args.project_id), { action: 'finish' })
}
