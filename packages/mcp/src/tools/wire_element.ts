// Tool: wire_element
// Edit ONE already-built Experience-Builder element by id — WITHOUT rebuilding its
// whole screen. build_screen replaces a surface's entire layout, so tweaking a
// single element (add a required validation to an input, wire a transition on a
// button, gate it with visibleWhen, set/clear a binding, rename it) previously
// meant a raw builder.nodes.<id> patch or a full rebuild. This merges the given
// fields into the node's wiring and writes the draft back through the wizard app's PUT (same
// sync as build_screen). Get the node id from build_screen's `nodes` output or
// get_section builder.nodes.

import type { LyriksClient } from '../lyriks-client.js'

const VALID_TRIGGERS = ['click', 'hover', 'change', 'submit']
const VALID_OPS = ['truthy', 'falsy', 'eq', 'neq']

type CallSpec = {
  label?: string
  endpoint?: string
  latencyMs?: number
  loadingPath?: string
  outcome?: string
  resultPath?: string
  resultValue?: unknown
  errorPath?: string
}
type OnSpec = {
  trigger?: string
  navigate?: string
  setState?: [string, unknown]
  toggle?: string
  increment?: string
  by?: unknown
  createRecord?: string
  fieldMap?: Record<string, string>
  selectRecord?: string
  navigateBack?: boolean
  print?: { path?: string; value?: string } | string
  call?: CallSpec
  when?: { path?: string; op?: string; value?: unknown }
}
type Cond = { path?: string; op?: string; value?: unknown }
type Bind = { kind?: string; ref?: string } | null
type Validation = { kind?: unknown; param?: unknown; message?: unknown }
type Gate = { personaIds?: string[]; mode?: string; allow?: boolean } | null
type Media = { src?: string; alt?: string; fit?: string; aspectRatio?: string } | null
type Appearance = Record<string, unknown> | null

export type WireElementArgs = {
  project_id: string
  node_id: string
  label?: string
  bind?: Bind
  visibleWhen?: Cond | null
  gate?: Gate
  validations?: Validation[]
  on?: OnSpec[]
  replaceTransitions?: boolean
  requireValid?: boolean
  appearance?: Appearance
  media?: Media
  /** `list` only: how the row template repeats (+ columns for grid/cards). */
  rowLayout?: string
  rowColumns?: number
  /** `select` only: authored choices, or a live/dependent collection source. */
  options?: unknown[] | null
  optionsFrom?: { collection?: string; field?: string; filterField?: string; filterPath?: string } | null
}

/** Kinds that hold a value — they default to the `change` trigger. */
const FIELD_KINDS = ['input', 'textarea', 'select', 'checkbox']

// the wizard app's validation catalog (parse-experience-builder coerceValidations): anything
// else is coerced to 'required', so reject-by-mapping here keeps authors honest.
const VALID_VALIDATION_KINDS = ['required', 'email', 'min', 'max', 'pattern']

/** lyriks stores `param` as a string (length for min/max, regex source for pattern). */
export const mkValidation = (v: Validation, id: string): Record<string, unknown> => ({
  id,
  kind: VALID_VALIDATION_KINDS.includes(String(v.kind)) ? v.kind : 'required',
  param: v.param !== undefined && v.param !== null ? String(v.param) : undefined,
  message: typeof v.message === 'string' ? v.message : '',
  description: '',
})

/** Persona gate → lyriks shape {personaIds, mode:'visible'|'enabled', allow}. */
export const mkGate = (g: Gate): Record<string, unknown> | null => {
  if (!g || !Array.isArray(g.personaIds) || g.personaIds.length === 0) return null
  return {
    personaIds: g.personaIds.filter((x) => typeof x === 'string'),
    mode: g.mode === 'enabled' ? 'enabled' : 'visible',
    allow: typeof g.allow === 'boolean' ? g.allow : true,
  }
}

const mkWhen = (w?: Cond): Record<string, unknown> | null => {
  if (!w || typeof w.path !== 'string' || !w.path) return null
  return {
    path: w.path,
    op: VALID_OPS.includes(String(w.op)) ? w.op : 'truthy',
    expected: w.value !== undefined ? String(w.value) : undefined,
  }
}

const mkTransition = (o: OnSpec, defaultTrigger: string, id: string): Record<string, unknown> | null => {
  const trigger = VALID_TRIGGERS.includes(String(o.trigger)) ? o.trigger : defaultTrigger
  let effect: Record<string, unknown> | null = null
  if (typeof o.navigate === 'string') effect = { kind: 'navigate', target: o.navigate }
  else if (Array.isArray(o.setState)) effect = { kind: 'setState', target: String(o.setState[0]), value: String(o.setState[1]) }
  else if (typeof o.toggle === 'string') effect = { kind: 'toggleState', target: o.toggle }
  else if (typeof o.increment === 'string')
    effect = { kind: 'incrementState', target: o.increment, value: o.by !== undefined ? String(o.by) : '1' }
  else if (typeof o.createRecord === 'string')
    effect = {
      kind: 'createRecord',
      target: o.createRecord,
      ...(o.fieldMap && typeof o.fieldMap === 'object' ? { fieldMap: o.fieldMap } : {}),
    }
  else if (typeof o.selectRecord === 'string') effect = { kind: 'selectRecord', target: o.selectRecord }
  else if (o.navigateBack === true) effect = { kind: 'navigateBack', target: '' }
  else if (o.print) {
    const p = typeof o.print === 'string' ? { path: o.print, value: '' } : o.print
    if (p.path) effect = { kind: 'print', target: p.path, value: p.value !== undefined ? String(p.value) : '' }
  } else if (o.call && typeof o.call === 'object') {
    const c = o.call
    effect = {
      kind: 'call',
      target: '',
      call: {
        label: typeof c.label === 'string' ? c.label : 'Operation',
        endpoint: typeof c.endpoint === 'string' ? c.endpoint : undefined,
        latencyMs: typeof c.latencyMs === 'number' ? c.latencyMs : undefined,
        loadingPath: typeof c.loadingPath === 'string' ? c.loadingPath : undefined,
        outcome: c.outcome === 'error' ? 'error' : 'success',
        resultPath: typeof c.resultPath === 'string' ? c.resultPath : undefined,
        resultValue: c.resultValue !== undefined ? String(c.resultValue) : undefined,
        errorPath: typeof c.errorPath === 'string' ? c.errorPath : undefined,
      },
    }
  }
  if (!effect) return null
  const when = mkWhen(o.when)
  return when ? { id, trigger, effect, when } : { id, trigger, effect }
}

export async function wireElementHandler(args: WireElementArgs, lyriks: LyriksClient): Promise<unknown> {
  const qs = `projectId=${encodeURIComponent(args.project_id)}&section=experience`
  const read = (await lyriks.get(`/api/sections?${qs}`)) as Record<string, unknown>
  const draft = (read && typeof read === 'object' && 'draft' in read ? read.draft : read) as Record<string, unknown>
  if (!draft || typeof draft !== 'object') throw new Error('experience draft not found')

  const builder = draft.builder as { nodes?: Record<string, Record<string, unknown>> } | undefined
  const nodes = builder?.nodes
  const node = nodes?.[args.node_id]
  if (!node) {
    const ids = nodes
      ? Object.values(nodes)
          .filter((n) => n?.kind === 'element')
          .map((n) => `${n.id}(${n.elementKind}:${n.label || 'unlabelled'})`)
          .slice(0, 30)
          .join(', ')
      : '(no builder)'
    throw new Error(`node "${args.node_id}" not found. Existing elements: ${ids}. Get ids from build_screen output or get_section builder.nodes.`)
  }

  const changed: string[] = []
  if (typeof args.label === 'string') {
    node.label = args.label
    changed.push('label')
  }

  if (node.kind === 'element') {
    const w = (node.wiring && typeof node.wiring === 'object' ? node.wiring : (node.wiring = {})) as Record<string, unknown>
    if (!Array.isArray(w.transitions)) w.transitions = []
    if (!Array.isArray(w.validations)) w.validations = []

    if (args.bind !== undefined) {
      w.binding = args.bind && args.bind.kind ? { targetKind: args.bind.kind, targetRef: String(args.bind.ref ?? '') } : null
      changed.push('binding')
    }
    if (args.visibleWhen !== undefined) {
      w.visibleWhen = mkWhen(args.visibleWhen ?? undefined)
      changed.push('visibleWhen')
    }
    if (args.gate !== undefined) {
      // null (or an empty personaIds list) clears the gate — element shows for everyone.
      w.gate = mkGate(args.gate)
      changed.push('gate')
    }
    if (args.validations !== undefined) {
      w.validations = args.validations.map((v, i) => mkValidation(v, `val-${args.node_id}-${i}`))
      changed.push('validations')
    }
    if (args.on !== undefined) {
      const defaultTrigger = FIELD_KINDS.includes(String(node.elementKind)) ? 'change' : 'click'
      const built = args.on
        .map((o, i) => mkTransition(o, defaultTrigger, `wt-${args.node_id}-${i}`))
        .filter((t): t is Record<string, unknown> => t !== null)
      w.transitions = args.replaceTransitions ? built : [...(w.transitions as unknown[]), ...built]
      changed.push('transitions')
    }
    if (args.requireValid !== undefined) {
      w.requireValid = args.requireValid
      changed.push('requireValid')
    }
    if (args.appearance !== undefined) {
      // null clears the overrides; an object replaces them.
      if (args.appearance === null) delete node.appearance
      else node.appearance = args.appearance
      changed.push('appearance')
    }
    if (args.rowLayout !== undefined) {
      // 'stack' is the default, so store it only when it differs.
      if (args.rowLayout === 'stack') delete node.rowLayout
      else if (['grid', 'cards'].includes(String(args.rowLayout))) node.rowLayout = args.rowLayout
      changed.push('rowLayout')
    }
    if (args.rowColumns !== undefined) {
      node.rowColumns = Math.max(1, Math.min(4, Math.round(args.rowColumns)))
      changed.push('rowColumns')
    }
    if (args.options !== undefined) {
      if (args.options === null || args.options.length === 0) delete node.options
      else node.options = args.options.map(String)
      changed.push('options')
    }
    if (args.optionsFrom !== undefined) {
      const f = args.optionsFrom
      if (!f || !f.collection || !f.field) delete node.optionsFrom
      else
        node.optionsFrom = {
          collection: f.collection,
          field: f.field,
          ...(f.filterField && f.filterPath ? { filterField: f.filterField, filterPath: f.filterPath } : {}),
        }
      changed.push('optionsFrom')
    }
    if (args.media !== undefined) {
      if (args.media === null || !args.media.src) delete node.media
      else
        node.media = {
          src: args.media.src,
          alt: typeof args.media.alt === 'string' ? args.media.alt : '',
          fit: ['cover', 'contain', 'fill'].includes(args.media.fit as string) ? args.media.fit : 'cover',
          ...(typeof args.media.aspectRatio === 'string' ? { aspectRatio: args.media.aspectRatio } : {}),
        }
      changed.push('media')
    }
  } else if (args.visibleWhen !== undefined) {
    // Groups carry visibility at the node level (this is what opens/closes an overlay).
    node.visibleWhen = mkWhen(args.visibleWhen ?? undefined)
    changed.push('visibleWhen')
  }

  const result = (await lyriks.put('/api/draft/experience', { ...draft, projectId: args.project_id })) as Record<string, unknown>
  return {
    ...result,
    nodeId: args.node_id,
    kind: node.kind,
    elementKind: node.kind === 'element' ? node.elementKind : undefined,
    changed,
  }
}
