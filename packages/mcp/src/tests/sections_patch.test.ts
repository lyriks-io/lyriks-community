/**
 * Tests: applySectionPatch — id-keyed and keyless (match-addressed) collections,
 * dotted collection paths, and the no-id-injection rule on match inserts.
 */

import { describe, it, expect } from 'vitest'
import { applySectionPatch, type PatchOp } from '../tools/sections.js'

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
