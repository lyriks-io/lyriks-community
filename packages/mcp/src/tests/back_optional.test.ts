/**
 * Tests: the gateway without a Back (Community).
 * BO01 to BO08: portfolio tools answer from the platform, the Enterprise
 * tools explain the edition, nothing tries to reach a service that is not there.
 */

import { describe, it, expect, vi } from 'vitest'
import { createMcpServer } from '../server.js'
import type { LyriksClient } from '../lyriks-client.js'
import {
  deleteProjectWithoutBack,
  getProjectWithoutBack,
  listProjectsWithoutBack,
  sectionsFor,
} from '../tools/portfolio-platform.js'
import { SECTIONS } from '../tools/sections.js'

const PORTFOLIO = {
  portfolio: {
    domains: [{ id: 'd1', projects: [{ id: 'bigledger', name: 'Big Ledger', stage: 'ideation' }] }],
    unassigned: [{ id: 'snake', name: 'Snake' }],
  },
}

function makeLyriks(get: (path: string) => unknown): LyriksClient {
  return { get: vi.fn(async (path: string) => get(path)) } as unknown as LyriksClient
}

/** Call a registered tool the way the SDK would, and unwrap its JSON text. */
async function call(server: ReturnType<typeof createMcpServer>, name: string, args: unknown) {
  // @ts-expect-error accessing internal _registeredTools
  const tool = server._registeredTools[name] as {
    handler: (a: unknown, extra: unknown) => Promise<{ content: { text: string }[] }>
  }
  const out = await tool.handler(args, {})
  return JSON.parse(out.content[0].text)
}

describe('the gateway without a Back', () => {
  it('BO01 registers the whole tool set without an overlay', () => {
    const server = createMcpServer(null)
    // @ts-expect-error accessing internal _registeredTools
    const tools = Object.keys(server._registeredTools as Record<string, unknown>)
    for (const name of ['list_workspaces', 'list_projects', 'get_project', 'create_project', 'get_model', 'apply_rule'])
      expect(tools).toContain(name)
  })

  it('BO02 list_workspaces is empty and says why', async () => {
    const result = await call(createMcpServer(null), 'list_workspaces', {})
    expect(result.workspaces).toEqual([])
    expect(result.note).toMatch(/Community edition/)
  })

  it('BO03 list_projects flattens the platform portfolio into an array of cards', async () => {
    const lyriks = makeLyriks(() => PORTFOLIO)
    const list = (await listProjectsWithoutBack(lyriks)) as Array<Record<string, unknown>>
    expect(list.map((p) => p.id)).toEqual(['bigledger', 'snake'])
    expect(list[0]).toMatchObject({ name: 'Big Ledger', workspace_id: null, kernel_project_id: 'bigledger' })
  })

  it('BO04 sectionsFor reads only the sections a path names', () => {
    expect(sectionsFor(['wizard_envelope.experience.designSystem', 'wizard_envelope.features'])).toEqual([
      'experience',
      'features',
    ])
    expect(sectionsFor(['name'])).toEqual([])
    expect(sectionsFor(['wizard_envelope'])).toEqual([...SECTIONS])
    expect(sectionsFor(undefined)).toEqual([...SECTIONS])
  })

  it('BO05 get_project assembles wizard_envelope from the platform section reads', async () => {
    const lyriks = makeLyriks((path) =>
      path === '/api/projects'
        ? PORTFOLIO
        : { draft: { projectId: 'bigledger', section: new URL(`http://x${path}`).searchParams.get('section') } },
    )
    const result = (await getProjectWithoutBack(
      { project_id: 'bigledger', paths: ['wizard_envelope.features.projectId', 'name'] },
      lyriks,
    )) as { projectId: string; selected: Record<string, unknown> }
    expect(result.projectId).toBe('bigledger')
    expect(result.selected).toEqual({ 'wizard_envelope.features.projectId': 'bigledger', name: 'Big Ledger' })
    // One portfolio read + exactly the one section the path named.
    expect((lyriks.get as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual([
      '/api/projects',
      '/api/sections?projectId=bigledger&section=features',
    ])
  })

  it('BO05b a full get_project skips the write-only sections the platform cannot read', async () => {
    const lyriks = makeLyriks((path) => {
      if (path === '/api/projects') return PORTFOLIO
      const section = new URL(`http://x${path}`).searchParams.get('section')
      if (section === 'contract' || section === 'generation')
        throw new Error(`lyriks 400 on GET ${path}: {"message":"unknown section \\"${section}\\""}`)
      return { draft: { section } }
    })
    const project = (await getProjectWithoutBack({ project_id: 'snake' }, lyriks)) as {
      wizard_envelope: Record<string, unknown>
    }
    expect(Object.keys(project.wizard_envelope)).not.toContain('contract')
    expect(project.wizard_envelope.features).toEqual({ section: 'features' })
    // Any other failure still surfaces.
    const broken = makeLyriks((path) => {
      if (path === '/api/projects') return PORTFOLIO
      throw new Error('lyriks 500 on GET x: boom')
    })
    await expect(getProjectWithoutBack({ project_id: 'snake' }, broken)).rejects.toThrow(/500/)
  })

  it('BO06 get_project refuses an unknown slug with guidance, not a connection error', async () => {
    const lyriks = makeLyriks(() => PORTFOLIO)
    await expect(getProjectWithoutBack({ project_id: 'nope' }, lyriks)).rejects.toThrow(/list_wizard_projects/)
  })

  it('BO07 delete_project points at the guarded wizard deletion', () => {
    expect(() => deleteProjectWithoutBack({ project_id: 'bigledger' })).toThrow(/delete_wizard_project/)
  })

  it('BO08 the Enterprise tools explain the edition instead of failing', async () => {
    const server = createMcpServer(null)
    for (const name of ['get_model', 'find_inconsistencies']) {
      const result = await call(server, name, { project_id: 'bigledger' })
      expect(result).toMatchObject({ available: false, projectId: 'bigledger' })
      expect(result.reason).toMatch(/Community edition/)
    }
  })
})
