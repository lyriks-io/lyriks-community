/**
 * Tests: McpServer registration + tool listing
 * SV01 to SV06  createMcpServer with an overlay: the five Enterprise tools registered
 */

import { describe, it, expect, vi } from 'vitest'
import { z }                        from 'zod'
import { Client }                   from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport }        from '@modelcontextprotocol/sdk/inMemory.js'
import { createMcpServer, MAKE_OR_QUALIFY } from '../server.js'
import type { BoundOverlay }         from '../enterprise/overlay.js'

/** A bound overlay the way the Enterprise one behaves: it registers the five tools itself. */
function makeClient(): BoundOverlay {
  return {
    portfolio: {
      listWorkspaces: vi.fn(),
      listProjects: vi.fn(),
      getProject: vi.fn(),
      createProject: vi.fn(),
      updateProject: vi.fn(),
      deleteProject: vi.fn(),
      annotateWizardPortfolio: vi.fn(async (portfolio) => portfolio),
    },
    registerTools: (mcp) => {
      for (const name of ['get_model', 'get_view', 'find_inconsistencies', 'apply_rule', 'generate_artifact'])
        mcp.tool(name, { project_id: z.string() }, async () => ({ content: [] }))
    },
  }
}

describe('createMcpServer', () => {
  it('preserves expected revisions in both public write schemas', () => {
    const server = createMcpServer(makeClient())
    // @ts-expect-error testing registered wire schemas
    const registered = server._registeredTools
    for (const name of ['set_section', 'patch_section']) {
      const parsed = registered[name].inputSchema.parse({ project_id: 'p', section: 'documents',
        document: {}, operations: [{ op: 'set', path: 'sources', value: [] }], expected_revision: 7 })
      expect(parsed.expected_revision).toBe(7)
    }
  })

  it('rejects retired operator sections in every public section schema and keeps Baselines', () => {
    const server = createMcpServer(makeClient())
    // @ts-expect-error testing registered wire schemas
    const tools = server._registeredTools
    for (const name of ['describe_section', 'get_section', 'set_section', 'patch_section']) {
      const args = { project_id: 'p', document: {}, operations: [{ op: 'set', path: 'activeTab', value: 'snapshots' }], section: 'baselines' }
      expect(tools[name].inputSchema.safeParse(args).success, name).toBe(true)
      for (const section of ['supervision', 'finops', 'contract', 'generation', 'evolution'])
        expect(tools[name].inputSchema.safeParse({ ...args, section }).success, name).toBe(false)
    }
  })

  it('advertises read-only elaboration with bounded paging', () => {
    const server = createMcpServer(makeClient())
    // @ts-expect-error testing registered wire schemas
    const tool = server._registeredTools.get_project_elaboration
    expect(tool.inputSchema.parse({ project_id: 'p', kind: 'question', include_checks: false, expected_snapshot: 'version', limit: 5 })).toMatchObject({ kind: 'question', include_checks: false, expected_snapshot: 'version', limit: 5 })
    expect(() => tool.inputSchema.parse({ project_id: 'p', limit: 21 })).toThrow()
    expect(tool.annotations.readOnlyHint).toBe(true)
  })

  it('retains patch dry_run and allows removals without a dummy value', () => {
    const server = createMcpServer(makeClient())
    // @ts-expect-error testing registered wire schemas
    const tool = server._registeredTools.patch_section
    expect(tool.inputSchema.parse({ project_id: 'p', section: 'experience', dry_run: true, operations: [{ op: 'remove', path: 'builder.nodes.old' }] })).toMatchObject({ dry_run: true, operations: [{ op: 'remove' }] })
  })

  it('advertises the incremental patch ops and refuses an unknown one', () => {
    const server = createMcpServer(makeClient())
    // @ts-expect-error testing registered wire schemas
    const tool = server._registeredTools.patch_section
    const operations = [
      { op: 'add_to_set', collection: 'features', id: 'feat-1', path: 'sourceIds', value: 'doc-2' },
      { op: 'remove_from_set', path: 'tags', value: 3 },
      { op: 'append_text', path: 'brief', value: 'One more paragraph.', separator: ' ' },
      { op: 'replace_text', path: 'brief', find: '3 days', value: '5 days' },
    ]
    expect(tool.inputSchema.parse({ project_id: 'p', section: 'features', operations }).operations).toEqual(operations)
    expect(tool.inputSchema.safeParse({ project_id: 'p', section: 'features', operations: [{ op: 'append', path: 'brief', value: 'x' }] }).success).toBe(false)
    for (const op of ['add_to_set', 'remove_from_set', 'append_text', 'replace_text']) expect(tool.description).toContain(`op:"${op}"`)
    expect(tool.description).toContain('writeGuard')
    expect(tool.description).toContain('dryRunUnavailable')
  })

  it('advertises feature selection by id, drift paging and the verbose sync answer', () => {
    const server = createMcpServer(makeClient())
    // @ts-expect-error testing registered wire schemas
    const tools = server._registeredTools
    expect(tools.get_behavior_feature.inputSchema.parse({ project_id: 'p', feature_id: 'f', summary: true, surface_id: 's', action_id: 'a' }))
      .toMatchObject({ summary: true, surface_id: 's', action_id: 'a' })
    const drift = tools.get_implementation_drift.inputSchema
    expect(drift.parse({ project_id: 'p', index: {}, bucket: 'orphans', limit: 200, offset: 50 })).toMatchObject({ bucket: 'orphans', limit: 200, offset: 50 })
    expect(drift.safeParse({ project_id: 'p', index: {}, limit: 201 }).success).toBe(false)
    expect(drift.safeParse({ project_id: 'p', index: {}, bucket: 'healed' }).success).toBe(false)
    expect(tools.get_implementation_drift.description).toContain('unrelated to the `stale` block of sync_implementation_index')
    expect(tools.sync_implementation_index.inputSchema.parse({ project_id: 'p', index: {}, verbose: true })).toMatchObject({ verbose: true })
    expect(tools.sync_implementation_index.description).toContain('PARTIAL INDEX')
    expect(tools.get_behavior_context.description).toContain('LEAF features')
  })

  // Two texts an agent loads together used to disagree: the instructions sent
  // every change to Evolution, the repository binding said spec then code now.
  it('states one rule for a change to make versus a change to qualify, where a client reads it', async () => {
    const server = createMcpServer(makeClient())
    const client = new Client({ name: 'instructions-check', version: '0' })
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(serverSide), client.connect(clientSide)])
    const instructions = client.getInstructions() ?? ''
    const { tools } = await client.listTools()
    await client.close()

    expect(instructions).toContain(MAKE_OR_QUALIFY)
    expect(instructions).toContain('lyriks-evolution to QUALIFY a change to an existing product, not to make it')
    // The sentence that claimed every change for Evolution is gone.
    expect(instructions).not.toContain('when the user asks for a change to an existing product')
    for (const phrase of [
      'A change to MAKE now, in a repository bound to its Lyriks project, is a direct spec change',
      'in the same turn: never an Evolution request',
      'ask in one sentence which of the two is wanted',
      'never choose silently',
      'Evolution is for a change someone asks to QUALIFY',
      'a decision that belongs to someone else (a product owner, reviewers)',
      'Evolution never writes the sections',
    ]) expect(MAKE_OR_QUALIFY, phrase).toContain(phrase)
    // What the rule sends the agent to must exist.
    const names = new Set(tools.map((t) => t.name))
    for (const name of ['apply_behavior_batch', 'patch_section', 'build_screen', 'wire_element']) {
      expect(MAKE_OR_QUALIFY).toContain(name)
      expect(names.has(name), name).toBe(true)
    }
    // Claude Code shows the first 2048 characters of the instructions: the two
    // sentences an agent acts on (make it directly, ask when unclear) land before that.
    const acted = instructions.indexOf('never choose silently') + 'never choose silently'.length
    expect(acted).toBeGreaterThan(0)
    expect(acted).toBeLessThanOrEqual(2048)
    // The neighbours of the rewritten sentence still say what they said.
    for (const kept of ['PLANS WITHOUT BUILDING', 'SPEC CHANGE FIRST', 'THE CONVERSATION STAYS BOUND TO ITS PROJECT', 'lyriks-delivery step 4'])
      expect(instructions).toContain(kept)
    for (const name of ['get_evolution', 'apply_evolution_batch'])
      expect(tools.find((t) => t.name === name)?.description, name).toContain(MAKE_OR_QUALIFY)
  })

  // Field agents asked for tools the graph already is; the recipes only name arguments it accepts.
  it('spells out the two graph recipes with arguments the tool accepts', () => {
    const server = createMcpServer(makeClient())
    // @ts-expect-error testing registered wire schemas
    const tool = server._registeredTools.get_knowledge_graph
    expect(tool.description).toContain('FIND THE FEATURE THAT OWNS A WORD: q:"<word>"')
    expect(tool.description).toContain('focus_node:"<hit id>", depth:2, kinds:["feature"]')
    expect(tool.description).toContain('WHO READS OR WRITES A STATE PATH: focus_node:"state:<dotted.path>", depth:1')
    expect(tool.description).toContain('Acceptance criteria are not in the graph')
    expect(tool.inputSchema.parse({ project_id: 'p', q: 'refund', focus_node: 'state:cart.total', depth: 2, kinds: ['feature'] }))
      .toMatchObject({ q: 'refund', focus_node: 'state:cart.total', depth: 2, kinds: ['feature'] })
    // One way only: the platform walks "in" along what points AT the focus node, "out" along what it points at.
    expect(tool.description).toContain('"in" keeps what points AT the focus node')
    expect(tool.description).toContain('focus_node:"<hit id>", depth:2, kinds:["feature"], direction:"in"')
    expect(tool.description).toContain('focus_node:"state:<dotted.path>", depth:1, direction:"in"')
    expect(tool.description).toContain('Every behavior edge of a state node points AT it')
    for (const direction of ['in', 'out', 'both']) expect(tool.inputSchema.parse({ project_id: 'p', focus_node: 'n', direction })).toMatchObject({ direction })
    expect(tool.inputSchema.safeParse({ project_id: 'p', focus_node: 'n', direction: 'up' }).success).toBe(false)
  })

  it('advertises and retains portfolio and reference paging parameters', () => {
    const server = createMcpServer(makeClient())
    // @ts-expect-error testing the registered wire schemas
    const tools = server._registeredTools
    const portfolio = tools.list_wizard_projects.inputSchema.parse({ query: 'Editor', offset: 20, limit: 5, summary: false, paths: ['portfolio.unassigned'] })
    expect(portfolio).toMatchObject({ query: 'Editor', offset: 20, limit: 5, paths: ['portfolio.unassigned'] })
    const reference = tools.get_behavior_operations.inputSchema.parse({ project_id: 'p', query: 'count add_effect', offset: 100, max_chars: 200 })
    expect(reference).toMatchObject({ offset: 100, max_chars: 200 })
    expect(tools.sync_skills.inputSchema.parse({ skill_ids: ['lyriks-behavior'], include_content: false })).toMatchObject({ skill_ids: ['lyriks-behavior'], include_content: false })
  })

  it('SV01 — returns an McpServer instance', () => {
    const server = createMcpServer(makeClient())
    expect(server).toBeDefined()
    expect(typeof server.tool).toBe('function')
  })

  it('SV02 — registers get_model tool', () => {
    const server = createMcpServer(makeClient())
    // @ts-expect-error accessing internal _registeredTools
    const tools = server._registeredTools as Record<string, unknown>
    expect('get_model' in tools).toBe(true)
  })

  it('SV03 — registers get_view tool', () => {
    const server = createMcpServer(makeClient())
    // @ts-expect-error accessing internal _registeredTools
    const tools = server._registeredTools as Record<string, unknown>
    expect('get_view' in tools).toBe(true)
  })

  it('SV04 — registers find_inconsistencies tool', () => {
    const server = createMcpServer(makeClient())
    // @ts-expect-error accessing internal _registeredTools
    const tools = server._registeredTools as Record<string, unknown>
    expect('find_inconsistencies' in tools).toBe(true)
  })

  it('SV05 — registers apply_rule tool', () => {
    const server = createMcpServer(makeClient())
    // @ts-expect-error accessing internal _registeredTools
    const tools = server._registeredTools as Record<string, unknown>
    expect('apply_rule' in tools).toBe(true)
  })

  it('SV06 — registers generate_artifact tool', () => {
    const server = createMcpServer(makeClient())
    // @ts-expect-error accessing internal _registeredTools
    const tools = server._registeredTools as Record<string, unknown>
    expect('generate_artifact' in tools).toBe(true)
  })

  it('SV07 — registers the whole-app portfolio tools', () => {
    const server = createMcpServer(makeClient())
    // @ts-expect-error accessing internal _registeredTools
    const tools = server._registeredTools as Record<string, unknown>
    for (const name of [
      'list_workspaces',
      'list_projects',
      'get_project',
      'create_project',
      'update_project',
      'delete_project',
    ]) {
      expect(name in tools).toBe(true)
    }
  })

  it('SV08 — registers wizard portfolio and global completion tools', () => {
    const server = createMcpServer(makeClient())
    // @ts-expect-error accessing internal _registeredTools
    const tools = server._registeredTools as Record<string, unknown>
    for (const name of [
      'update_wizard_project',
      'delete_wizard_project',
      'list_domains',
      'create_domain',
      'update_domain',
      'delete_domain',
      'assess_project_completeness',
      'assess_portfolio_completeness',
      'audit_project_scope',
      'finish_project',
    ]) {
      expect(name in tools).toBe(true)
    }
  })
})
