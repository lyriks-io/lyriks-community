/**
 * Tests: the screen prototype is retired. The experience `builder` sub-tree is
 * neither read nor written through the section tools, and get_project hides it.
 */

import { describe, it, expect } from 'vitest'
import {
  getSectionHandler,
  patchSectionHandler,
  setSectionHandler,
  refuseRetiredPrototypeInProject,
  withoutRetiredPrototypeInProject,
} from '../tools/sections.js'
import type { LyriksClient } from '../lyriks-client.js'

const STORED = {
  projectId: 'p1',
  journeys: [{ id: 'j1', name: 'Browse' }],
  screens: [{ id: 's1', name: 'Home' }],
  builder: { nodes: { n1: { id: 'n1' } }, screenRoots: { s1: 'n1' }, collections: [] },
}

function platform() {
  const writes: Record<string, unknown>[] = []
  const lyriks = {
    get: async () => ({ section: 'experience', projectId: 'p1', revision: 3, draft: structuredClone(STORED) }),
    put: async (_path: string, body: unknown) => {
      writes.push(body as Record<string, unknown>)
      return { ok: true }
    },
  } as unknown as LyriksClient
  return { lyriks, writes }
}

describe('retired screen prototype: section tools', () => {
  it('reads the experience without its builder, whole or in summary', async () => {
    const { lyriks } = platform()
    const full = (await getSectionHandler({ project_id: 'p1', section: 'experience' }, lyriks)) as { draft: Record<string, unknown> }
    expect(full.draft).not.toHaveProperty('builder')
    expect(full.draft.journeys).toEqual(STORED.journeys)
    const summary = (await getSectionHandler({ project_id: 'p1', section: 'experience', summary: true }, lyriks)) as { summary: Record<string, unknown> }
    expect(summary.summary).not.toHaveProperty('builder')
  })

  it('refuses a read of a builder path', async () => {
    const { lyriks } = platform()
    const read = (await getSectionHandler({ project_id: 'p1', section: 'experience', paths: ['builder.nodes'] }, lyriks)) as { refused: boolean; reason: string }
    expect(read.refused).toBe(true)
    expect(read.reason).toContain('retired')
  })

  it('refuses a patch that touches the builder and writes nothing', async () => {
    const { lyriks, writes } = platform()
    const answer = (await patchSectionHandler(
      { project_id: 'p1', section: 'experience', operations: [{ op: 'append', collection: 'builder.collections', value: { name: 'Order' } }] },
      lyriks,
    )) as { refused: boolean; paths: string[] }
    expect(answer.refused).toBe(true)
    expect(answer.paths).toEqual(['builder.collections'])
    expect(writes).toEqual([])
  })

  it('refuses a full write carrying a builder, and keeps the stored one on a full write without it', async () => {
    const { lyriks, writes } = platform()
    const refused = (await setSectionHandler({ project_id: 'p1', section: 'experience', document: { builder: {} } }, lyriks)) as { refused: boolean }
    expect(refused.refused).toBe(true)
    expect(writes).toEqual([])

    const written = (await setSectionHandler(
      { project_id: 'p1', section: 'experience', document: { journeys: [], screens: [] } },
      lyriks,
    )) as { warnings?: string[] }
    expect(writes[0].builder).toEqual(STORED.builder)
    expect((written.warnings ?? []).join(' ')).not.toContain('builder')
  })

  it('leaves the other sections alone', async () => {
    const { lyriks } = platform()
    const read = (await getSectionHandler({ project_id: 'p1', section: 'data', paths: ['builder'] }, lyriks)) as { refused?: boolean }
    expect(read.refused).toBeUndefined()
  })
})

describe('retired screen prototype: get_project', () => {
  it('refuses a path into the builder', () => {
    expect(refuseRetiredPrototypeInProject(['wizard_envelope.experience.builder.nodes'])).toMatchObject({ refused: true })
    expect(refuseRetiredPrototypeInProject(['wizard_envelope.experience.journeys'])).toBeNull()
  })

  it('hides the builder in a full, a summary and a selected answer', () => {
    const project = { id: 'p1', wizard_envelope: { experience: structuredClone(STORED), data: { entities: [] } } }
    const full = withoutRetiredPrototypeInProject(project) as typeof project
    expect(full.wizard_envelope.experience).not.toHaveProperty('builder')
    expect(full.wizard_envelope.data).toEqual({ entities: [] })

    const summary = withoutRetiredPrototypeInProject({ projectId: 'p1', summary: project }) as { summary: typeof project }
    expect(summary.summary.wizard_envelope.experience).not.toHaveProperty('builder')

    const selected = withoutRetiredPrototypeInProject({
      projectId: 'p1',
      selected: { 'wizard_envelope.experience': structuredClone(STORED) },
    }) as { selected: Record<string, Record<string, unknown>> }
    expect(selected.selected['wizard_envelope.experience']).not.toHaveProperty('builder')
  })
})
