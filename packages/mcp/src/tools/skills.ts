// Authoring-skill distribution: the platform bundles the lyriks-* SKILL.md
// playbooks (build/design/behavior) and serves them read-only under
// /api/skills. These handlers let a connected LLM discover them, fetch the
// full content, and RECONCILE its locally installed copies (sync) — the
// install variant carries a `contentHash:` frontmatter line, so a client
// reports that line back and receives only what is new or stale.
//
// Installation is not Claude-specific: every response carries `installTargets`,
// one layout per agent runtime. A client that names itself in `client` gets its
// own layout alone; one that stays anonymous gets them all and picks.

import type { LyriksClient } from '../lyriks-client.js'

export async function listSkillsHandler(_args: unknown, lyriks: LyriksClient): Promise<unknown> {
  return lyriks.get('/api/skills')
}

export async function getSkillHandler(
  args: { skill_id: string },
  lyriks: LyriksClient,
): Promise<unknown> {
  return lyriks.get(`/api/skills/${encodeURIComponent(args.skill_id)}`)
}

export async function syncSkillsHandler(
  args: { installed?: Array<{ id: string; content_hash?: string }>; client?: string },
  lyriks: LyriksClient,
): Promise<unknown> {
  // MCP snake_case → platform camelCase.
  const installed = (args.installed ?? []).map((ref) => ({
    id: ref.id,
    contentHash: ref.content_hash,
  }))
  return lyriks.post('/api/skills/sync', { installed, client: args.client })
}
