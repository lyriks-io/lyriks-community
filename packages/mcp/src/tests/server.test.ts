/**
 * Tests: McpServer registration + tool listing. The Enterprise overlay's own
 * registration is tested against the real overlay in ee/tests/model_tools.test.ts.
 */

import { describe, it, expect } from 'vitest'
import { Client }                   from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport }        from '@modelcontextprotocol/sdk/inMemory.js'
import { createMcpServer, EVOLUTION_IS_OPTIONAL, SPEC_AND_CODE_TOOLS } from '../server.js'

const RETIRED_PROTOTYPE_TOOLS = [
  'build_screen',
  'wire_element',
  'add_element',
  'get_experience_coverage',
  'simulate_experience',
  'verify_experience',
  'import_data_collections',
  'generate_acceptance_tests',
  'generate_repo_scaffold',
]

describe('createMcpServer', () => {
  it('preserves expected revisions in both public write schemas', () => {
    const server = createMcpServer(null)
    // @ts-expect-error testing registered wire schemas
    const registered = server._registeredTools
    for (const name of ['set_section', 'patch_section']) {
      const parsed = registered[name].inputSchema.parse({ project_id: 'p', section: 'documents',
        document: {}, operations: [{ op: 'set', path: 'sources', value: [] }], expected_revision: 7 })
      expect(parsed.expected_revision).toBe(7)
    }
  })

  it('rejects retired operator sections in every public section schema and keeps Baselines', () => {
    const server = createMcpServer(null)
    // @ts-expect-error testing registered wire schemas
    const tools = server._registeredTools
    for (const name of ['describe_section', 'get_section', 'set_section', 'patch_section']) {
      const args = { project_id: 'p', document: {}, operations: [{ op: 'set', path: 'activeTab', value: 'snapshots' }], section: 'baselines' }
      expect(tools[name].inputSchema.safeParse(args).success, name).toBe(true)
      for (const section of ['supervision', 'finops', 'contract', 'generation'])
        expect(tools[name].inputSchema.safeParse({ ...args, section }).success, name).toBe(false)
    }
  })

  it('describes and reads evolution, and still refuses a raw write to it', () => {
    const server = createMcpServer(null)
    // @ts-expect-error testing registered wire schemas
    const tools = server._registeredTools
    const args = { project_id: 'p', document: {}, operations: [{ op: 'set', path: 'requests', value: [] }], section: 'evolution' }
    for (const name of ['describe_section', 'get_section'])
      expect(tools[name].inputSchema.safeParse(args).success, name).toBe(true)
    for (const name of ['set_section', 'patch_section'])
      expect(tools[name].inputSchema.safeParse(args).success, name).toBe(false)
  })

  it('retains patch dry_run and allows removals without a dummy value', () => {
    const server = createMcpServer(null)
    // @ts-expect-error testing registered wire schemas
    const tool = server._registeredTools.patch_section
    expect(tool.inputSchema.parse({ project_id: 'p', section: 'experience', dry_run: true, operations: [{ op: 'remove', path: 'builder.nodes.old' }] })).toMatchObject({ dry_run: true, operations: [{ op: 'remove' }] })
  })

  it('advertises the incremental patch ops and refuses an unknown one', () => {
    const server = createMcpServer(null)
    // @ts-expect-error testing registered wire schemas
    const tool = server._registeredTools.patch_section
    const operations = [
      { op: 'add_to_set', collection: 'features', id: 'feat-1', path: 'sourceIds', value: 'doc-2' },
      { op: 'remove_from_set', path: 'tags', value: 3 },
      { op: 'append_text', path: 'brief', value: 'One more paragraph.', separator: ' ' },
      { op: 'replace_text', path: 'brief', find: '3 days', value: '5 days' },
    ]
    expect(tool.inputSchema.parse({ project_id: 'p', section: 'features', operations }).operations).toEqual(operations)
    expect(tool.inputSchema.safeParse({ project_id: 'p', section: 'features', operations: [{ op: 'push', path: 'brief', value: 'x' }] }).success).toBe(false)
    for (const op of ['add_to_set', 'remove_from_set', 'append_text', 'replace_text', 'append']) expect(tool.description).toContain(`op:"${op}"`)
    // Adding a row is one op with no selector: the shape the wire accepts.
    expect(tool.inputSchema.safeParse({ project_id: 'p', section: 'scope', operations: [{ op: 'append', collection: 'capabilities', id: 'cap-2', value: { name: 'Sign out' } }] }).success).toBe(true)
    expect(tool.description).toContain('writeGuard')
    expect(tool.description).toContain('dryRunUnavailable')
  })

  it('advertises feature selection by id, drift paging and the verbose sync answer', () => {
    const server = createMcpServer(null)
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

  // The instructions, the binding block, the per-prompt hook and both Evolution
  // tools are loaded together by one client: they must state ONE rule, or the
  // agent acts on whichever text it read last.
  it('states one door for every change to an existing product, where a client reads it', async () => {
    const server = createMcpServer(null)
    const client = new Client({ name: 'instructions-check', version: '0' })
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(serverSide), client.connect(clientSide)])
    const instructions = client.getInstructions() ?? ''
    const { tools } = await client.listTools()
    await client.close()

    expect(instructions).toContain(EVOLUTION_IS_OPTIONAL)
    // The mandatory door is gone: a change is made directly, a dossier when asked for.
    for (const gone of ['changes through an Evolution request, always', 'There is NO threshold', 'EVOLUTION REQUEST FIRST', 'lyriks-evolution for ANY change'])
      expect(instructions, gone).not.toContain(gone)
    for (const phrase of [
      'Evolution is OPTIONAL',
      'the spec first through the section tools',
      'only when the person asks for one',
      'Never open a dossier on your own for an ordinary change',
    ]) expect(EVOLUTION_IS_OPTIONAL, phrase).toContain(phrase)
    // What the rule sends the agent to must exist.
    const names = new Set(tools.map((t) => t.name))
    for (const name of ['apply_behavior_batch', 'patch_section', 'sync_implementation_index', 'get_evolution', 'apply_evolution_batch']) {
      expect(EVOLUTION_IS_OPTIONAL).toContain(name)
      expect(names.has(name), name).toBe(true)
    }
    // The screen prototype is retired: none of its tools is listed or named.
    for (const retired of RETIRED_PROTOTYPE_TOOLS) {
      expect(names.has(retired), retired).toBe(false)
      expect(instructions, retired).not.toContain(retired)
    }
    // `add_draft_leaf` is an operation of the batch, not a tool of its own, so
    // the description has to teach it or nobody can reach it.
    expect(tools.find((t) => t.name === 'apply_evolution_batch')?.description).toContain('add_draft_leaf {requestId')
    // The stages read as the product names them (feat-31 a18cf05e), the entry into the Impact analysis
    // asks no validation (8cb6700b, b10629df), the freeze waits for the Specification only (rule b74f0cd7),
    // and a remark of the walkthrough is logged and ruled as the person (feat-20 cb859e66).
    const batch = tools.find((t) => t.name === 'apply_evolution_batch')?.description ?? ''
    expect(batch).toContain('Specify > Impact analysis > Build (entered by the freeze, which records the spec as a numbered version) > Approval > Deployment')
    expect(batch).toContain('The Specification is validated first: <left> of <total> left.')
    expect(batch).toContain('log_observation {requestId, body, type?, target?}')
    for (const stale of ['Challenge', 'Verify', 'once all four stand validated', 'The Solution is not validated yet', 'there is no operation to log one'])
      expect(batch, stale).not.toContain(stale)
    expect(instructions).not.toContain('freeze into Verify')
    // Claude Code shows the first 2048 characters of the instructions: the
    // sentence an agent acts on has to land before that.
    const acted = instructions.indexOf('Evolution is OPTIONAL') + 'Evolution is OPTIONAL'.length
    expect(acted).toBeGreaterThan('Evolution is OPTIONAL'.length - 1)
    expect(acted).toBeLessThanOrEqual(2048)
    for (const kept of ['SPEC CHANGE FIRST', 'THE CONVERSATION STAYS BOUND TO ITS PROJECT', 'lyriks-delivery step 4'])
      expect(instructions).toContain(kept)
    for (const name of ['get_evolution', 'apply_evolution_batch'])
      expect(tools.find((t) => t.name === name)?.description, name).toContain(EVOLUTION_IS_OPTIONAL)
  })

  // Criterion 4cfd9e34: what Lyriks answers and what the client's code tools answer.
  it('says what Lyriks answers and what the client\'s own code tools answer [criterion:4cfd9e34]', async () => {
    const server = createMcpServer(null)
    const client = new Client({ name: 'code-tools-check', version: '0' })
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(serverSide), client.connect(clientSide)])
    const instructions = client.getInstructions() ?? ''
    const { tools } = await client.listTools()
    await client.close()

    expect(instructions).toContain(SPEC_AND_CODE_TOOLS)
    for (const phrase of [
      'Lyriks answers what the product must do, why, and where the code implements it',
      'answer how the code is written',
      'follows the places the read gives',
      'tell the person instead of resolving it either way',
      'A question about the code alone',
      'without a Lyriks call',
    ]) expect(SPEC_AND_CODE_TOOLS, phrase).toContain(phrase)
    // The places it points at are what get_behavior_feature carries.
    const read = tools.find((t) => t.name === 'get_behavior_feature')?.description ?? ''
    for (const field of ['`code`', '`places`', '`notLocatedYet`', '`audits`', '`linked:false`', 'your own code tools'])
      expect(read, field).toContain(field)
  })

  // Owner 2026-11-07: a live session opened at every use of the MCP was too much.
  it('hands links to the app when a page serves better, and opens the live session with the link, not at every use [criterion:ac-leaf-ac-mcp-links-when-useful]', async () => {
    const server = createMcpServer(null)
    const client = new Client({ name: 'links-check', version: '0' })
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(serverSide), client.connect(clientSide)])
    const { tools } = await client.listTools()
    await client.close()

    const start = tools.find((t) => t.name === 'start_evolution_session')?.description ?? ''
    expect(start).toContain('never merely because you use this MCP')
    expect(start).toContain('whenever you hand the person a link to the app')
    expect(start).not.toContain('at the first prompt of a conversation')
    const batch = tools.find((t) => t.name === 'apply_evolution_batch')?.description ?? ''
    expect(batch).toContain('whenever the page shows what your answer talks about better than the chat')
    expect(batch).toContain('In the turn you hand a link, open the person\'s live session on the project first')
  })

  // An amendment reaches the Given/When/Then criteria too, and the client is told how [criterion:569c7789].
  it('teaches changeCriteria and retireCriteria on a behaviour criterion, and part specification [criterion:569c7789]', async () => {
    const server = createMcpServer(null)
    const client = new Client({ name: 'criteria-check', version: '0' })
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(serverSide), client.connect(clientSide)])
    const { tools } = await client.listTools()
    await client.close()
    const batch = tools.find((t) => t.name === 'apply_evolution_batch')?.description ?? ''
    expect(batch).toContain('reworded with {id, title?, given?, when?, then?, description?} or retired by its id')
    expect(batch).toContain('update_acceptance_criterion or remove_acceptance_criterion')
    expect(batch).toContain('a Given/When/Then criterion its behaviour model adds, rewords or retires')
    const read = tools.find((t) => t.name === 'get_evolution')?.description ?? ''
    expect(read).toContain('part:"specification"')
    // A description a draft writes is an item of its own [criterion:e384d594].
    expect(read).toContain('answer|description|action|path')
    expect(read).toContain('fieldPath element.description')
    // A direct change made after the freeze is the feature's, never the request's [criterion:28d5a69c].
    expect(read).toContain('what a direct change added since')
    const batchText = tools.find((t) => t.name === 'apply_evolution_batch')?.description ?? ''
    expect(batchText).toContain("lines on elements the request's drafts neither bring nor change")
  })

  // The block Not validated in Knowledge of a request's Simulation is readable by an AI client (EVO-003).
  it('accepts part knowledge on get_evolution and says what it returns [criterion:b6ebd524]', () => {
    const server = createMcpServer(null)
    // @ts-expect-error testing registered wire schemas
    const tool = server._registeredTools.get_evolution
    expect(tool.inputSchema.parse({ project_id: 'p', request_id: 'r1', part: 'knowledge' }).part).toBe('knowledge')
    expect(() => tool.inputSchema.parse({ project_id: 'p', request_id: 'r1', part: 'knowledgee' })).toThrow()
    expect(tool.description).toContain('part:"knowledge" (the block Not validated in Knowledge')
    for (const field of ['`readable`', '`specValidated`', '`lines`', '`relation` amended|used', '`waitsOn`', '`waitsOnMe`', '`choice` none|at_landing', '`awaitingChoice`', '`validated`'])
      expect(tool.description).toContain(field)
    expect(tool.inputSchema.shape.part.description).toContain('| knowledge (the block Not validated in Knowledge')
  })

  // The choices of the block Not validated in Knowledge are request operations an AI client can send (EVO-003).
  it('names the three choice operations of the Simulation on apply_evolution_batch, with their refusals', () => {
    const server = createMcpServer(null)
    // @ts-expect-error testing registered wire schemas
    const tool = server._registeredTools.apply_evolution_batch
    for (const op of ['validate_at_landing {requestId, elementId}', 'withdraw_landing_validation {requestId, elementId}', 'validate_all_at_landing {requestId}'])
      expect(tool.description).toContain(op)
    expect(tool.description).toContain('refused on a frozen version')
    expect(tool.description).toContain('The freeze sets every listed element still without a choice to Validate at the landing')
  })

  // Field agents asked for tools the graph already is; the recipes only name arguments it accepts.
  it('spells out the two graph recipes with arguments the tool accepts', () => {
    const server = createMcpServer(null)
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
    const server = createMcpServer(null)
    // @ts-expect-error testing the registered wire schemas
    const tools = server._registeredTools
    const portfolio = tools.list_wizard_projects.inputSchema.parse({ query: 'Editor', offset: 20, limit: 5, summary: false, paths: ['portfolio.unassigned'] })
    expect(portfolio).toMatchObject({ query: 'Editor', offset: 20, limit: 5, paths: ['portfolio.unassigned'] })
    const reference = tools.get_behavior_operations.inputSchema.parse({ project_id: 'p', query: 'count add_effect', offset: 100, max_chars: 200 })
    expect(reference).toMatchObject({ offset: 100, max_chars: 200 })
    expect(tools.sync_skills.inputSchema.parse({ skill_ids: ['lyriks-behavior'], include_content: false })).toMatchObject({ skill_ids: ['lyriks-behavior'], include_content: false })
  })

  it('registers no tool for what the interface does not offer (criterion 0aa782c2)', () => {
    const server = createMcpServer(null)
    // @ts-expect-error accessing internal _registeredTools
    const tools = server._registeredTools as Record<string, unknown>
    for (const name of ['get_implementation_context', 'update_domain', 'get_project_elaboration', 'assess_portfolio_completeness', 'get_roadmap', 'apply_roadmap_batch', 'reconcile_roadmap_statuses'])
      expect(name in tools, name).toBe(false)
  })

  it('names no page the interface no longer has (criterion 0aa782c2)', () => {
    const server = createMcpServer(null)
    // @ts-expect-error accessing internal _registeredTools
    const tools = server._registeredTools as Record<string, { description?: string }>
    const retired = /Foundation (page|brief)|Control Center|graph explorer|[Rr]oadmap|Traceability|Rules tab|Users and permissions/
    for (const [name, tool] of Object.entries(tools))
      expect(tool.description ?? '', name).not.toMatch(retired)
  })
})
