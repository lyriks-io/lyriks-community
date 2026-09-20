import type { LyriksClient } from '../lyriks-client.js'

export interface ElaborationArgs {
  project_id: string
  kind?: 'all' | 'question' | 'action'
  section?: string
  include_checks?: boolean
  offset?: number
  limit?: number
  expected_snapshot?: string
}

/** Business findings stay platform-owned; the MCP only forwards focused reads. */
export async function getProjectElaborationHandler(args: ElaborationArgs, lyriks: LyriksClient): Promise<unknown> {
  const query = new URLSearchParams({ projectId: args.project_id })
  if (args.kind) query.set('kind', args.kind)
  if (args.section) query.set('section', args.section)
  if (args.include_checks !== undefined) query.set('includeChecks', String(args.include_checks))
  if (args.offset !== undefined) query.set('offset', String(args.offset))
  if (args.limit !== undefined) query.set('limit', String(args.limit))
  if (args.expected_snapshot) query.set('expectedSnapshot', args.expected_snapshot)
  try { return await lyriks.get(`/api/projects/elaboration?${query}`) }
  catch (error) {
    if (error instanceof Error && /^lyriks 409 on GET \/api\/projects\/elaboration(?:\?|\s)/.test(error.message))
      return { ok: false, reason: 'stale_snapshot', readOnly: true, hint: 'The project changed while paging. Restart from offset 0 without expected_snapshot, then use the new snapshot.key.' }
    throw error
  }
}
