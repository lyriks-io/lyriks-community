// Shared shaping/cap helpers — keep MCP responses token-small.
//
// Two ideas:
//  • get_section/get_project use `summarize` + `getPath` for explicit targeted reads.
//  • EVERY tool result passes through `capResult`, so even a naive full read can
//    never blow the context budget — it auto-degrades to a projection/shape + a
//    hint to re-query narrowly.

export const RESULT_CAP = Number(process.env.MCP_RESULT_CAP ?? 24000) // chars (~6k tokens)

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v) ?? ''
  } catch {
    return ''
  }
}

/** Compact shape of a value: scalars verbatim, arrays/objects as size markers. */
export function describe(v: unknown): unknown {
  if (Array.isArray(v)) return `array(${v.length})`
  if (v && typeof v === 'object') return `object(${Object.keys(v).length} keys)`
  return v
}

/** Two-level shape summary — tiny, so an agent can see what to drill into. */
export function summarize(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const inner: Record<string, unknown> = {}
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) inner[k2] = describe(v2)
      out[k] = inner
    } else {
      out[k] = describe(v)
    }
  }
  return out
}

/** Read a dotted path (object keys + array indices). */
export function getPath(root: unknown, path: string): unknown {
  let node: unknown = root
  for (const k of path.split('.')) {
    if (node == null || !k || ['__proto__', 'prototype', 'constructor'].includes(k)) return undefined
    if (Array.isArray(node)) {
      const i = Number(k)
      node = /^(0|[1-9]\d*)$/.test(k) && Number.isSafeInteger(i) ? node[i] : undefined
    } else if (typeof node === 'object') {
      node = Object.prototype.hasOwnProperty.call(node, k) ? (node as Record<string, unknown>)[k] : undefined
    } else {
      return undefined
    }
  }
  return node
}

/** Keep only an object's scalar (non-nested) fields — a cheap list projection. */
function projectScalars(it: unknown): unknown {
  if (!it || typeof it !== 'object' || Array.isArray(it)) return it
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(it as Record<string, unknown>)) {
    if (v === null || typeof v !== 'object') out[k] = v
  }
  return out
}

/**
 * What a capped answer tells the agent to do next. `args` lists every tool
 * argument `text` names, so a contract test can hold the text to the schema:
 * advice naming an argument the tool refuses is worse than no advice.
 */
export interface CapHint {
  text: string
  args: string[]
}

export interface CapOptions {
  cap?: number
  hint?: CapHint
}

/** Names no argument: most tools accept none that would narrow their answer. */
export const DEFAULT_CAP_HINT: CapHint = {
  text:
    'Response capped. Scalars are verbatim, long strings are clipped, and arrays show their first rows ' +
    '(scalar fields only) with `total` and `returned`. The input schema of this tool lists the arguments ' +
    'that narrow its answer, when it has any.',
  args: [],
}

const size = (v: unknown): number => safeStringify(v).length

// Room the smallest stand-in needs: "object(12345 keys)" or a clipped-string marker.
const MIN_SLOT = 32
// Below this an array or object is a size marker: a sample would hold nothing.
const SAMPLE_MIN = 96
// A sampled row keeps the text that identifies it, not its prose.
const ROW_STRING = 300
// Object levels expanded below the top one; deeper objects become size markers.
const DEPTH = 2

/** Clip a string so that its JSON form, escapes included, fits `budget`. */
function clipString(s: string, budget: number): string {
  if (size(s) <= budget) return s
  let keep = Math.max(0, budget - 24)
  while (keep > 0 && size(s.slice(0, keep)) + 22 > budget) keep = Math.floor(keep * 0.8)
  return `${s.slice(0, keep)}...(+${s.length - keep} chars)`
}

/** One sampled row: scalar fields only, text clipped, so a row stays a row. */
function projectRow(it: unknown): unknown {
  if (typeof it === 'string') return clipString(it, ROW_STRING)
  if (!it || typeof it !== 'object') return it
  if (Array.isArray(it)) return describe(it)
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(it as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = clipString(v, ROW_STRING)
    else if (v === null || typeof v !== 'object') out[k] = v
  }
  return out
}

/** Head rows that fit `budget`, with the real length so the agent knows what it is missing. */
function sampleArray(arr: unknown[], budget: number): { total: number; returned: number; items: unknown[] } {
  const items: unknown[] = []
  let used = 64 // the wrapper keys and two counters
  for (const it of arr) {
    const row = projectRow(it)
    const cost = size(row) + 1
    if (used + cost > budget) break
    items.push(row)
    used += cost
  }
  return { total: arr.length, returned: items.length, items }
}

function degrade(v: unknown, budget: number, depth: number): unknown {
  if (typeof v === 'string') return clipString(v, budget)
  if (Array.isArray(v)) return budget >= SAMPLE_MIN ? sampleArray(v, budget) : describe(v)
  if (v && typeof v === 'object') {
    return depth > 0 && budget >= SAMPLE_MIN ? fitObject(v as Record<string, unknown>, budget, depth - 1) : describe(v)
  }
  return v
}

/**
 * An object that fits `budget`. Every kept key is owed the room of a marker,
 * then the rest is shared by max-min fairness: values smaller than the fair
 * share stay whole (scalars always do) and the large ones split what is left,
 * so one huge array cannot starve the others. Keys past the budget are counted.
 */
function fitObject(obj: Record<string, unknown>, budget: number, depth: number): Record<string, unknown> {
  const entries = Object.entries(obj).map(([k, v]) => {
    const key = size(k) + 1
    const full = key + size(v) + 1
    return { k, v, key, full, min: Math.min(full, key + MIN_SLOT + 1) }
  })
  let room = budget - 2 - 24 // the braces and the omitted-keys counter
  const kept: typeof entries = []
  for (const e of entries) {
    if (e.min > room) break
    kept.push(e)
    room -= e.min
  }
  const grants = new Map<string, number>()
  let left = kept.length
  for (const e of [...kept].sort((a, b) => a.full - b.full)) {
    const extra = Math.min(e.full - e.min, Math.floor(room / left))
    grants.set(e.k, e.min + extra)
    room -= extra
    left--
  }
  const out: Record<string, unknown> = {}
  for (const e of kept) {
    const grant = grants.get(e.k) ?? e.min
    out[e.k] = e.full <= grant ? e.v : degrade(e.v, grant - e.key - 1, depth)
  }
  if (kept.length < entries.length) out._omittedKeys = entries.length - kept.length
  return out
}

/** The estimates above are close, not exact: shrink until the real serialization fits. */
function fitUnder(cap: number, start: number, build: (budget: number) => unknown): unknown | undefined {
  for (let budget = start; budget >= SAMPLE_MIN; budget = Math.floor(budget * 0.7)) {
    const out = build(budget)
    if (size(out) <= cap) return out
  }
  return undefined
}

/**
 * The universal safety net: a result that serializes over the cap is degraded,
 * and what comes back is ALWAYS under the cap.
 *  - array: every item projected to its scalar fields (a list keeps id/name);
 *    if still too big, the head rows that fit plus `total`.
 *  - object: `partial` keeps scalars verbatim and degrades nested arrays to
 *    head rows plus `total`/`returned`, the budget shared fairly between them;
 *    the two-level `shape` rides along only while it is cheap.
 * The hint names no argument unless the tool passed its own (see cap-hints.ts).
 * Small results pass through untouched.
 */
export function capResult(result: unknown, options: CapOptions = {}): unknown {
  const cap = options.cap ?? RESULT_CAP
  const hint = (options.hint ?? DEFAULT_CAP_HINT).text
  const text = safeStringify(result)
  if (text.length <= cap) return result

  if (Array.isArray(result)) {
    const head = { _capped: true, kind: 'array', total: result.length }
    const projected = {
      ...head,
      note: 'Large items were projected to scalar fields. Fetch a single item for full detail.',
      items: result.map(projectScalars),
    }
    if (size(projected) <= cap) return projected
    return (
      fitUnder(cap, cap - size(head) - size(hint) - 32, (budget) => ({ ...head, ...sampleArray(result, budget), hint })) ??
      (size({ ...head, hint }) <= cap ? { ...head, hint } : head)
    )
  }

  if (result && typeof result === 'object') {
    const head = { _capped: true, kind: 'object', bytes: text.length }
    const shape = summarize(result as Record<string, unknown>)
    // `partial` already shows every key it could afford, so the shape only
    // rides along while it costs little of the budget the rows need.
    const extra = size(shape) <= cap * 0.1 ? { hint, shape } : { hint }
    return (
      fitUnder(cap, cap - size(head) - size(extra) - 32, (budget) => ({
        ...head,
        ...extra,
        partial: fitObject(result as Record<string, unknown>, budget, DEPTH),
      })) ?? (size({ ...head, hint }) <= cap ? { ...head, hint } : head)
    )
  }

  return { _capped: true, value: clipString(typeof result === 'string' ? result : text, Math.max(MIN_SLOT, cap - 32)) }
}

/** Missing paths are explicit rather than silently disappearing during JSON encoding. */
export function selectPaths(root: unknown, paths: string[]): { values: Record<string, unknown>; missingPaths: string[] } {
  const values: Record<string, unknown> = Object.create(null)
  const missingPaths: string[] = []
  for (const path of paths) {
    const value = getPath(root, path)
    if (value === undefined) missingPaths.push(path)
    else values[path] = value
  }
  return { values, missingPaths }
}
