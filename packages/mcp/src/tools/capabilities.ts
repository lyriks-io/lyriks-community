import type { LyriksClient } from '../lyriks-client.js'

export async function getCapabilitiesHandler(
  args: { project_id: string; source?: string; query?: string; offset?: number; limit?: number },
  lyriks: LyriksClient,
): Promise<unknown> {
  const result = await lyriks.get(`/api/draft/users/capabilities?projectId=${encodeURIComponent(args.project_id)}`) as { capabilities?: Array<{ capabilityId: string; label: string; capabilitySource: string }> }
  const query = args.query?.trim().toLowerCase() ?? ''
  const rows = (result.capabilities ?? []).filter(row =>
    (!args.source || row.capabilitySource === args.source) &&
    (!query || row.capabilityId.toLowerCase().includes(query) || row.label.toLowerCase().includes(query))
  ).sort((a, b) => a.capabilityId.localeCompare(b.capabilityId))
  const offset = args.offset ?? 0
  const capabilities = rows.slice(offset, offset + (args.limit ?? 30))
  return { projectId: args.project_id, capabilities, total: rows.length, offset,
    nextOffset: offset + capabilities.length < rows.length ? offset + capabilities.length : null }
}
