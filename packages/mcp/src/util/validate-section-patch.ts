import type { PatchOp } from '../tools/sections.js'

// Declared here, not in sections.ts, so this module keeps importing only a type from it.
export const INCREMENTAL_OPS = ['add_to_set', 'remove_from_set', 'append_text', 'replace_text'] as const
export type IncrementalOp = (typeof INCREMENTAL_OPS)[number]

const dangerous = new Set(['__proto__', 'prototype', 'constructor'])
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

/** A row selector is exactly one of a nonempty id or a nonempty scalar match. */
function checkSelector(op: PatchOp, invalid: (why: string) => never): void {
  if ((op.id === undefined) === (op.match === undefined)) invalid('collection operations require exactly one id or match selector')
  if (op.id !== undefined && (typeof op.id !== 'string' || !op.id)) invalid('id must be a nonempty string')
  if (op.match !== undefined && (!record(op.match) || !Object.keys(op.match).length || Object.entries(op.match).some(([key, value]) => dangerous.has(key) || (value !== null && !['string', 'number', 'boolean'].includes(typeof value))))) invalid('match must be a nonempty object of scalar fields')
}

/** Validate the complete plan before mutating even the temporary draft. */
export function validateSectionPatch(operations: PatchOp[]): void {
  if (!Array.isArray(operations) || !operations.length || operations.length > 1000) throw new Error('A patch must contain 1 to 1000 operations.')
  for (const [index, op] of operations.entries()) {
    const invalid = (why: string): never => { throw new Error(`Invalid patch operation ${index}: ${why}`) }
    if (!record(op) || !['set', 'merge', 'remove', ...INCREMENTAL_OPS].includes(op.op)) invalid('unknown operation')
    if (op.insert !== undefined && typeof op.insert !== 'boolean') invalid('insert must be a boolean')
    for (const path of [op.path, op.collection]) {
      if (path === undefined) continue
      if (typeof path !== 'string' || path.split('.').some(key => !key || dangerous.has(key))) invalid('unsafe or empty path segment')
      if (path.split('.')[0] === 'projectId') invalid('projectId is controlled by the authenticated request')
    }
    if ((INCREMENTAL_OPS as readonly string[]).includes(op.op)) {
      if (!op.path || !Object.hasOwn(op, 'value')) invalid(`${op.op} requires path and value`)
      // An optional row selector: `path` is then read inside the matched row.
      if (op.collection !== undefined) checkSelector(op, invalid)
      else if (op.id !== undefined || op.match !== undefined) invalid('id and match select a row of a collection: pass collection too')
      if (op.op === 'add_to_set' || op.op === 'remove_from_set') {
        if (!['string', 'number', 'boolean'].includes(typeof op.value)) invalid(`${op.op} takes a scalar value (string, number or boolean)`)
      } else if (typeof op.value !== 'string') invalid(`${op.op} takes a string value`)
      if (op.op === 'append_text' && !op.value) invalid('append_text requires a nonempty value')
      if (op.op === 'replace_text' && (typeof op.find !== 'string' || !op.find)) invalid('replace_text requires a nonempty find')
      if (op.separator !== undefined && typeof op.separator !== 'string') invalid('separator must be a string')
    } else if (op.op === 'set') {
      if (!op.path || op.collection !== undefined || op.id !== undefined || op.match !== undefined || !Object.hasOwn(op, 'value')) invalid('set requires path and value, without a collection selector')
    } else if (op.op === 'merge' || op.collection !== undefined) {
      if (!op.collection || op.path !== undefined) invalid('collection operations require exactly one id or match selector')
      checkSelector(op, invalid)
      if (op.op === 'merge' && (!record(op.value) || Object.keys(op.value).some(key => dangerous.has(key)))) invalid('merge requires a safe object value')
    } else if (!op.path) invalid('remove requires a path or a collection selector')
  }
}
