// Tool: build_screen
// Author a complete Experience-Builder screen layout in ONE call from a compact
// nested spec — instead of dozens of low-level set-ops on builder.nodes.*.
//
// The MCP server reads the experience draft, materialises the spec into builder
// nodes (groups + elements, childIds, screenRoots) for the target screen
// (replacing any previous layout for it), and writes it back through the wizard app's PUT
// (with its sync side-effects). the wizard app's anti-corruption parse normalises the nodes.
//
// Layout spec (the `layout` arg = the root group):
//   { label?, direction?: 'row'|'col', justify?, align?, gap?, padding?, wrap?,
//     card?: true,                                // render as a surface card (bg+border+shadow)
//     maxWidth?: 'sm'|'md'|'lg'|'xl',             // cap + centre the column ('none' = full width)
//     presentation?: 'overlay'|'tabs'|'sidebar'|'menu',  // modal / tab panels / aside-nav panels / anchored dropdown
//     tabsKey?: '<statePath>',                    // tabs+sidebar: active panel index path
//     children: [ <node>... ] }
//   node = a group (has `children`) OR an element (has `el`):
//   element = { el: 'heading'|'text'|'input'|'textarea'|'select'|'checkbox'|'button'|'link'|'list'|'form'|'container'|'image',
//               label?, variant?, inputType?,            // 'primary'|'secondary'|'accent' for buttons
//               nav?: '<targetScreenId>',                // shorthand: click → navigate
//               setState?: ['<path>','<value>'],         // shorthand: click → set state
//               on?: [ <transition>... ],                // explicit trigger + effect (below)
//               visibleWhen?: { path, op?, value? },     // run-mode: show only while state holds
//               bind?: { kind:'action'|'state'|'event'|'surface'|'entity', ref:'<dotted>' } }
//   transition = { trigger?: 'click'|'hover'|'change'|'submit',   // default: 'change' for inputs, else 'click'
//                  navigate?: '<screenId>'                        // pick exactly one effect:
//                  | setState?: ['<path>','<value>']              //   assign a literal
//                  | toggle?: '<path>'                            //   flip a boolean
//                  | increment?: '<path>', by?: <step=1>,         //   add a step to a number
//                  when?: { path, op?, value? } }                 //   GUARD: run the effect only while
//                                                                 //   this state condition holds (if/else)
//   visibleWhen.op = 'truthy'|'falsy'|'eq'|'neq' (default 'truthy'); `value` used by eq/neq.
//   list extras  = { componentId?: '<row template component>', filterStatePath?: '<search path>',
//                    rowLayout?: 'stack'|'grid'|'cards', rowColumns?: 1..4 }
//   select extras= { options?: ['A','B'],
//                    optionsFrom?: { collection, field, filterField?, filterPath? } }  // live/dependent
//   PER-ROW ACTIONS: author them inside the row-template component — each element
//   there acts on the row it renders in. `selectRecord: '<statePrefix>'` publishes
//   the clicked record ({prefix.field} anywhere), and a setState `value` may
//   interpolate '{Field}' from that row.
//   So inputs can drive state on type (change) / Enter (submit), and elements can
//   appear only once state holds — full parity with the wizard's Flow + Gate tabs.

import type { LyriksClient } from '../lyriks-client.js'
import { mkGate, mkValidation } from './wire_element.js'
import { dedupeCoherenceIssues } from '../util/advisory-dedupe.js'

const ELEMENT_KINDS = ['heading', 'text', 'input', 'textarea', 'select', 'checkbox', 'button', 'link', 'list', 'form', 'container', 'image', 'status', 'icon', 'meter']
// Kinds that hold a value: they default to the `change` trigger and validate.
const FIELD_KINDS = ['input', 'textarea', 'select', 'checkbox']

export type Spec = Record<string, unknown>

const VALID_TRIGGERS = ['click', 'hover', 'change', 'submit']
const VALID_OPS = ['truthy', 'falsy', 'eq', 'neq']

// One `on` entry → a builder transition (trigger + a single effect). Returns
// null when no effect is recognised. `defaultTrigger` is 'change' for inputs.
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
  when?: { path?: string; op?: string; value?: unknown }
  call?: {
    label?: string
    endpoint?: string
    latencyMs?: number
    loadingPath?: string
    outcome?: string
    resultPath?: string
    resultValue?: unknown
    errorPath?: string
  }
}

/**
 * Everything spec→node materialisation needs: the target surface, the draft's
 * builder.nodes map to write into, and an id mint. Shared by build_screen (full
 * rebuild) and add_element (single insertion) so the conversion never forks.
 */
export type MaterializeCtx = {
  surfaceId: string
  nodes: Record<string, Record<string, unknown>>
  nid: () => string
}

const wiring = () => ({ binding: null as unknown, transitions: [] as unknown[], scenarios: [], gate: null, validations: [] })

// A `when` guard → the transition's effect fires only while a state condition
// holds; two guarded transitions on one trigger model if/else branching.
const mkWhen = (w: OnSpec['when']): Record<string, unknown> | null => {
  if (!w || typeof w.path !== 'string' || !w.path) return null
  return {
    path: w.path,
    op: VALID_OPS.includes(String(w.op)) ? w.op : 'truthy',
    expected: w.value !== undefined ? String(w.value) : undefined,
  }
}

const mkTransition = (o: OnSpec, defaultTrigger: string, nid: () => string): Record<string, unknown> | null => {
  const trigger = VALID_TRIGGERS.includes(String(o.trigger)) ? o.trigger : defaultTrigger
  let effect: Record<string, unknown> | null = null
  if (typeof o.navigate === 'string') effect = { kind: 'navigate', target: o.navigate }
  else if (Array.isArray(o.setState))
    effect = { kind: 'setState', target: String(o.setState[0]), value: String(o.setState[1]) }
  else if (typeof o.toggle === 'string') effect = { kind: 'toggleState', target: o.toggle }
  else if (typeof o.increment === 'string')
    effect = { kind: 'incrementState', target: o.increment, value: o.by !== undefined ? String(o.by) : '1' }
  else if (typeof o.createRecord === 'string')
    // Append a row to a fake-backend collection (by name), captured from this
    // surface's inputs whose label matches a field name (or the explicit
    // fieldMap: field name → input label), then reset the form.
    effect = {
      kind: 'createRecord',
      target: o.createRecord,
      ...(o.fieldMap && typeof o.fieldMap === 'object' ? { fieldMap: o.fieldMap } : {}),
    }
  else if (typeof o.selectRecord === 'string')
    // Publish the row this element was clicked in under a state prefix
    // (`<prefix>.<field>` for every field, `<prefix>` = the row id). Only
    // meaningful inside a list's row-template component.
    effect = { kind: 'selectRecord', target: o.selectRecord }
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
  return when ? { id: nid(), trigger, effect, when } : { id: nid(), trigger, effect }
}

/**
 * Materialise ONE spec node (element, or group with children, recursively) into
 * `ctx.nodes` under `parentId`, returning the created node's id. This is the
 * element→node conversion both build_screen and add_element run.
 */
export function materializeNode(spec: Spec, parentId: string | null, ctx: MaterializeCtx): string {
  const { nid } = ctx
  const id = nid()
  let el = typeof spec.el === 'string' ? spec.el : null
  const hasChildren = Array.isArray(spec.children) && spec.children.length > 0
  // A `container` is a layout box; if it carries children the author unambiguously
  // means a wrapping group, so coerce it (a very common, harmless slip) rather than
  // erroring. Any OTHER element kind (button, heading, list…) with children is a
  // real mistake — fail loud there, since silently dropping the children hides it.
  if (el === 'container' && hasChildren) el = null
  if (el && hasChildren)
    throw new Error(
      `node "${(spec.label as string) ?? el}" has both 'el' and 'children'. An element cannot contain children — ` +
        `remove 'el' to make it a group (or use el:"container" which is treated as a group when it has children).`,
    )
  if (el) {
    const kind = ELEMENT_KINDS.includes(el) ? el : 'text'
    const w = wiring()
    const bind = spec.bind as { kind?: string; ref?: string } | undefined
    if (bind && bind.kind) w.binding = { targetKind: bind.kind, targetRef: String(bind.ref ?? '') }
    if (typeof spec.inputType === 'string') (w as Record<string, unknown>).inputType = spec.inputType
    // Shorthands assume a click (back-compat).
    const setState = spec.setState as [string, unknown] | undefined
    if (Array.isArray(setState))
      w.transitions.push({ id: nid(), trigger: 'click', effect: { kind: 'setState', target: setState[0], value: String(setState[1]) } })
    if (typeof spec.nav === 'string')
      w.transitions.push({ id: nid(), trigger: 'click', effect: { kind: 'navigate', target: spec.nav } })
    if (typeof spec.createRecord === 'string')
      w.transitions.push({ id: nid(), trigger: 'click', effect: { kind: 'createRecord', target: spec.createRecord } })
    // Block the click while this element's screen has invalid inputs.
    if (spec.requireValid === true) (w as Record<string, unknown>).requireValid = true
    // Explicit transitions: input events (change/submit) + richer state effects.
    const defaultTrigger = FIELD_KINDS.includes(kind) ? 'change' : 'click'
    const ons = Array.isArray(spec.on) ? (spec.on as OnSpec[]) : []
    for (const o of ons) {
      const t = mkTransition(o, defaultTrigger, nid)
      if (t) w.transitions.push(t)
    }
    // State-driven visibility (run mode): show only while a state condition holds.
    const vw = spec.visibleWhen as { path?: string; op?: string; value?: unknown } | undefined
    if (vw && typeof vw.path === 'string' && vw.path)
      (w as Record<string, unknown>).visibleWhen = {
        path: vw.path,
        op: VALID_OPS.includes(String(vw.op)) ? vw.op : 'truthy',
        expected: vw.value !== undefined ? String(vw.value) : undefined,
      }
    // Persona gate (run mode): show/enable this element only for the listed
    // Role ids from the users section — the per-element authorization the verifier's "Roles
    // covered" dimension rewards.
    const gate = mkGate(spec.gate as Parameters<typeof mkGate>[0])
    if (gate) (w as Record<string, unknown>).gate = gate
    // Input validations (lyriks catalog: required|email|min|max|pattern).
    if (Array.isArray(spec.validations))
      (w as Record<string, unknown>).validations = (spec.validations as Record<string, unknown>[]).map((v) =>
        mkValidation(v, nid()),
      )
    const node: Record<string, unknown> = {
      id,
      surfaceId: ctx.surfaceId,
      parentId,
      kind: 'element',
      elementKind: kind,
      label: typeof spec.label === 'string' ? spec.label : '',
      wiring: w,
    }
    if (typeof spec.variant === 'string') node.variant = spec.variant
    // A list can name a component as its per-row template (rendered once per row).
    if (typeof spec.componentId === 'string') node.componentId = spec.componentId
    // A list can filter by a state path (bind an input to the same path to search).
    if (typeof spec.filterStatePath === 'string') node.filterStatePath = spec.filterStatePath
    // A list can repeat its row template as a stack, a grid or wrapping cards.
    if (['stack', 'grid', 'cards'].includes(spec.rowLayout as string)) node.rowLayout = spec.rowLayout
    if (typeof spec.rowColumns === 'number') node.rowColumns = spec.rowColumns
    // A select's choices: an authored list, or read live from a collection field
    // (optionally narrowed by another field matching a state value = dependent picker).
    if (Array.isArray(spec.options)) node.options = (spec.options as unknown[]).map(String)
    const from = spec.optionsFrom as
      | { collection?: string; field?: string; filterField?: string; filterPath?: string }
      | undefined
    if (from && typeof from.collection === 'string' && typeof from.field === 'string')
      node.optionsFrom = {
        collection: from.collection,
        field: from.field,
        ...(from.filterField && from.filterPath
          ? { filterField: from.filterField, filterPath: from.filterPath }
          : {}),
      }
    // Per-element visual overrides (structured, not raw CSS): background/color/
    // radius/padding/… — so a real chip or tile lands in one call, no follow-up patch.
    if (spec.appearance && typeof spec.appearance === 'object') node.appearance = spec.appearance
    // Image content: `media:{src,alt,fit,aspectRatio}` or the `src`/`alt` shorthand.
    // A data: URI keeps the appliance air-gapped (no remote fetch).
    const media = spec.media as { src?: string; alt?: string; fit?: string; aspectRatio?: string } | undefined
    const mediaSrc = typeof spec.src === 'string' ? spec.src : media?.src
    if (typeof mediaSrc === 'string' && mediaSrc) {
      const alt = media?.alt ?? (spec.alt as string | undefined)
      node.media = {
        src: mediaSrc,
        alt: typeof alt === 'string' ? alt : '',
        fit: ['cover', 'contain', 'fill'].includes(media?.fit as string) ? media!.fit : 'cover',
        ...(typeof media?.aspectRatio === 'string' ? { aspectRatio: media.aspectRatio } : {}),
      }
    }
    ctx.nodes[id] = node
    return id
  }
  // group
  const childIds: string[] = []
  // Presentation: `presentation:"overlay"|"tabs"|"sidebar"|"menu"` or the
  // `overlay:true`/`tabs:true`/`sidebar:true`/`menu:true` shorthands. `inline`
  // is the default and is left implicit. `sidebar` shares the tabs contract
  // (child groups = panels, active index at tabsKey) rendered as an aside nav
  // menu; `menu` shares the overlay contract (open while visibleWhen holds)
  // rendered as an anchored dropdown with click-outside dismissal.
  const presentation =
    spec.presentation === 'overlay' || spec.overlay === true
      ? 'overlay'
      : spec.presentation === 'tabs' || spec.tabs === true
        ? 'tabs'
        : spec.presentation === 'sidebar' || spec.sidebar === true
          ? 'sidebar'
          : spec.presentation === 'menu' || spec.menu === true
            ? 'menu'
            : 'inline'
  const node: Record<string, unknown> = {
    id,
    surfaceId: ctx.surfaceId,
    parentId,
    kind: 'group',
    label: typeof spec.label === 'string' ? spec.label : 'Group',
    childIds,
    flex: {
      direction: spec.direction === 'row' ? 'row' : 'col',
      justify: typeof spec.justify === 'string' ? spec.justify : 'start',
      align: typeof spec.align === 'string' ? spec.align : 'stretch',
      gap: typeof spec.gap === 'number' ? spec.gap : 3,
      wrap: spec.wrap === true,
      padding: typeof spec.padding === 'number' ? spec.padding : 4,
      // `card:true` → the group renders as a surface card (bg + border + shadow),
      // so build_screen can produce real containers without a follow-up patch.
      card: spec.card === true,
      // `maxWidth` caps + centres the column ('sm'|'md'|'lg'|'xl'); 'none' = full
      // width. Lets a chat thread / form read at a comfortable width in one call.
      maxWidth: ['none', 'sm', 'md', 'lg', 'xl'].includes(spec.maxWidth as string)
        ? (spec.maxWidth as string)
        : 'none',
    },
    componentId: typeof spec.componentId === 'string' ? spec.componentId : null,
  }
  // Group-level visual overrides (dark sidebar, hero band, tinted banner) — the
  // same structured vocabulary as elements, applied to the whole container.
  if (spec.appearance && typeof spec.appearance === 'object') node.appearance = spec.appearance
  if (presentation !== 'inline') node.presentation = presentation
  if ((presentation === 'tabs' || presentation === 'sidebar') && typeof spec.tabsKey === 'string')
    node.tabsKey = spec.tabsKey
  // A group can be gated by state too — this is what opens/closes an overlay.
  const gvw = spec.visibleWhen as { path?: string; op?: string; value?: unknown } | undefined
  if (gvw && typeof gvw.path === 'string' && gvw.path)
    node.visibleWhen = {
      path: gvw.path,
      op: VALID_OPS.includes(String(gvw.op)) ? gvw.op : 'truthy',
      expected: gvw.value !== undefined ? String(gvw.value) : undefined,
    }
  ctx.nodes[id] = node
  const children = Array.isArray(spec.children) ? (spec.children as Spec[]) : []
  for (const child of children) childIds.push(materializeNode(child, id, ctx))
  return id
}

export async function buildScreenHandler(
  args: { project_id: string; screen_id: string; layout: Spec },
  lyriks: LyriksClient,
): Promise<unknown> {
  const qs = `projectId=${encodeURIComponent(args.project_id)}&section=experience`
  const read = (await lyriks.get(`/api/sections?${qs}`)) as Record<string, unknown>
  const draft = (read && typeof read === 'object' && 'draft' in read ? read.draft : read) as Record<string, unknown>
  if (!draft || typeof draft !== 'object') throw new Error('experience draft not found')

  const screens = Array.isArray(draft.screens) ? (draft.screens as { id: string }[]) : []
  // A reusable LibraryComponent also owns a surface tree (referenced from a group
  // via componentId), so build_screen targets components by id too.
  const components = Array.isArray(draft.components) ? (draft.components as { id: string }[]) : []
  const isScreen = screens.some((s) => s && s.id === args.screen_id)
  const isComponent = components.some((c) => c && c.id === args.screen_id)
  if (!isScreen && !isComponent) {
    const ids = [...screens, ...components].map((s) => s.id).join(', ') || '(none)'
    throw new Error(
      `surface "${args.screen_id}" not found among screens/components. Existing: ${ids}. Create a screen ` +
        `via patch_section (collection:"screens", id, insert:true, value:{name,...}) or a component ` +
        `(collection:"components", id, insert:true, value:{name,...}).`,
    )
  }

  const builder = (
    draft.builder && typeof draft.builder === 'object'
      ? draft.builder
      : (draft.builder = {
          nodes: {},
          screenRoots: {},
          entryScreenId: null,
          stateSeeds: [],
          selectedScreenId: null,
          selectedNodeId: null,
        })
  ) as {
    nodes: Record<string, Record<string, unknown>>
    screenRoots: Record<string, string>
    entryScreenId: string | null
    [k: string]: unknown
  }
  if (!builder.nodes || typeof builder.nodes !== 'object') builder.nodes = {}
  if (!builder.screenRoots || typeof builder.screenRoots !== 'object') builder.screenRoots = {}

  // Clean any previous layout for this screen (full rebuild).
  for (const id of Object.keys(builder.nodes)) {
    if (builder.nodes[id]?.surfaceId === args.screen_id) delete builder.nodes[id]
  }

  let seq = 0
  const nid = () => `bld-${args.screen_id}-${(seq++).toString(36)}`
  const ctx: MaterializeCtx = { surfaceId: args.screen_id, nodes: builder.nodes, nid }

  // Root must be a group; wrap a bare element.
  const rootSpec: Spec = typeof args.layout?.el === 'string' ? { label: 'Screen', children: [args.layout] } : args.layout
  const rootId = materializeNode(rootSpec ?? { label: 'Screen', children: [] }, null, ctx)
  builder.screenRoots[args.screen_id] = rootId
  // Only a real screen can be the run's entry point — never a reusable component.
  if (isScreen && !builder.entryScreenId) builder.entryScreenId = args.screen_id

  const result = (await lyriks.put('/api/draft/experience', { ...draft, projectId: args.project_id })) as Record<string, unknown>
  // Return the built nodes (id + kind + label) so the caller can target one
  // element afterwards — with wire_element (add a validation / transition / gate)
  // or simulate_experience (drive it by nodeId) — instead of re-fetching the tree.
  const surfaceNodes = Object.values(builder.nodes).filter((n) => n?.surfaceId === args.screen_id)
  const nodes = surfaceNodes.map((n) => ({
    id: n.id as string,
    kind: n.kind as string,
    ...(n.kind === 'element' ? { elementKind: n.elementKind as string } : {}),
    label: (n.label as string) ?? '',
    parentId: (n.parentId as string | null) ?? null,
    ...(n.componentId ? { componentId: n.componentId as string } : {}),
  }))
  // Warn on duplicate labels among TARGETABLE elements (button/link/input/form):
  // `simulate_experience` and screenshot scripts resolve those by label, so a
  // collision silently drives the wrong node. Dividers/headings don't matter.
  const TARGETABLE = ['button', 'link', 'input', 'form']
  const labelCounts = new Map<string, number>()
  for (const n of surfaceNodes)
    if (n.kind === 'element' && TARGETABLE.includes(n.elementKind as string) && String(n.label ?? '').trim())
      labelCounts.set(n.label as string, (labelCounts.get(n.label as string) ?? 0) + 1)
  const warnings: string[] = []
  for (const [label, count] of labelCounts)
    if (count > 1)
      warnings.push(
        `Duplicate label "${label}" (×${count}) among clickable elements — label targeting is ambiguous; rename or target by nodeId.`,
      )
  return {
    ...dedupeCoherenceIssues(`${args.project_id}:experience`, result),
    screenId: args.screen_id,
    rootId,
    nodesBuilt: nodes.length,
    nodes,
    ...(warnings.length ? { warnings } : {}),
  }
}
