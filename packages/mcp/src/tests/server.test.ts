/**
 * Tests: McpServer registration + tool listing
 * SV01 to SV06  createMcpServer with an overlay: the five Enterprise tools registered
 */

import { describe, it, expect, vi } from 'vitest'
import { z }                        from 'zod'
import { createMcpServer }          from '../server.js'
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
