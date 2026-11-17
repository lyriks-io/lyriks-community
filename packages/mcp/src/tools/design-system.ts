// The design system of a project for an AI client (ac-brand-design-mcp): read
// in one call (the palette in its roles and shades, the colours of text and
// surfaces, the type, the corners, the spacing, the shadows, the breakpoints),
// and a design read from a file such as a Figma frame held against it value by
// value. Both are read-only platform endpoints.

import type { LyriksClient } from '../lyriks-client.js'

const route = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/design-system`

export async function getDesignSystemHandler(args: { project_id: string }, lyriks: LyriksClient): Promise<unknown> {
  return lyriks.get(route(args.project_id))
}

export interface CheckDesignArgs {
  project_id: string
  colors?: { name?: string; value: string }[]
  sizes?: { kind: 'font' | 'radius' | 'spacing'; name?: string; px: number }[]
}

export async function checkDesignHandler(args: CheckDesignArgs, lyriks: LyriksClient): Promise<unknown> {
  return lyriks.post(`${route(args.project_id)}/check`, { colors: args.colors ?? [], sizes: args.sizes ?? [] })
}
