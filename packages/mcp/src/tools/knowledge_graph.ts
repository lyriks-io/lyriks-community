// Tool: get_knowledge_graph
// Query the lyriks whole-project knowledge graph (every wizard context + unspa
// behavior folded into one typed node/edge graph — the graph explorer's data).
// → GET /api/graph on lyriks, which owns all scoping logic (domain/graph/scope.ts
//   there); this handler only maps tool args onto query params. A bare call
//   (no scope args) asks for the overview view so the first response stays
//   small: whole-graph stats + the best-connected hub nodes to drill into.

import type { LyriksClient } from '../lyriks-client.js'

export type GraphSource = 'merged' | 'local' | 'engine'

export interface KnowledgeGraphArgs {
  project_id: string
  source?: GraphSource
  contexts?: string[]
  kinds?: string[]
  q?: string
  focus_node?: string
  depth?: number
  limit?: number
}

export async function getKnowledgeGraphHandler(
  args: KnowledgeGraphArgs,
  lyriks: LyriksClient,
): Promise<unknown> {
  const params = new URLSearchParams({ projectId: args.project_id })
  if (args.source) params.set('source', args.source)
  if (args.contexts?.length) params.set('contexts', args.contexts.join(','))
  if (args.kinds?.length) params.set('kinds', args.kinds.join(','))
  if (args.q) params.set('q', args.q)
  if (args.focus_node) params.set('focus', args.focus_node)
  if (args.depth !== undefined) params.set('depth', String(args.depth))
  if (args.limit !== undefined) params.set('limit', String(args.limit))

  const scoped =
    args.contexts?.length || args.kinds?.length || args.q || args.focus_node
  if (!scoped) params.set('view', 'overview')

  return lyriks.get(`/api/graph?${params.toString()}`)
}
