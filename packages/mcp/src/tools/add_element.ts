// Tool: add_element
// Insert ONE element (or group subtree) into an existing screen's layout —
// WITHOUT rebuilding the whole surface. build_screen full-replaces a screen's
// layout and wire_element edits an existing node but cannot create one; this is
// the missing middle: materialise a single build_screen element spec, hook it
// into a parent group's childIds at an optional position, and write the draft
// back through the wizard app's PUT (same sync as build_screen).

import type { LyriksClient } from '../lyriks-client.js'
import { materializeNode, type MaterializeCtx, type Spec } from './build_screen.js'

export interface AddElementArgs {
  project_id: string
  screen_id: string
  parent_id?: string
  element: Spec
  position?: number
}

export async function addElementHandler(args: AddElementArgs, lyriks: LyriksClient): Promise<unknown> {
  const qs = `projectId=${encodeURIComponent(args.project_id)}&section=experience`
  const read = (await lyriks.get(`/api/sections?${qs}`)) as Record<string, unknown>
  const draft = (read && typeof read === 'object' && 'draft' in read ? read.draft : read) as Record<string, unknown>
  if (!draft || typeof draft !== 'object') throw new Error('experience draft not found')

  const screens = Array.isArray(draft.screens) ? (draft.screens as { id: string }[]) : []
  const components = Array.isArray(draft.components) ? (draft.components as { id: string }[]) : []
  if (!screens.some((s) => s && s.id === args.screen_id) && !components.some((c) => c && c.id === args.screen_id)) {
    const ids = [...screens, ...components].map((s) => s.id).join(', ') || '(none)'
    throw new Error(`surface "${args.screen_id}" not found among screens/components. Existing: ${ids}.`)
  }

  const builder = draft.builder as
    | { nodes?: Record<string, Record<string, unknown>>; screenRoots?: Record<string, string> }
    | undefined
  const nodes = builder?.nodes
  const rootId = builder?.screenRoots?.[args.screen_id]
  if (!nodes || !rootId || !nodes[rootId]) {
    throw new Error(
      `screen "${args.screen_id}" has no built layout yet — create the initial layout with build_screen, ` +
        `then add_element for incremental additions.`,
    )
  }

  // Resolve the parent group (default: the screen's root node).
  const parentId = args.parent_id ?? rootId
  const parent = nodes[parentId]
  if (!parent || parent.surfaceId !== args.screen_id) {
    const groups = Object.values(nodes)
      .filter((n) => n?.surfaceId === args.screen_id && n.kind === 'group')
      .map((n) => `${n.id}(${n.label || 'Group'})`)
      .slice(0, 30)
      .join(', ')
    throw new Error(`parent "${parentId}" not found on screen "${args.screen_id}". Existing groups: ${groups || '(none)'}.`)
  }
  if (parent.kind !== 'group') {
    throw new Error(
      `parent "${parentId}" is a ${String(parent.elementKind ?? parent.kind)} element, not a group — ` +
        `only groups hold children. Target its parent group, or omit parent_id for the screen root.`,
    )
  }

  // Mint ids with the build_screen prefix, skipping any already taken (an
  // incremental insert must never collide with the existing layout's ids).
  let seq = Object.keys(nodes).length
  const nid = () => {
    let id: string
    do id = `bld-${args.screen_id}-${(seq++).toString(36)}`
    while (nodes[id])
    return id
  }
  const ctx: MaterializeCtx = { surfaceId: args.screen_id, nodes, nid }

  const before = new Set(Object.keys(nodes))
  const nodeId = materializeNode(args.element, parentId, ctx)
  const createdIds = Object.keys(nodes).filter((id) => !before.has(id))

  // Hook the new node into the parent's childIds at `position` (default append).
  const childIds = Array.isArray(parent.childIds) ? (parent.childIds as string[]) : (parent.childIds = [])
  const at =
    typeof args.position === 'number' && Number.isInteger(args.position)
      ? Math.max(0, Math.min(args.position, childIds.length))
      : childIds.length
  childIds.splice(at, 0, nodeId)

  const result = (await lyriks.put('/api/draft/experience', { ...draft, projectId: args.project_id })) as Record<string, unknown>
  const created = createdIds.map((id) => ({
    id,
    kind: nodes[id].kind as string,
    ...(nodes[id].kind === 'element' ? { elementKind: nodes[id].elementKind as string } : {}),
    label: (nodes[id].label as string) ?? '',
  }))
  return {
    ...result,
    screenId: args.screen_id,
    parentId,
    nodeId,
    position: at,
    nodesCreated: created.length,
    nodes: created,
  }
}
