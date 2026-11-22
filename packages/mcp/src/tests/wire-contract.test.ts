/**
 * Tests: the request each relaying tool makes to the platform.
 *
 * Most tools translate an agent's call (snake_case, as the input schema
 * declares it) into one platform request (camelCase, as the route reads it).
 * What can break is that translation: a field the schema does not declare is
 * stripped before the handler sees it, a nested key the route does not read is
 * silently dropped, an optional left undefined becomes a field the route
 * rejects. So every row goes through a real MCP client and the real schema,
 * and pins the request the platform receives: method, path, query and body.
 * Tools with logic of their own are tested where that logic is.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeHttpService, PLATFORM_ORIGIN, connectAgent, serveFetch, type ConnectedAgent, type RecordedRequest } from './support/mcp-harness.js'
import type { BoundOverlay } from '../enterprise/overlay.js'

interface Row {
  tool: string
  /** Proof by the solver is offered on Enterprise only. */
  enterprise?: true
  args: Record<string, unknown>
  /** The request the platform receives; `body` absent means none is sent. */
  sent: { method: string; path: string; body?: unknown }
}

const index = { 'action:a': { status: 'implemented', file: 'a.ts', line: 3, signature: 'const a' } }

const ROWS: Row[] = [
  // Projects and folders.
  {
    tool: 'create_wizard_project',
    args: { name: 'Returnly 2', description: 'RMA portal', workspace_id: 'ws-1', domain_id: 'dom-1', stage: 'build', source_mode: 'code_to_spec' },
    sent: { method: 'POST', path: '/api/projects', body: { name: 'Returnly 2', description: 'RMA portal', workspaceId: 'ws-1', domainId: 'dom-1', stage: 'build', sourceMode: 'code_to_spec' } },
  },
  { tool: 'create_wizard_project', args: { name: 'Solo' }, sent: { method: 'POST', path: '/api/projects', body: { name: 'Solo' } } },
  {
    tool: 'update_wizard_project',
    args: { project_id: 'linkding 2', name: 'linkding', domain_id: null },
    sent: { method: 'PATCH', path: '/api/projects/linkding%202', body: { name: 'linkding', domainId: null } },
  },

  {
    // The exact name confirms a destructive delete.
    tool: 'delete_wizard_project',
    args: { project_id: 'old shop', confirm_name: 'Old shop' },
    sent: { method: 'DELETE', path: '/api/projects/old%20shop', body: { confirmName: 'Old shop' } },
  },
  { tool: 'list_domains', args: {}, sent: { method: 'GET', path: '/api/domains' } },
  { tool: 'create_domain', args: { name: 'Retail', icon: 'lucide:store' }, sent: { method: 'POST', path: '/api/domains', body: { name: 'Retail', icon: 'lucide:store' } } },
  { tool: 'delete_domain', args: { domain_id: 'dom/1' }, sent: { method: 'DELETE', path: '/api/domains/dom%2F1' } },
  { tool: 'describe_section', args: { section: 'glossary' }, sent: { method: 'GET', path: '/api/sections/describe?section=glossary' } },

  // Whole-project completion.
  { tool: 'assess_project_completeness', args: { project_id: 'shop v2' }, sent: { method: 'GET', path: '/api/projects/shop%20v2/completion' } },
  { tool: 'audit_project_scope', args: { project_id: 'shop v2' }, sent: { method: 'POST', path: '/api/projects/shop%20v2/completion', body: { action: 'audit' } } },
  { tool: 'finish_project', args: { project_id: 'shop v2' }, sent: { method: 'POST', path: '/api/projects/shop%20v2/completion', body: { action: 'finish' } } },

  // Behaviour authoring and reads.
  {
    tool: 'apply_behavior_batch',
    args: { project_id: 'p', feature_id: 'f', operations: [{ kind: 'add_state_definition' }], dry_run: true, verbose: true, expected_updated_at: '2026-09-20T08:00:00.000Z' },
    sent: { method: 'POST', path: '/api/behavior/apply', body: { projectId: 'p', featureId: 'f', operations: [{ kind: 'add_state_definition' }], dryRun: true, verbose: true, expectedUpdatedAt: '2026-09-20T08:00:00.000Z' } },
  },
  {
    // A commit token saves a dry run without resending its operations.
    tool: 'apply_behavior_batch',
    args: { project_id: 'p', feature_id: 'f', commit: 'tok-123', expected_updated_at: '' },
    sent: { method: 'POST', path: '/api/behavior/apply', body: { projectId: 'p', featureId: 'f', operations: [], dryRun: false, commit: 'tok-123' } },
  },
  {
    // A wizard journey, step or screen id resolves to the kernel ids a batch needs.
    tool: 'get_behavior_context',
    args: { project_id: 'shop', journey_id: 'j-checkout', step_id: 's-pay', screen_id: 'scr-cart' },
    sent: { method: 'GET', path: '/api/behavior/context?projectId=shop&journeyId=j-checkout&stepId=s-pay&screenId=scr-cart' },
  },
  { tool: 'assess_behavior_feature', args: { project_id: 'shop', feature_id: 'feat-cart' }, sent: { method: 'GET', path: '/api/features/behavior?projectId=shop&featureId=feat-cart' } },
  {
    tool: 'score_behavior_feature',
    args: { project_id: 'p', feature_id: 'f', area: 'scenarios', severity: 'critical' },
    sent: { method: 'GET', path: '/api/behavior/score?projectId=p&featureId=f&includeIssues=true&area=scenarios&severity=critical' },
  },
  {
    tool: 'simulate_behavior',
    args: { project_id: 'p1', feature_id: 'draft:abc', steps: [{ actionRef: 'checkout', parameters: { $channel: 'webmcp' } }], operations: [{ kind: 'add_surface', ref: 'cart' }], persona_id: 'buyer', stop_on_blocked: true },
    sent: { method: 'POST', path: '/api/behavior/simulate', body: { projectId: 'p1', featureId: 'draft:abc', steps: [{ actionRef: 'checkout', parameters: { $channel: 'webmcp' } }], operations: [{ kind: 'add_surface', ref: 'cart' }], personaId: 'buyer', stopOnBlocked: true } },
  },
  {
    // A full simulation without steps: every scenario and a bounded model check.
    tool: 'simulate_behavior',
    args: { project_id: 'p1', feature_id: 'f1', operations: [], run_scenarios: true, model_check: { max_depth: 4 } },
    sent: { method: 'POST', path: '/api/behavior/simulate', body: { projectId: 'p1', featureId: 'f1', runScenarios: true, modelCheck: { maxDepth: 4 } } },
  },
  {
    tool: 'what_if',
    enterprise: true,
    args: { project_id: 'p1', feature_id: 'draft:abc', operations: [{ kind: 'remove_action_rule', ruleId: 'r1' }] },
    sent: { method: 'POST', path: '/api/behavior/what-if', body: { projectId: 'p1', featureId: 'draft:abc', operations: [{ kind: 'remove_action_rule', ruleId: 'r1' }] } },
  },
  {
    tool: 'what_if',
    enterprise: true,
    args: { project_id: 'p1', feature_id: 'draft:abc', max_steps: 4 },
    sent: { method: 'POST', path: '/api/behavior/what-if', body: { projectId: 'p1', featureId: 'draft:abc', maxSteps: 4 } },
  },
  {
    tool: 'apply_project_behavior_batch',
    args: { project_id: 'p1', operations: [{ kind: 'add_project_invariant' }], dry_run: true },
    sent: { method: 'POST', path: '/api/behavior/project', body: { projectId: 'p1', operations: [{ kind: 'add_project_invariant' }], dryRun: true } },
  },
  { tool: 'get_behavior_project', args: { project_id: 'p1' }, sent: { method: 'GET', path: '/api/behavior/project?projectId=p1' } },
  {
    tool: 'find_state_references',
    args: { project_id: 'p1', feature_id: 'f1', state_path: 'cart.items' },
    sent: { method: 'GET', path: '/api/behavior/references?projectId=p1&featureId=f1&statePath=cart.items' },
  },
  { tool: 'generate_behavior_types', args: { project_id: 'p1', feature_id: 'f1' }, sent: { method: 'GET', path: '/api/behavior/types?projectId=p1&featureId=f1' } },

  // Data model links.
  {
    tool: 'get_data_links',
    args: { project_id: 'shop', table: 'Order', unlinked_only: true, offset: 60, limit: 30 },
    sent: { method: 'GET', path: '/api/draft/data/links?projectId=shop&table=Order&unlinked=1&offset=60&limit=30' },
  },
  {
    // A null path takes a link back; `also` adds a further carrier.
    tool: 'link_data_fields',
    args: {
      project_id: 'shop',
      links: [
        { table: 'Order', field: 'status', state_path: 'order.status' },
        { table: 'Order', field: 'total', state_path: null },
        { table: 'Order', field: 'status', state_path: 'shipping.order.status', also: true },
      ],
      existence: [{ table: 'Order', state_path: 'order.placed' }],
    },
    sent: {
      method: 'POST',
      path: '/api/draft/data/links',
      body: {
        projectId: 'shop',
        links: [
          { table: 'Order', field: 'status', statePath: 'order.status' },
          { table: 'Order', field: 'total', statePath: null },
          { table: 'Order', field: 'status', statePath: 'shipping.order.status', also: true },
        ],
        existence: [{ table: 'Order', statePath: 'order.placed' }],
      },
    },
  },

  // Design system.
  { tool: 'get_design_system', args: { project_id: 'kutt c76982' }, sent: { method: 'GET', path: '/api/projects/kutt%20c76982/design-system' } },
  {
    tool: 'check_design',
    args: { project_id: 'kutt', colors: [{ name: 'Button', value: '#2094F3' }], sizes: [{ kind: 'radius', px: 12 }] },
    sent: { method: 'POST', path: '/api/projects/kutt/design-system/check', body: { colors: [{ name: 'Button', value: '#2094F3' }], sizes: [{ kind: 'radius', px: 12 }] } },
  },
  { tool: 'check_design', args: { project_id: 'kutt', colors: [{ value: '#fff' }] }, sent: { method: 'POST', path: '/api/projects/kutt/design-system/check', body: { colors: [{ value: '#fff' }], sizes: [] } } },

  // Code to spec: sources, spans, analysis.
  {
    tool: 'attach_source',
    args: { project_id: 'p1', feature_id: 'f1', file_name: 'Workflow.md', content: 'Between 2 and 12 statuses.', kind: 'file', register_id: 'src-fs-projects' },
    sent: { method: 'POST', path: '/api/behavior/sources', body: { projectId: 'p1', featureId: 'f1', fileName: 'Workflow.md', content: 'Between 2 and 12 statuses.', kind: 'file', registerId: 'src-fs-projects' } },
  },
  {
    tool: 'attach_source',
    args: { project_id: 'p', feature_id: 'f', file_name: 'a.ts', content: '' },
    sent: { method: 'POST', path: '/api/behavior/sources', body: { projectId: 'p', featureId: 'f', fileName: 'a.ts', content: '' } },
  },
  {
    tool: 'cite_passages',
    args: { project_id: 'taskora-d8c2d8', passages: [{ source_id: 'src-fs-projects', anchor: 'feature:feat-tkr-workflow', words: 'between 2 and 12 statuses', takes: 'The limit of statuses a workflow holds.' }] },
    sent: { method: 'POST', path: '/api/projects/taskora-d8c2d8/passages', body: { passages: [{ sourceId: 'src-fs-projects', anchor: 'feature:feat-tkr-workflow', words: 'between 2 and 12 statuses', takes: 'The limit of statuses a workflow holds.' }] } },
  },
  { tool: 'list_sources', args: { project_id: 'proj-1' }, sent: { method: 'GET', path: '/api/behavior/sources?projectId=proj-1' } },
  {
    tool: 'list_sources',
    args: { project_id: 'proj-1', source_id: 's-1', offset: 10, max_chars: 500 },
    sent: { method: 'GET', path: '/api/behavior/sources?projectId=proj-1&sourceId=s-1&offset=10&maxChars=500' },
  },
  {
    tool: 'record_element_spans',
    args: { project_id: 'proj-1', feature_id: 'feat-1', source_id: 's-1', spans: [{ element_id: 'act-1', start_offset: 0, end_offset: 42 }, { element_id: 'rule-2', start_offset: 50, end_offset: 90, source_id: 's-2' }] },
    sent: {
      method: 'POST',
      path: '/api/behavior/analysis',
      body: { op: 'record_spans', projectId: 'proj-1', featureId: 'feat-1', sourceId: 's-1', spans: [{ elementId: 'act-1', startOffset: 0, endOffset: 42 }, { elementId: 'rule-2', startOffset: 50, endOffset: 90, sourceId: 's-2' }] },
    },
  },
  {
    // A confidence of 0 is a value, not a missing field.
    tool: 'stage_candidates',
    args: { project_id: 'p', feature_id: 'f', candidates: [{ start_offset: 1, end_offset: 2, summary: 'retry loop', kind: 'rule', confidence: 0 }] },
    sent: { method: 'POST', path: '/api/behavior/analysis', body: { op: 'stage_candidates', projectId: 'p', featureId: 'f', candidates: [{ startOffset: 1, endOffset: 2, summary: 'retry loop', kind: 'rule', confidence: 0 }] } },
  },
  {
    tool: 'flag_conflict',
    args: { project_id: 'p', feature_id: 'f', summary: 'docs say 3 retries, code does 5', statements: [{ source_id: 's-doc', statement: '3 retries' }, { source_id: 's-code', statement: '5 retries' }] },
    sent: {
      method: 'POST',
      path: '/api/behavior/analysis',
      body: { op: 'flag_conflict', projectId: 'p', featureId: 'f', summary: 'docs say 3 retries, code does 5', statements: [{ sourceId: 's-doc', statement: '3 retries' }, { sourceId: 's-code', statement: '5 retries' }] },
    },
  },
  {
    tool: 'classify_source',
    args: { project_id: 'p', source_id: 's-1', artifact: 'test' },
    sent: { method: 'PATCH', path: '/api/behavior/sources', body: { projectId: 'p', sourceId: 's-1', classification: { artifact: 'test' } } },
  },
  { tool: 'remove_source', args: { project_id: 'p', source_id: 's-1' }, sent: { method: 'DELETE', path: '/api/behavior/sources?projectId=p&sourceId=s-1' } },
  {
    tool: 'dispose_candidate',
    args: { project_id: 'p', feature_id: 'f', candidate_id: 'c-1', disposition: 'merged', element_id: 'act-1' },
    sent: { method: 'POST', path: '/api/behavior/analysis', body: { op: 'dispose_candidate', projectId: 'p', featureId: 'f', candidateId: 'c-1', disposition: 'merged', elementId: 'act-1' } },
  },
  {
    tool: 'resolve_conflict',
    args: { project_id: 'p', feature_id: 'f', conflict_id: 'k-1', status: 'resolved', resolution: 'The code is newer.', resolved_in_favor_of: 's-code' },
    sent: { method: 'POST', path: '/api/behavior/analysis', body: { op: 'resolve_conflict', projectId: 'p', featureId: 'f', conflictId: 'k-1', status: 'resolved', resolution: 'The code is newer.', resolvedInFavorOf: 's-code' } },
  },
  { tool: 'reset_analysis', args: { project_id: 'p', feature_id: 'f' }, sent: { method: 'POST', path: '/api/behavior/analysis', body: { op: 'reset', projectId: 'p', featureId: 'f' } } },
  { tool: 'finalize_analysis', args: { project_id: 'p', feature_id: 'f' }, sent: { method: 'POST', path: '/api/behavior/analysis', body: { op: 'finalize', projectId: 'p', featureId: 'f' } } },
  { tool: 'get_provenance', args: { project_id: 'p', feature_id: 'f' }, sent: { method: 'GET', path: '/api/behavior/provenance?projectId=p&featureId=f' } },
  { tool: 'get_provenance', args: { project_id: 'p', feature_id: 'f', coverage: true }, sent: { method: 'GET', path: '/api/behavior/provenance?projectId=p&featureId=f&coverage=true' } },

  // Implementation index.
  {
    // Seeding reads entries out; it writes no index anywhere.
    tool: 'seed_implementation_index',
    args: { project_id: 'proj-1', feature_id: 'feat-1' },
    sent: { method: 'GET', path: '/api/behavior/implementation/index?projectId=proj-1&featureId=feat-1' },
  },
  { tool: 'sync_implementation_index', args: { project_id: 'proj-1', index }, sent: { method: 'POST', path: '/api/behavior/implementation/index', body: { projectId: 'proj-1', index } } },
  {
    // The index travels in the body, never in a query string.
    tool: 'get_implementation_gaps',
    args: { project_id: 'proj-1', feature_id: 'feat-1', index },
    sent: { method: 'POST', path: '/api/behavior/implementation/gaps', body: { projectId: 'proj-1', index, featureId: 'feat-1' } },
  },
  { tool: 'get_implementation_drift', args: { project_id: 'proj-1', index }, sent: { method: 'POST', path: '/api/behavior/implementation/drift', body: { projectId: 'proj-1', index } } },
  {
    tool: 'get_implementation_drift',
    args: { project_id: 'proj-1', index, feature_id: 'feat-1' },
    sent: { method: 'POST', path: '/api/behavior/implementation/drift', body: { projectId: 'proj-1', index, featureId: 'feat-1' } },
  },
  {
    tool: 'report_implementation_status',
    args: { project_id: 'p', feature_id: 'f', action_id: 'act-1', found_entities: [{ entity_type: 'action', entity_id: 'act-1', locations: [{ file: 'a.ts', line: 12, snippet: 'const a' }] }] },
    sent: {
      method: 'POST',
      path: '/api/behavior/implementation/status',
      body: { projectId: 'p', featureId: 'f', actionId: 'act-1', foundEntities: [{ entityType: 'action', entityId: 'act-1', locations: [{ file: 'a.ts', line: 12, snippet: 'const a' }] }] },
    },
  },
  {
    // The batch form sends its entries, never a single-scope payload beside them.
    tool: 'report_implementation_status',
    args: { project_id: 'p', feature_id: 'f', entries: [{ surface_id: 'surf-1', found_entities: [{ entity_type: 'state', entity_id: 'st-1', locations: [{ file: 's.ts', snippet: 's' }] }] }] },
    sent: {
      method: 'POST',
      path: '/api/behavior/implementation/status',
      body: { projectId: 'p', featureId: 'f', entries: [{ surfaceId: 'surf-1', foundEntities: [{ entityType: 'state', entityId: 'st-1', locations: [{ file: 's.ts', snippet: 's' }] }] }] },
    },
  },
]

/** A request as a comparable value: the query as a map, so parameter order does not matter. */
const asSent = (r: { method: string; path: string; body?: unknown }) => {
  const url = new URL(r.path, PLATFORM_ORIGIN)
  return { method: r.method, pathname: url.pathname, query: Object.fromEntries(url.searchParams), body: r.body }
}

/** An Enterprise overlay that adds nothing: the rows here only need the edition's gate open. */
const enterpriseEdition = {
  portfolio: {
    listWorkspaces: async () => ({}),
    listProjects: async () => ({}),
    getProject: async () => ({}),
    createProject: async () => ({}),
    updateProject: async () => ({}),
    deleteProject: async () => ({}),
    annotateWizardPortfolio: async (portfolio: unknown) => portfolio,
  },
  registerTools: () => {},
} satisfies BoundOverlay

let platform: FakeHttpService
let community: ConnectedAgent
let enterprise: ConnectedAgent

beforeAll(async () => {
  community = await connectAgent({ token: 'agent-token' })
  enterprise = await connectAgent({ token: 'agent-token', ee: enterpriseEdition })
})
afterAll(async () => {
  await community.close()
  await enterprise.close()
  vi.unstubAllGlobals()
})
beforeEach(() => {
  platform = new FakeHttpService(PLATFORM_ORIGIN)
  serveFetch(platform)
})

describe('each relaying tool sends the platform route the fields it reads', () => {
  it.each(ROWS.map((row, i) => [`${row.tool} #${i}`, row] as const))('%s', async (_name, row) => {
    const pathname = new URL(row.sent.path, PLATFORM_ORIGIN).pathname
    platform.on(row.sent.method, pathname, { ok: true })

    const answer = await (row.enterprise ? enterprise : community).call(row.tool, row.args)

    expect(answer.isError, answer.text).toBe(false)
    expect(platform.requests.map((r: RecordedRequest) => asSent(r))).toEqual([asSent(row.sent)])
  })

  it('presents the caller\'s session and says an AI client is acting', async () => {
    platform.on('GET', '/api/behavior/project', { ok: true })
    await community.call('get_behavior_project', { project_id: 'p1' })
    const [request] = platform.requests
    expect(request.headers.get('cookie')).toBe('lyriks_session=agent-token')
    expect(request.headers.get('x-lyriks-actor')).toBe('ai_client')
  })
})
