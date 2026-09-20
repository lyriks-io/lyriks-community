import { getPath, summarize } from './shape.js'

export interface PortfolioReadOptions {
  query?: string
  workspace_id?: string
  offset?: number
  limit?: number
  summary?: boolean
  paths?: string[]
}

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

/** Project discovery must retain names and ids even when full cards exceed the MCP cap. */
export function readPortfolio(value: unknown, options: PortfolioReadOptions = {}): unknown {
  const source = record(value)
  if (options.paths?.length) return { selected: Object.fromEntries(options.paths.map(path => [path, getPath(value, path)])) }
  if (options.summary) return { summary: summarize(source) }
  if (!source.portfolio) return value
  const portfolio = record(source.portfolio)
  const domains = Array.isArray(portfolio.domains) ? portfolio.domains.map(record) : []
  const unassigned = Array.isArray(portfolio.unassigned) ? portfolio.unassigned : []
  const rows = [
    ...domains.flatMap(domain => (Array.isArray(domain.projects) ? domain.projects : []).map(card => ({ card: record(card), domain }))),
    ...unassigned.map(card => ({ card: record(card), domain: null })),
  ]
  const query = options.query?.trim().toLowerCase() ?? ''
  const unique = new Map<string, typeof rows[number]>()
  for (const row of rows) {
    const { card } = row
    if (typeof card.id !== 'string') continue
    if (options.workspace_id && (card.workspaceId ?? card.workspace_id) !== options.workspace_id) continue
    if (query && ![card.id, card.name].some(v => typeof v === 'string' && v.toLowerCase().includes(query))) continue
    if (!unique.has(card.id)) unique.set(card.id, row)
  }
  const matches = [...unique.values()].sort((a, b) => String(a.card.id).localeCompare(String(b.card.id)))
  const offset = Number.isSafeInteger(options.offset) ? Math.max(0, options.offset!) : 0
  const limit = Number.isSafeInteger(options.limit) ? Math.max(1, Math.min(50, options.limit!)) : 20
  const page = matches.slice(offset, offset + limit)
  const compact = (card: Record<string, unknown>) => Object.fromEntries(
    ['id', 'name', 'description', 'stage', 'sourceMode', 'workspaceId', 'workspace_id', 'backProjectId']
      .filter(key => card[key] !== undefined && (card[key] === null || typeof card[key] !== 'object'))
      .map(key => [key, (key === 'description' || key === 'name') && typeof card[key] === 'string' ? card[key].slice(0, 300) : card[key]])
  )
  const selectedDomains = [...new Set(page.flatMap(row => row.domain ? [row.domain] : []))]
  return {
    portfolio: {
      domains: selectedDomains.map(domain => ({ id: domain.id, name: domain.name, projects: page.filter(row => row.domain === domain).map(row => compact(row.card)) })),
      unassigned: page.filter(row => !row.domain).map(row => compact(row.card)),
    },
    total: matches.length,
    returned: page.length,
    offset,
    nextOffset: offset + page.length < matches.length ? offset + page.length : null,
    hint: 'Compact discovery cards. Continue with offset:nextOffset; use query to find a name/id, or get_project for full details. paths reads exact subtrees of the original portfolio.',
  }
}
