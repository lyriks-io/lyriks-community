/**
 * Tests: add_element (Fix #8 — insert one element into a built screen without a
 * full build_screen rebuild). Mirrors the wire_element test style: mock LyriksClient,
 * assert on the PUT body's mutated builder tree.
 */

import { describe, it, expect, vi } from 'vitest'
import { addElementHandler } from '../tools/add_element.js'
import type { LyriksClient } from '../lyriks-client.js'

type Node = Record<string, unknown>

/** A mock LyriksClient whose GET returns a fixed experience draft and whose PUT
 *  captures the written body so we can assert on the mutated builder tree. */
function makeLyriks(draft: Record<string, unknown>) {
  const put = vi.fn().mockResolvedValue({ savedAt: '2026-01-01T00:00:00.000Z', revision: 1 })
  const get = vi.fn().mockResolvedValue({ draft })
  const lyriks = { get, put } as unknown as LyriksClient
  const putBody = () => put.mock.calls.at(-1)?.[1] as Record<string, unknown>
  return { lyriks, get, put, putBody }
}

/** A screen with a root group holding one input, plus a nested group. */
function builtDraft(): Record<string, unknown> {
  return {
    projectId: 'p1',
    screens: [{ id: 'scr1' }],
    components: [],
    builder: {
      nodes: {
        'bld-scr1-0': { id: 'bld-scr1-0', surfaceId: 'scr1', parentId: null, kind: 'group', label: 'Root', childIds: ['bld-scr1-1', 'bld-scr1-2'], flex: {} },
        'bld-scr1-1': {
          id: 'bld-scr1-1', surfaceId: 'scr1', parentId: 'bld-scr1-0', kind: 'element', elementKind: 'input',
          label: 'Email', wiring: { binding: null, transitions: [], validations: [], scenarios: [], gate: null },
        },
        'bld-scr1-2': { id: 'bld-scr1-2', surfaceId: 'scr1', parentId: 'bld-scr1-0', kind: 'group', label: 'Actions', childIds: [], flex: {} },
      },
      screenRoots: { scr1: 'bld-scr1-0' },
      entryScreenId: 'scr1',
    },
  }
}

const nodesOf = (body: Record<string, unknown>) => (body.builder as { nodes: Record<string, Node> }).nodes

describe('add_element (Fix #8)', () => {
  it('appends one element under the screen root by default and returns its id', async () => {
    const { lyriks, put, putBody } = makeLyriks(builtDraft())
    const res = (await addElementHandler(
      { project_id: 'p1', screen_id: 'scr1', element: { el: 'button', label: 'Save', nav: 'scr2' } },
      lyriks,
    )) as { nodeId: string; parentId: string; position: number; nodesCreated: number }

    expect(put).toHaveBeenCalledOnce()
    expect(res.parentId).toBe('bld-scr1-0')
    expect(res.nodesCreated).toBe(1)
    const nodes = nodesOf(putBody())
    const created = nodes[res.nodeId]
    expect(created).toMatchObject({ kind: 'element', elementKind: 'button', label: 'Save', parentId: 'bld-scr1-0', surfaceId: 'scr1' })
    expect(((created.wiring as { transitions: Node[] }).transitions[0].effect as Node)).toMatchObject({ kind: 'navigate', target: 'scr2' })
    // Appended after the existing children.
    const childIds = nodes['bld-scr1-0'].childIds as string[]
    expect(childIds).toEqual(['bld-scr1-1', 'bld-scr1-2', res.nodeId])
    expect(res.position).toBe(2)
    // Never collides with existing ids.
    expect(['bld-scr1-0', 'bld-scr1-1', 'bld-scr1-2']).not.toContain(res.nodeId)
  })

  it('inserts at a given position in an explicit parent group', async () => {
    const { lyriks, putBody } = makeLyriks(builtDraft())
    const res = (await addElementHandler(
      { project_id: 'p1', screen_id: 'scr1', parent_id: 'bld-scr1-0', position: 0, element: { el: 'heading', label: 'Title' } },
      lyriks,
    )) as { nodeId: string; position: number }

    const childIds = nodesOf(putBody())['bld-scr1-0'].childIds as string[]
    expect(childIds[0]).toBe(res.nodeId)
    expect(childIds).toHaveLength(3)
    expect(res.position).toBe(0)
  })

  it('materialises a group subtree (element spec with children) in one call', async () => {
    const { lyriks, putBody } = makeLyriks(builtDraft())
    const res = (await addElementHandler(
      {
        project_id: 'p1',
        screen_id: 'scr1',
        parent_id: 'bld-scr1-2',
        element: { label: 'Form', direction: 'col', children: [{ el: 'input', label: 'Name' }, { el: 'button', label: 'Submit', requireValid: true }] },
      },
      lyriks,
    )) as { nodeId: string; nodesCreated: number; nodes: Node[] }

    expect(res.nodesCreated).toBe(3)
    const nodes = nodesOf(putBody())
    const group = nodes[res.nodeId]
    expect(group).toMatchObject({ kind: 'group', label: 'Form', parentId: 'bld-scr1-2' })
    expect((group.childIds as string[])).toHaveLength(2)
    expect((nodes['bld-scr1-2'].childIds as string[])).toEqual([res.nodeId])
  })

  it('throws for an unknown screen, listing the existing surfaces', async () => {
    const { lyriks } = makeLyriks(builtDraft())
    await expect(
      addElementHandler({ project_id: 'p1', screen_id: 'nope', element: { el: 'text', label: 'x' } }, lyriks),
    ).rejects.toThrow(/surface "nope" not found/)
  })

  it('throws when the screen has no built layout yet (build_screen first)', async () => {
    const { lyriks } = makeLyriks({ projectId: 'p1', screens: [{ id: 'scr1' }], components: [], builder: { nodes: {}, screenRoots: {} } })
    await expect(
      addElementHandler({ project_id: 'p1', screen_id: 'scr1', element: { el: 'text', label: 'x' } }, lyriks),
    ).rejects.toThrow(/no built layout/)
  })

  it('throws for an unknown parent, listing the screen groups', async () => {
    const { lyriks } = makeLyriks(builtDraft())
    await expect(
      addElementHandler({ project_id: 'p1', screen_id: 'scr1', parent_id: 'nope', element: { el: 'text', label: 'x' } }, lyriks),
    ).rejects.toThrow(/parent "nope" not found/)
  })

  it('throws when the parent is an element, not a group', async () => {
    const { lyriks } = makeLyriks(builtDraft())
    await expect(
      addElementHandler({ project_id: 'p1', screen_id: 'scr1', parent_id: 'bld-scr1-1', element: { el: 'text', label: 'x' } }, lyriks),
    ).rejects.toThrow(/not a group/)
  })

  it('rejects a real leaf element that also declares children (shared build_screen guard)', async () => {
    const { lyriks } = makeLyriks(builtDraft())
    await expect(
      addElementHandler(
        // A `button` is a genuine leaf; children are a mistake and must fail loud.
        // (`el:"container"` with children is coerced to a group instead.)
        { project_id: 'p1', screen_id: 'scr1', element: { el: 'button', label: 'Save', children: [{ el: 'text', label: 'Hi' }] } },
        lyriks,
      ),
    ).rejects.toThrow(/both 'el' and 'children'/)
  })
})
