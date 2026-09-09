import { describe, it, expect } from 'vitest'
import { materializeNode, type MaterializeCtx } from '../tools/build_screen.js'

function ctx(): MaterializeCtx {
  let i = 0
  return { surfaceId: 'scr', nodes: {}, nid: () => `n${i++}` }
}

describe('materializeNode — container/group ergonomics', () => {
  it('treats el:"container" with children as a wrapping group', () => {
    const c = ctx()
    const id = materializeNode(
      { el: 'container', label: 'Wrapper', direction: 'row', children: [{ el: 'text', label: 'Hi' }] },
      null,
      c,
    )
    const node = c.nodes[id]
    expect(node.kind).toBe('group') // coerced, not an error
    expect((node.childIds as string[]).length).toBe(1)
    // the child still materialised as a real element
    const childId = (node.childIds as string[])[0]
    expect(c.nodes[childId].kind).toBe('element')
  })

  it('still fails loud when a real leaf element is given children', () => {
    const c = ctx()
    expect(() =>
      materializeNode({ el: 'button', label: 'Save', children: [{ el: 'text', label: 'x' }] }, null, c),
    ).toThrow(/cannot contain children/)
  })

  it('leaves a childless container as a plain element', () => {
    const c = ctx()
    const id = materializeNode({ el: 'container', label: 'Box' }, null, c)
    expect(c.nodes[id].kind).toBe('element')
  })
})

describe('materializeNode — per-row interactivity vocabulary', () => {
  it('carries a list row layout and its column count', () => {
    const c = ctx()
    const id = materializeNode(
      {
        el: 'list',
        label: 'Apps',
        bind: { kind: 'entity', ref: 'ConnectorApp' },
        componentId: 'cmp-app-row',
        rowLayout: 'cards',
        rowColumns: 3,
      },
      null,
      c,
    )
    expect(c.nodes[id]).toMatchObject({ elementKind: 'list', rowLayout: 'cards', rowColumns: 3, componentId: 'cmp-app-row' })
  })

  it('builds a selectRecord transition and keeps a {Field} value verbatim for the run engine', () => {
    const c = ctx()
    const id = materializeNode(
      {
        el: 'button',
        label: 'Connect this app',
        on: [
          { trigger: 'click', selectRecord: 'catalog.app' },
          { trigger: 'click', setState: ['catalog.appName', '{name}'] },
        ],
      },
      null,
      c,
    )
    const transitions = (c.nodes[id].wiring as { transitions: Record<string, unknown>[] }).transitions
    expect(transitions[0].effect).toEqual({ kind: 'selectRecord', target: 'catalog.app' })
    expect(transitions[1].effect).toMatchObject({ kind: 'setState', target: 'catalog.appName', value: '{name}' })
  })

  it('materialises a dependent select and defaults value fields to the change trigger', () => {
    const c = ctx()
    const id = materializeNode(
      {
        el: 'select',
        label: 'Connection',
        bind: { kind: 'state', ref: 'editor.connection' },
        optionsFrom: { collection: 'Connection', field: 'name', filterField: 'app', filterPath: 'editor.app' },
        on: [{ setState: ['editor.tested', 'false'] }],
      },
      null,
      c,
    )
    const node = c.nodes[id]
    expect(node.elementKind).toBe('select')
    expect(node.optionsFrom).toEqual({ collection: 'Connection', field: 'name', filterField: 'app', filterPath: 'editor.app' })
    const transitions = (node.wiring as { transitions: Record<string, unknown>[] }).transitions
    expect(transitions[0].trigger).toBe('change') // a select is a value field, not a button
  })

  it('drops a half-authored optionsFrom rather than storing a broken source', () => {
    const c = ctx()
    const id = materializeNode({ el: 'select', label: 'App', optionsFrom: { collection: 'Connection' } }, null, c)
    expect(c.nodes[id].optionsFrom).toBeUndefined()
  })
})

describe('materializeNode: group presentations', () => {
  it('materialises a sidebar group (aside nav) with its tabsKey', () => {
    const c = ctx()
    const id = materializeNode(
      {
        label: 'Settings',
        presentation: 'sidebar',
        tabsKey: 'settings.section',
        children: [
          { label: 'General', children: [{ el: 'heading', label: 'General' }] },
          { label: 'Billing', children: [{ el: 'heading', label: 'Billing' }] },
        ],
      },
      null,
      c,
    )
    const node = c.nodes[id]
    expect(node.kind).toBe('group')
    expect(node.presentation).toBe('sidebar')
    expect(node.tabsKey).toBe('settings.section')
    expect((node.childIds as string[]).length).toBe(2)
  })

  it('accepts the sidebar:true shorthand and leaves inline implicit', () => {
    const c = ctx()
    const aside = materializeNode({ label: 'Nav', sidebar: true, children: [] }, null, c)
    expect(c.nodes[aside].presentation).toBe('sidebar')
    const plain = materializeNode({ label: 'Plain', children: [] }, null, c)
    expect(c.nodes[plain].presentation).toBeUndefined()
  })

  it('materialises a dropdown menu group with its open condition', () => {
    const c = ctx()
    const id = materializeNode(
      {
        label: 'User menu',
        presentation: 'menu',
        visibleWhen: { path: 'menu.open' },
        children: [{ el: 'link', label: 'Sign out' }],
      },
      null,
      c,
    )
    const node = c.nodes[id]
    expect(node.presentation).toBe('menu')
    expect(node.visibleWhen).toMatchObject({ path: 'menu.open', op: 'truthy' })
    const menuShorthand = materializeNode({ label: 'Row actions', menu: true, children: [] }, null, c)
    expect(c.nodes[menuShorthand].presentation).toBe('menu')
  })
})
