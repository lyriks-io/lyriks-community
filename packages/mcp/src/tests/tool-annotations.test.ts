/**
 * Every tool tells the client what it does:
 * a client that approves on its own lets the reads through without asking.
 */

import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createMcpServer } from '../server.js'
import { TOOL_EFFECTS, annotationsFor } from '../util/tool-annotations.js'
import type { BoundOverlay } from '../enterprise/overlay.js'

const overlay = (): BoundOverlay => ({
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
})

async function listedTools(ee: BoundOverlay | null) {
  const server = createMcpServer(ee)
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await server.connect(serverSide)
  const client = new Client({ name: 'test', version: '1.0.0' })
  await client.connect(clientSide)
  const { tools } = await client.listTools()
  await client.close()
  return tools
}

describe('every MCP tool declares its effect to the client [criterion:ac-leaf-ac-mcp-tool-annotations]', () => {
  for (const [edition, ee] of [['Enterprise', overlay()], ['Community', null]] as const) {
    it(`lists no tool without annotations (${edition})`, async () => {
      const tools = await listedTools(ee)
      expect(tools.length).toBeGreaterThan(60)
      const bare = tools.filter((t) => t.annotations?.readOnlyHint === undefined || t.annotations?.destructiveHint === undefined).map((t) => t.name)
      expect(bare).toEqual([])
    })
  }

  it('declares the reads a retrospecification makes as read-only, and the writers as writers', async () => {
    const byName = new Map((await listedTools(overlay())).map((t) => [t.name, t.annotations]))
    for (const read of ['get_behavior_operations', 'get_section', 'get_behavior_feature', 'list_wizard_projects', 'sync_skills', 'get_model'])
      expect(byName.get(read)?.readOnlyHint, read).toBe(true)
    for (const write of ['apply_behavior_batch', 'patch_section', 'set_section', 'sync_implementation_index', 'apply_rule'])
      expect(byName.get(write)?.readOnlyHint, write).toBe(false)
    for (const destroy of ['delete_project', 'remove_source', 'reset_analysis', 'set_section'])
      expect(byName.get(destroy)?.destructiveHint, destroy).toBe(true)
  })

  it('keeps the annotations a tool states itself', async () => {
    const byName = new Map((await listedTools(overlay())).map((t) => [t.name, t.annotations]))
    expect(byName.get('link_data_fields')).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: true })
  })

  // The one place the tool list is pinned: every tool a client can call has a
  // declared effect, and every declared effect belongs to a tool a client can
  // call, but those an edition or a switch deliberately holds back.
  it('lists every tool it declares an effect for, but the solver proofs on Community and the switched-off screen prototype', async () => {
    const prototype = ['build_screen', 'wire_element', 'add_element']
    const proofs = ['what_if', 'what_if_project', 'prove_project_invariants']
    const declared = Object.keys(TOOL_EFFECTS).filter((name) => !prototype.includes(name)).sort()
    expect((await listedTools(overlay())).map((t) => t.name).sort()).toEqual(declared)
    expect((await listedTools(null)).map((t) => t.name).sort()).toEqual(declared.filter((name) => !proofs.includes(name)))
  })

  it('names every effect once, in a closed world', () => {
    for (const name of Object.keys(TOOL_EFFECTS)) expect(annotationsFor(name)?.openWorldHint, name).toBe(false)
    expect(annotationsFor('no_such_tool')).toBeNull()
  })
})
