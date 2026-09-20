/**
 * Tests: applySectionPatch — id-keyed and keyless (match-addressed) collections,
 * dotted collection paths, and the no-id-injection rule on match inserts.
 */

import { describe, it, expect } from 'vitest'
import { applySectionPatch, applySectionPatchReport, type PatchOp } from '../tools/sections.js'

describe('applySectionPatch', () => {
  it('merges into an id-keyed item and stamps id on insert', () => {
    const draft: Record<string, unknown> = { screens: [{ id: 's1', name: 'Home' }] }
    const applied = applySectionPatch(draft, [
      { op: 'merge', collection: 'screens', id: 's1', value: { name: 'Start' } },
      { op: 'merge', collection: 'screens', id: 's2', insert: true, value: { name: 'Detail' } },
    ])
    expect(applied).toBe(2)
    expect(draft.screens).toEqual([
      { id: 's1', name: 'Start' },
      { id: 's2', name: 'Detail' },
    ])
  })

  it('addresses keyless rows via match and never injects an id on insert', () => {
    const draft: Record<string, unknown> = {
      permissions: [
        { roleId: 'admin', capabilityId: 'cap-a', level: 'none' },
        { roleId: 'viewer', capabilityId: 'cap-a', level: 'none' },
      ],
    }
    const ops: PatchOp[] = [
      { op: 'merge', collection: 'permissions', match: { roleId: 'admin', capabilityId: 'cap-a' }, value: { level: 'full' } },
      { op: 'merge', collection: 'permissions', match: { roleId: 'editor', capabilityId: 'cap-a' }, insert: true, value: { roleId: 'editor', capabilityId: 'cap-a', level: 'edit' } },
    ]
    expect(applySectionPatch(draft, ops)).toBe(2)
    const rows = draft.permissions as Record<string, unknown>[]
    expect(rows[0].level).toBe('full')
    expect(rows[2]).toEqual({ roleId: 'editor', capabilityId: 'cap-a', level: 'edit' })
    expect(rows.every((r) => !('id' in r))).toBe(true)
  })

  it('removes rows by match', () => {
    const draft: Record<string, unknown> = {
      permissions: [
        { roleId: 'admin', capabilityId: 'cap-a' },
        { roleId: 'viewer', capabilityId: 'cap-a' },
      ],
    }
    expect(applySectionPatch(draft, [{ op: 'remove', collection: 'permissions', match: { roleId: 'viewer' } }])).toBe(1)
    expect(draft.permissions).toEqual([{ roleId: 'admin', capabilityId: 'cap-a' }])
  })

  it('resolves dotted collection paths with numeric segments', () => {
    const draft: Record<string, unknown> = {
      builder: { collections: [{ id: 'c0', fields: [{ id: 'f0', name: 'status' }] }] },
    }
    const applied = applySectionPatch(draft, [
      { op: 'merge', collection: 'builder.collections.0.fields', id: 'f0', value: { options: ['on', 'off'] } },
    ])
    expect(applied).toBe(1)
    const field = ((draft.builder as { collections: { fields: Record<string, unknown>[] }[] }).collections[0].fields)[0]
    expect(field.options).toEqual(['on', 'off'])
  })

  it('is a no-op (not an error) on a missing collection or unmatched row without insert', () => {
    const draft: Record<string, unknown> = { permissions: [] }
    const applied = applySectionPatch(draft, [
      { op: 'merge', collection: 'nope', id: 'x', value: {} },
      { op: 'merge', collection: 'permissions', match: { roleId: 'ghost' }, value: { level: 'full' } },
    ])
    expect(applied).toBe(0)
  })
})

describe('incremental ops: add to a list or a text without resending it', () => {
  const run = (draft: Record<string, unknown>, ...ops: PatchOp[]) => applySectionPatchReport(draft, ops)

  it('add_to_set appends once: the retry changes nothing and is reported as unchanged', () => {
    const draft: Record<string, unknown> = { sourceIds: ['doc-1'] }
    const op: PatchOp = { op: 'add_to_set', path: 'sourceIds', value: 'doc-2' }
    expect(run(draft, op)).toEqual({ applied: 1, changed: ['sourceIds'], unchanged: [], notApplied: [] })
    expect(run(draft, op)).toEqual({ applied: 1, changed: [], unchanged: ['sourceIds'], notApplied: [] })
    expect(draft.sourceIds).toEqual(['doc-1', 'doc-2'])
  })

  it('add_to_set creates the array, and its parents, when absent or null', () => {
    const draft: Record<string, unknown> = { meta: { tags: null } }
    expect(run(draft, { op: 'add_to_set', path: 'meta.tags', value: 'a' }, { op: 'add_to_set', path: 'evidence.sourceIds', value: 7 }).applied).toBe(2)
    expect(draft).toEqual({ meta: { tags: ['a'] }, evidence: { sourceIds: [7] } })
  })

  it('add_to_set keeps what a concurrent writer added, where a set would have erased it', () => {
    // The agent read ['doc-1']; someone added 'doc-9' since; the op runs on the CURRENT value.
    const draft: Record<string, unknown> = { sourceIds: ['doc-1', 'doc-9'] }
    run(draft, { op: 'add_to_set', path: 'sourceIds', value: 'doc-2' })
    expect(draft.sourceIds).toEqual(['doc-1', 'doc-9', 'doc-2'])
  })

  it('addresses a row by id or match instead of a position', () => {
    const draft: Record<string, unknown> = {
      features: [{ id: 'feat-1', sourceIds: ['doc-1'] }, { id: 'feat-2' }],
      permissions: [{ roleId: 'admin', capabilityId: 'cap-a', notes: 'Owner.' }],
    }
    const report = run(draft,
      { op: 'add_to_set', collection: 'features', id: 'feat-2', path: 'sourceIds', value: 'doc-2' },
      { op: 'append_text', collection: 'permissions', match: { roleId: 'admin' }, path: 'notes', value: 'Reviewed.', separator: ' ' },
      { op: 'add_to_set', collection: 'features', id: 'ghost', path: 'sourceIds', value: 'doc-3' })
    expect(report.changed).toEqual(['features[feat-2].sourceIds', 'permissions[{"roleId":"admin"}].notes'])
    expect(report.notApplied).toEqual([{ index: 2, op: 'add_to_set', target: 'features[ghost].sourceIds', reason: 'no row matched in the collection' }])
    expect((draft.features as Array<Record<string, unknown>>)[1].sourceIds).toEqual(['doc-2'])
    expect((draft.permissions as Array<Record<string, unknown>>)[0].notes).toBe('Owner. Reviewed.')
  })

  it('remove_from_set removes every occurrence, then finds nothing left to do', () => {
    const draft: Record<string, unknown> = { tags: ['a', 'b', 'a', 'c'] }
    const op: PatchOp = { op: 'remove_from_set', path: 'tags', value: 'a' }
    expect(run(draft, op).changed).toEqual(['tags'])
    expect(draft.tags).toEqual(['b', 'c'])
    expect(run(draft, op)).toMatchObject({ applied: 1, unchanged: ['tags'] })
    expect(run(draft, { op: 'remove_from_set', path: 'missing', value: 'a' }).notApplied[0].reason).toBe('no array at this path')
    expect(draft).toEqual({ tags: ['b', 'c'] })
  })

  it('append_text adds a paragraph once, after a blank line by default', () => {
    const draft: Record<string, unknown> = { brief: 'First paragraph.' }
    const op: PatchOp = { op: 'append_text', path: 'brief', value: 'Second paragraph.' }
    expect(run(draft, op).changed).toEqual(['brief'])
    expect(run(draft, op)).toMatchObject({ applied: 1, changed: [], unchanged: ['brief'] })
    expect(draft.brief).toBe('First paragraph.\n\nSecond paragraph.')
    run(draft, { op: 'append_text', path: 'notes.summary', value: 'Created.' }, { op: 'append_text', path: 'empty', value: 'x' })
    expect(draft).toMatchObject({ notes: { summary: 'Created.' }, empty: 'x' })
  })

  it('replace_text replaces a text that occurs exactly once and says which way it failed otherwise', () => {
    const draft: Record<string, unknown> = { brief: 'Orders ship in 3 days. Returns take 3 days.' }
    expect(run(draft, { op: 'replace_text', path: 'brief', find: '3 days', value: '5 days' }).notApplied).toEqual([
      { index: 0, op: 'replace_text', target: 'brief', reason: '`find` occurs 2 times in the text: extend it until it is unique' },
    ])
    expect(run(draft, { op: 'replace_text', path: 'brief', find: 'ship in 3 days', value: 'ship in 5 days' }).changed).toEqual(['brief'])
    expect(draft.brief).toBe('Orders ship in 5 days. Returns take 3 days.')
    // The retry: `find` is gone. Nothing is written, and the reason names the likely cause.
    const retry = run(draft, { op: 'replace_text', path: 'brief', find: 'ship in 3 days', value: 'ship in 5 days' })
    expect(retry.applied).toBe(0)
    expect(retry.notApplied[0].reason).toBe('`find` occurs 0 times in the text; the text already contains `value`, so this may be a retry of an edit that landed')
    expect(run(draft, { op: 'replace_text', path: 'brief', find: 'never there', value: 'x' }).notApplied[0].reason).toBe('`find` occurs 0 times in the text')
    expect(draft.brief).toBe('Orders ship in 5 days. Returns take 3 days.')
  })

  it('replace_text does not write a value that extends find a second time', () => {
    const draft: Record<string, unknown> = { title: 'Hello' }
    const op: PatchOp = { op: 'replace_text', path: 'title', find: 'Hello', value: 'Hello world' }
    expect(run(draft, op).changed).toEqual(['title'])
    expect(run(draft, op)).toMatchObject({ applied: 1, changed: [], unchanged: ['title'] })
    expect(draft.title).toBe('Hello world')
  })

  it('never destroys a value of another kind to make room', () => {
    const draft: Record<string, unknown> = { brief: 'text', tags: ['a'], count: 3, rows: [{ id: 'r' }] }
    const report = run(draft,
      { op: 'add_to_set', path: 'brief', value: 'x' },
      { op: 'append_text', path: 'tags', value: 'x' },
      { op: 'add_to_set', path: 'count.tags', value: 'x' },
      { op: 'replace_text', path: 'count', find: '3', value: '4' },
      { op: 'append_text', path: 'rows.5.note', value: 'x' })
    expect(report.applied).toBe(0)
    expect(report.notApplied.map((n) => n.reason)).toEqual([
      'the value at this path is not an array', 'the value at this path is not a string',
      'the path crosses a value that is not an object', 'the value at this path is not a string',
      'the path crosses a value that is not an object',
    ])
    expect(draft).toEqual({ brief: 'text', tags: ['a'], count: 3, rows: [{ id: 'r' }] })
  })

  it.each([
    [{ op: 'add_to_set', path: '__proto__.polluted', value: 'x' }, 'unsafe or empty path segment'],
    [{ op: 'append_text', path: 'a.constructor.b', value: 'x' }, 'unsafe or empty path segment'],
    [{ op: 'remove_from_set', path: 'tags.prototype', value: 'x' }, 'unsafe or empty path segment'],
    [{ op: 'replace_text', path: 'projectId', find: 'a', value: 'b' }, 'projectId is controlled'],
    [{ op: 'add_to_set', path: 'tags', value: { id: 1 } }, 'takes a scalar value'],
    [{ op: 'add_to_set', path: 'tags' }, 'requires path and value'],
    [{ op: 'add_to_set', value: 'x' }, 'requires path and value'],
    [{ op: 'add_to_set', path: 'tags', value: 'x', id: 'row' }, 'pass collection too'],
    [{ op: 'add_to_set', path: 'tags', value: 'x', collection: 'rows' }, 'exactly one id or match selector'],
    [{ op: 'append_text', path: 'brief', value: 3 }, 'takes a string value'],
    [{ op: 'append_text', path: 'brief', value: '' }, 'nonempty value'],
    [{ op: 'append_text', path: 'brief', value: 'x', separator: 1 }, 'separator must be a string'],
    [{ op: 'replace_text', path: 'brief', value: 'x' }, 'nonempty find'],
    [{ op: 'replace_text', path: 'brief', find: '', value: 'x' }, 'nonempty find'],
  ])('refuses %j before touching the draft', (op, why) => {
    const draft = { tags: ['a'], brief: 'text' }
    expect(() => applySectionPatch(draft, [{ op: 'set', path: 'brief', value: 'changed' }, op as unknown as PatchOp])).toThrow(`Invalid patch operation 1: `)
    expect(() => applySectionPatch(draft, [op as unknown as PatchOp])).toThrow(why)
    expect(draft).toEqual({ tags: ['a'], brief: 'text' })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})
