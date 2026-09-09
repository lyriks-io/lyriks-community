// Shared shaping/cap helpers — keep MCP responses token-small.
//
// Two ideas:
//  • get_section/get_project use `summarize` + `getPath` for explicit targeted reads.
//  • EVERY tool result passes through `capResult`, so even a naive full read can
//    never blow the context budget — it auto-degrades to a projection/shape + a
//    hint to re-query narrowly.

const CAP = Number(process.env.MCP_RESULT_CAP ?? 24000) // chars (~6k tokens)

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
    if (node == null) return undefined
    if (Array.isArray(node)) {
      const i = Number(k)
      node = Number.isInteger(i) ? node[i] : undefined
    } else if (typeof node === 'object') {
      node = (node as Record<string, unknown>)[k]
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
 * The universal safety net: if a result serializes over the cap, degrade it.
 *  • array → project each item to scalar fields (so a list keeps id/name/…);
 *    if still too big, return a head sample + total.
 *  • object → a two-level shape + hint to use summary/paths.
 * Small results pass through untouched.
 */
export function capResult(result: unknown, cap: number = CAP): unknown {
  const text = safeStringify(result)
  if (text.length <= cap) return result

  if (Array.isArray(result)) {
    const projected = result.map(projectScalars)
    if (safeStringify(projected).length <= cap) {
      return {
        _capped: true,
        kind: 'array',
        total: result.length,
        note: 'Large items were projected to scalar fields. Fetch a single item for full detail.',
        items: projected
      }
    }
    const items: unknown[] = []
    let acc = 0
    for (const it of projected) {
      const s = safeStringify(it)
      if (acc + s.length > cap * 0.85 && items.length > 0) break
      items.push(it)
      acc += s.length
    }
    return {
      _capped: true,
      kind: 'array',
      total: result.length,
      returned: items.length,
      items,
      hint: 'Response capped. Narrow the query (e.g. workspace_id) or page through.'
    }
  }

  if (result && typeof result === 'object') {
    return {
      _capped: true,
      kind: 'object',
      bytes: text.length,
      shape: summarize(result as Record<string, unknown>),
      hint: 'Response capped. Re-read with summary:true or paths:["a.b"] to fetch only what you need.'
    }
  }

  return { _capped: true, value: text.slice(0, cap) }
}
