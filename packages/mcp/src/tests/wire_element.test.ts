/**
 * Tests: build_screen node output + wire_element (Fix #3 — element-level editing)
 */

import { describe, it, expect, vi } from 'vitest'
import { buildScreenHandler } from '../tools/build_screen.js'
import { wireElementHandler } from '../tools/wire_element.js'
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

function draftWithInput(): Record<string, unknown> {
  return {
    projectId: 'p1',
    screens: [{ id: 'scr1' }],
    builder: {
      nodes: {
        'bld-scr1-0': { id: 'bld-scr1-0', surfaceId: 'scr1', parentId: null, kind: 'group', label: 'Root', childIds: ['bld-scr1-1'], flex: {} },
        'bld-scr1-1': {
          id: 'bld-scr1-1', surfaceId: 'scr1', parentId: 'bld-scr1-0', kind: 'element', elementKind: 'input',
          label: 'Order number', wiring: { binding: null, transitions: [], validations: [], scenarios: [], gate: null },
        },
      },
      screenRoots: { scr1: 'bld-scr1-0' },
      entryScreenId: 'scr1',
    },
  }
}

describe('build_screen — node output (Fix #3a)', () => {
  it('returns the built nodes (id, kind, elementKind, label) so a caller can target one', async () => {
    const { lyriks } = makeLyriks({ projectId: 'p1', screens: [{ id: 'scr1' }], components: [], builder: { nodes: {}, screenRoots: {} } })
    const res = (await buildScreenHandler(
      { project_id: 'p1', screen_id: 'scr1', layout: { children: [{ el: 'button', label: 'Go' }, { el: 'input', label: 'Email' }] } },
      lyriks,
    )) as { nodes: Node[]; nodesBuilt: number; rootId: string }

    expect(Array.isArray(res.nodes)).toBe(true)
    expect(res.nodes.length).toBe(res.nodesBuilt)
    const go = res.nodes.find((n) => n.label === 'Go')
    expect(go).toMatchObject({ kind: 'element', elementKind: 'button' })
    expect(typeof go!.id).toBe('string')
  })
})

describe('wire_element (Fix #3b)', () => {
  it('adds validations to an input without rebuilding the screen', async () => {
    const { lyriks, put, putBody } = makeLyriks(draftWithInput())
    const res = (await wireElementHandler(
      { project_id: 'p1', node_id: 'bld-scr1-1', validations: [{ kind: 'required' }, { kind: 'min', param: 3, message: 'Too short' }] },
      lyriks,
    )) as { changed: string[] }

    expect(put).toHaveBeenCalledOnce()
    const nodes = (putBody().builder as { nodes: Record<string, Node> }).nodes
    const wiring = (nodes['bld-scr1-1'].wiring as { validations: Node[] })
    expect(wiring.validations.map((v) => v.kind)).toEqual(['required', 'min'])
    // lyriks stores `param` as a string — a numeric param must be stringified or it is dropped.
    expect(wiring.validations[1]).toMatchObject({ param: '3', message: 'Too short' })
    expect(res.changed).toContain('validations')
  })

  it('appends a transition (does not clobber existing ones)', async () => {
    const draft = draftWithInput()
    const node = (draft.builder as { nodes: Record<string, Node> }).nodes['bld-scr1-1']
    ;(node.wiring as { transitions: Node[] }).transitions = [{ id: 't-existing', trigger: 'change', effect: { kind: 'setState', target: 'x', value: '1' } }]
    const { lyriks, putBody } = makeLyriks(draft)

    await wireElementHandler({ project_id: 'p1', node_id: 'bld-scr1-1', on: [{ trigger: 'submit', navigate: 'scr2' }] }, lyriks)

    const t = ((putBody().builder as { nodes: Record<string, Node> }).nodes['bld-scr1-1'].wiring as { transitions: Node[] }).transitions
    expect(t).toHaveLength(2)
    expect(t.at(-1)).toMatchObject({ trigger: 'submit', effect: { kind: 'navigate', target: 'scr2' } })
  })

  it('replaceTransitions swaps them out', async () => {
    const draft = draftWithInput()
    ;((draft.builder as { nodes: Record<string, Node> }).nodes['bld-scr1-1'].wiring as { transitions: Node[] }).transitions = [{ id: 'old' }]
    const { lyriks, putBody } = makeLyriks(draft)

    await wireElementHandler(
      { project_id: 'p1', node_id: 'bld-scr1-1', on: [{ trigger: 'click', toggle: 'open' }], replaceTransitions: true },
      lyriks,
    )
    const t = ((putBody().builder as { nodes: Record<string, Node> }).nodes['bld-scr1-1'].wiring as { transitions: Node[] }).transitions
    expect(t).toHaveLength(1)
    expect(t[0]).toMatchObject({ effect: { kind: 'toggleState', target: 'open' } })
  })

  it('sets a state-driven visibility gate', async () => {
    const { lyriks, putBody } = makeLyriks(draftWithInput())
    await wireElementHandler({ project_id: 'p1', node_id: 'bld-scr1-1', visibleWhen: { path: 'form.ready', op: 'truthy' } }, lyriks)
    const wiring = (putBody().builder as { nodes: Record<string, Node> }).nodes['bld-scr1-1'].wiring as { visibleWhen: Node }
    expect(wiring.visibleWhen).toMatchObject({ path: 'form.ready', op: 'truthy' })
  })

  it('throws a helpful error when the node id is unknown', async () => {
    const { lyriks } = makeLyriks(draftWithInput())
    await expect(wireElementHandler({ project_id: 'p1', node_id: 'nope', label: 'x' }, lyriks)).rejects.toThrow(/not found/)
  })

  it('sets requireValid, appearance and media on one element (no rebuild / raw patch)', async () => {
    const { lyriks, putBody } = makeLyriks(draftWithInput())
    const res = (await wireElementHandler(
      {
        project_id: 'p1',
        node_id: 'bld-scr1-1',
        requireValid: true,
        appearance: { background: '#eee', radius: 8 },
        media: { src: 'data:image/svg+xml;base64,AAA', alt: 'x', fit: 'contain' },
      },
      lyriks,
    )) as { changed: string[] }
    const node = (putBody().builder as { nodes: Record<string, Node> }).nodes['bld-scr1-1']
    expect((node.wiring as { requireValid: boolean }).requireValid).toBe(true)
    expect(node.appearance).toMatchObject({ background: '#eee', radius: 8 })
    expect(node.media).toMatchObject({ src: 'data:image/svg+xml;base64,AAA', alt: 'x', fit: 'contain' })
    expect(res.changed).toEqual(expect.arrayContaining(['requireValid', 'appearance', 'media']))
  })

  it('wires call / createRecord / navigateBack effects', async () => {
    const { lyriks, putBody } = makeLyriks(draftWithInput())
    await wireElementHandler(
      {
        project_id: 'p1',
        node_id: 'bld-scr1-1',
        replaceTransitions: true,
        on: [
          { trigger: 'click', createRecord: 'Order' },
          { trigger: 'click', call: { label: 'Save', loadingPath: 'saving', resultPath: 'saved', resultValue: 'true' } },
          { trigger: 'click', navigateBack: true },
        ],
      },
      lyriks,
    )
    const t = ((putBody().builder as { nodes: Record<string, Node> }).nodes['bld-scr1-1'].wiring as { transitions: Node[] }).transitions
    expect(t.map((x) => (x.effect as { kind: string }).kind)).toEqual(['createRecord', 'call', 'navigateBack'])
    expect((t[0].effect as { target: string }).target).toBe('Order')
  })
})

describe('build_screen — element fields + guards', () => {
  const emptyDraft = () => ({ projectId: 'p1', screens: [{ id: 'scr1' }], components: [], builder: { nodes: {}, screenRoots: {} } })
  const findByLabel = (body: Record<string, unknown>, label: string) =>
    Object.values((body.builder as { nodes: Record<string, Node> }).nodes).find((n) => n.label === label)!

  it('materialises appearance, media (src shorthand), requireValid and a createRecord shorthand', async () => {
    const { lyriks, putBody } = makeLyriks(emptyDraft())
    await buildScreenHandler(
      {
        project_id: 'p1',
        screen_id: 'scr1',
        layout: {
          children: [
            { el: 'image', label: 'Chart', src: 'data:image/svg+xml;base64,BBB', alt: 'chart', appearance: { radius: 12 } },
            { el: 'button', label: 'Submit', requireValid: true, createRecord: 'Expense' },
          ],
        },
      },
      lyriks,
    )
    const img = findByLabel(putBody(), 'Chart')
    expect(img.media).toMatchObject({ src: 'data:image/svg+xml;base64,BBB', alt: 'chart', fit: 'cover' })
    expect(img.appearance).toMatchObject({ radius: 12 })
    const btn = findByLabel(putBody(), 'Submit')
    expect((btn.wiring as { requireValid: boolean }).requireValid).toBe(true)
    expect(((btn.wiring as { transitions: Node[] }).transitions[0].effect as { kind: string; target: string })).toMatchObject({
      kind: 'createRecord',
      target: 'Expense',
    })
  })

  it('rejects a real leaf element that also declares children', async () => {
    const { lyriks } = makeLyriks(emptyDraft())
    await expect(
      buildScreenHandler(
        // A `button` is a genuine leaf — children here are a mistake and must fail loud.
        // (`el:"container"` with children is instead coerced to a group; see build_screen.test.)
        { project_id: 'p1', screen_id: 'scr1', layout: { children: [{ el: 'button', label: 'Save', children: [{ el: 'text', label: 'Hi' }] }] } },
        lyriks,
      ),
    ).rejects.toThrow(/both 'el' and 'children'/)
  })

  it('warns on duplicate labels among clickable elements', async () => {
    const { lyriks } = makeLyriks(emptyDraft())
    const res = (await buildScreenHandler(
      { project_id: 'p1', screen_id: 'scr1', layout: { children: [{ el: 'button', label: 'Go' }, { el: 'button', label: 'Go' }, { el: 'text', label: 'Go' }] } },
      lyriks,
    )) as { warnings?: string[] }
    expect(res.warnings?.some((w) => w.includes('Duplicate label "Go"'))).toBe(true)
  })
})

describe('wire_element — row-interaction fields', () => {
  /** A list bound to a collection plus a select, the two kinds with new fields. */
  function draftWithListAndSelect(): Record<string, unknown> {
    return {
      projectId: 'p1',
      screens: [{ id: 'scr1' }],
      builder: {
        nodes: {
          'bld-scr1-0': { id: 'bld-scr1-0', surfaceId: 'scr1', parentId: null, kind: 'group', label: 'Root', childIds: ['lst', 'sel'], flex: {} },
          lst: {
            id: 'lst', surfaceId: 'scr1', parentId: 'bld-scr1-0', kind: 'element', elementKind: 'list', label: 'Apps',
            wiring: { binding: { targetKind: 'entity', targetRef: 'ConnectorApp' }, transitions: [], validations: [], scenarios: [], gate: null },
          },
          sel: {
            id: 'sel', surfaceId: 'scr1', parentId: 'bld-scr1-0', kind: 'element', elementKind: 'select', label: 'Connection',
            wiring: { binding: null, transitions: [], validations: [], scenarios: [], gate: null },
          },
        },
        screenRoots: { scr1: 'bld-scr1-0' },
        entryScreenId: 'scr1',
      },
    }
  }

  it('switches a list to cards with a column count', async () => {
    const { lyriks, putBody } = makeLyriks(draftWithListAndSelect())
    await wireElementHandler({ project_id: 'p1', node_id: 'lst', rowLayout: 'cards', rowColumns: 3 }, lyriks)
    const node = ((putBody().builder as Record<string, unknown>).nodes as Record<string, Node>).lst
    expect(node.rowLayout).toBe('cards')
    expect(node.rowColumns).toBe(3)
  })

  it('clamps an absurd column count and drops the layout again on "stack"', async () => {
    const { lyriks, putBody } = makeLyriks(draftWithListAndSelect())
    await wireElementHandler({ project_id: 'p1', node_id: 'lst', rowLayout: 'grid', rowColumns: 12 }, lyriks)
    expect((((putBody().builder as Record<string, unknown>).nodes as Record<string, Node>).lst).rowColumns).toBe(4)
    await wireElementHandler({ project_id: 'p1', node_id: 'lst', rowLayout: 'stack' }, lyriks)
    expect((((putBody().builder as Record<string, unknown>).nodes as Record<string, Node>).lst).rowLayout).toBeUndefined()
  })

  it('sets a dependent option source on a select and clears it with null', async () => {
    const { lyriks, putBody } = makeLyriks(draftWithListAndSelect())
    await wireElementHandler(
      { project_id: 'p1', node_id: 'sel', optionsFrom: { collection: 'Connection', field: 'name', filterField: 'app', filterPath: 'editor.app' } },
      lyriks,
    )
    expect((((putBody().builder as Record<string, unknown>).nodes as Record<string, Node>).sel).optionsFrom).toEqual({
      collection: 'Connection', field: 'name', filterField: 'app', filterPath: 'editor.app',
    })
    await wireElementHandler({ project_id: 'p1', node_id: 'sel', optionsFrom: null }, lyriks)
    expect((((putBody().builder as Record<string, unknown>).nodes as Record<string, Node>).sel).optionsFrom).toBeUndefined()
  })

  it('wires a selectRecord transition on a row-template element', async () => {
    const { lyriks, putBody } = makeLyriks(draftWithListAndSelect())
    await wireElementHandler({ project_id: 'p1', node_id: 'sel', on: [{ trigger: 'click', selectRecord: 'catalog.app' }] }, lyriks)
    const node = ((putBody().builder as Record<string, unknown>).nodes as Record<string, Node>).sel
    const transitions = (node.wiring as { transitions: Record<string, unknown>[] }).transitions
    expect(transitions[0].effect).toEqual({ kind: 'selectRecord', target: 'catalog.app' })
  })
})
