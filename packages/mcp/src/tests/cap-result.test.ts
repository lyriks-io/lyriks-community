/**
 * Tests: capResult, the safety net every tool result passes through.
 * A capped object keeps its scalars and shows the head of each array with its
 * real length; whatever the input, what comes back serializes under the cap;
 * and a recovery hint never names an argument its tool refuses.
 */

import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createMcpServer } from '../server.js'
import type { BoundOverlay } from '../enterprise/overlay.js'
import { CAP_HINTS } from '../util/cap-hints.js'
import { DEFAULT_CAP_HINT, RESULT_CAP, capResult } from '../util/shape.js'

const size = (v: unknown) => JSON.stringify(v).length
const row = (i: number) => ({ key: `rule:${i}`, featureId: `feat-${i % 7}`, status: 'implemented', scope: 'element', nested: { deep: [i] } })

type Sampled = { total: number; returned: number; items: Array<Record<string, unknown>> }
type Capped = { _capped: true; kind: string; bytes: number; hint: string; shape?: unknown; partial: Record<string, unknown> }

describe('capResult on an object', () => {
  it('passes a small result through untouched', () => {
    const result = { ok: true, rows: [1, 2, 3] }
    expect(capResult(result)).toBe(result)
  })

  it('keeps scalars verbatim and degrades a huge array to its head rows with the real total', () => {
    const result = { available: true, ok: true, checked: 5900, stale: Array.from({ length: 4973 }, (_, i) => row(i)) }
    const capped = capResult(result) as Capped
    expect(capped).toMatchObject({ _capped: true, kind: 'object', bytes: size(result) })
    expect(capped.partial).toMatchObject({ available: true, ok: true, checked: 5900 })
    const stale = capped.partial.stale as Sampled
    expect(stale.total).toBe(4973)
    expect(stale.returned).toBe(stale.items.length)
    expect(stale.returned).toBeGreaterThan(50)
    // A sampled row keeps its scalar fields, not its nested ones.
    expect(stale.items[0]).toEqual({ key: 'rule:0', featureId: 'feat-0', status: 'implemented', scope: 'element' })
    expect(size(capped)).toBeLessThanOrEqual(RESULT_CAP)
  })

  it('shares the budget between arrays instead of letting the first one eat it', () => {
    const big = (n: number) => Array.from({ length: n }, (_, i) => row(i))
    const capped = capResult({ first: big(5000), second: big(5000), small: [1, 2, 3], third: big(5000) }) as Capped
    const counts = ['first', 'second', 'third'].map((k) => (capped.partial[k] as Sampled).returned)
    expect(Math.min(...counts)).toBeGreaterThan(20)
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(2)
    // An array smaller than its fair share stays whole.
    expect(capped.partial.small).toEqual([1, 2, 3])
  })

  it('degrades arrays one level down too', () => {
    const capped = capResult({ snapshot: { version: 1, surfaces: Array.from({ length: 3000 }, (_, i) => row(i)) } }) as Capped
    const snapshot = capped.partial.snapshot as Record<string, unknown>
    expect(snapshot.version).toBe(1)
    expect(snapshot.surfaces).toMatchObject({ total: 3000 })
  })

  it('keeps the shape only while it is cheap', () => {
    const few = capResult({ rows: Array.from({ length: 3000 }, (_, i) => row(i)) }) as Capped
    expect(few.shape).toEqual({ rows: 'array(3000)' })
    const manyKeys = Object.fromEntries(Array.from({ length: 3000 }, (_, i) => [`key-${i}`, { n: i, text: 'x'.repeat(40) }]))
    const wide = capResult(manyKeys) as Capped
    expect(wide.shape).toBeUndefined()
    expect(wide.partial._omittedKeys).toBeGreaterThan(0)
    expect(size(wide)).toBeLessThanOrEqual(RESULT_CAP)
  })

  it('uses the neutral hint by default and the hint of the tool when it has one', () => {
    const result = { rows: Array.from({ length: 3000 }, (_, i) => row(i)) }
    const neutral = capResult(result) as Capped
    expect(neutral.hint).toBe(DEFAULT_CAP_HINT.text)
    expect(neutral.hint).not.toMatch(/summary|paths|workspace_id/)
    expect((capResult(result, { hint: CAP_HINTS.get_section }) as Capped).hint).toBe(CAP_HINTS.get_section.text)
  })
})

describe('capResult stays under the cap whatever it is given', () => {
  const deep = (levels: number): unknown => (levels ? { level: levels, text: 'y'.repeat(900), rows: [row(levels), row(levels + 1)], child: deep(levels - 1) } : 'leaf')
  const escapes = '"\\\n\u0001'.repeat(20000)
  const adversarial: Record<string, unknown> = {
    'one huge array': { rows: Array.from({ length: 20000 }, (_, i) => row(i)) },
    'many arrays': Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`list${i}`, Array.from({ length: 60 }, (_, j) => row(j))])),
    'deeply nested objects': deep(60),
    'long strings': { title: 'x'.repeat(200000), body: escapes, rows: [{ id: 1, text: escapes }] },
    'thousands of scalar keys': Object.fromEntries(Array.from({ length: 9000 }, (_, i) => [`k${i}`, i])),
    'an index-like map of objects': { index: Object.fromEntries(Array.from({ length: 5900 }, (_, i) => [`rule:${i}`, { file: `src/f${i}.ts`, line: i, signature: 'const x = 1' }])) },
    'rows made of long strings': { rows: Array.from({ length: 50 }, () => ({ id: 'r', text: escapes })) },
    'a top-level array of long strings': Array.from({ length: 5 }, () => ({ id: 'r', text: escapes })),
    'a top-level array of arrays': Array.from({ length: 200 }, () => Array.from({ length: 200 }, (_, i) => i)),
    'a bare long string': escapes,
  }
  it.each(Object.keys(adversarial))('%s', (name) => {
    for (const cap of [RESULT_CAP, 2000, 600]) {
      const capped = capResult(adversarial[name], { cap })
      expect(size(capped), `${name} under ${cap}`).toBeLessThanOrEqual(cap)
      expect(capped).toMatchObject({ _capped: true })
    }
  })
})

/** A bound overlay that registers the Enterprise tool names, as the real one does. */
function overlay(): BoundOverlay {
  const noop = async () => ({})
  return {
    portfolio: {
      listWorkspaces: noop, listProjects: noop, getProject: noop, createProject: noop,
      updateProject: noop, deleteProject: noop, annotateWizardPortfolio: async (portfolio: unknown) => portfolio,
    },
    registerTools: (mcp) => {
      for (const name of ['get_model', 'get_view', 'find_inconsistencies', 'apply_rule', 'generate_artifact'])
        mcp.tool(name, { project_id: z.string() }, async () => ({ content: [] }))
    },
  } as unknown as BoundOverlay
}

describe('recovery hints name only arguments their tool accepts', () => {
  // `name:value` is how a hint spells an argument; the colon is glued to the value.
  const spelled = (text: string) => [...text.matchAll(/\b([a-z][a-z_]*):(?=\S)/g)].map((m) => m[1])

  it.each([['Community', null], ['Enterprise', overlay()]] as const)('on the %s registration', (_edition, ee) => {
    // @ts-expect-error testing registered wire schemas
    const tools = createMcpServer(ee)._registeredTools as Record<string, { inputSchema: { shape: Record<string, unknown> } }>
    for (const [tool, hint] of Object.entries(CAP_HINTS)) {
      expect(tools[tool], `${tool} is a registered tool`).toBeDefined()
      const accepted = Object.keys(tools[tool].inputSchema.shape)
      expect(hint.args.length, `${tool} declares the arguments it names`).toBeGreaterThan(0)
      for (const arg of hint.args) {
        expect(accepted, `${tool} accepts ${arg}`).toContain(arg)
        expect(hint.text, `${tool} hint spells ${arg}`).toContain(`${arg}:`)
      }
      for (const arg of spelled(hint.text)) expect(hint.args, `${tool} hint text names ${arg}`).toContain(arg)
    }
  })

  it('names no argument in the default hint', () => {
    expect(DEFAULT_CAP_HINT.args).toEqual([])
    expect(spelled(DEFAULT_CAP_HINT.text)).toEqual([])
  })
})
