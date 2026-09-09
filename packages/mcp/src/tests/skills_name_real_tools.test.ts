/**
 * Tests: the bundled skills only name tools that actually exist.
 *
 * Why this exists: `lyriks-code-to-spec` and `lyriks-implement` shipped for
 * months written against unspaghettit's RAW tool names (`get_repo_context`,
 * `create_feature`, `add_action`, `report_implementation_status`,
 * `sync_from_index`). None of those are registered here, so an agent loading
 * either skill hit tool-not-found on nearly every step. Nothing caught it,
 * because a skill is prose — it compiles, lints and tests fine while being
 * completely wrong.
 *
 * A skill is an executable contract with the registry. This asserts it.
 */

import { describe, it, expect, vi } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createMcpServer } from '../server.js'

// The skills live in docs/skills of the Back monorepo, and under .claude/skills
// at the root of the public Community workspace (packages/mcp sits beside the
// platform there); the first that exists is the catalog this build serves.
const SKILLS_DIR = ['../../../../docs/skills', '../../../../.claude/skills']
  .map((rel) => join(fileURLToPath(new URL('.', import.meta.url)), rel))
  .find((dir) => existsSync(dir)) ?? ''

/**
 * Backticked identifiers in a skill are a mix of tool names, JSON fields and
 * file names. Only `snake_case` words with at least two underscore-separated
 * parts are plausibly tools, and this allow-list carries the ones that are
 * genuinely payload fields rather than tools — kept explicit so a NEW
 * non-existent tool name can never hide behind a broad regex.
 */
const NOT_TOOLS = new Set([
  'entity_id',
  'feature_id',
  'file_name',
  'found_entities',
  'project_id',
  'source_id',
  'action_id',
  'surface_id',
  'element_id',
  'max_chars',
  'start_offset',
  'end_offset',
  'candidate_id',
  'conflict_id',
  'resolved_in_favor_of',
  'accepted_ambiguity',
  // Brief / verdict payload fields, not calls.
  'check_id',
  'coverage_min',
  'data_contracts',
  'fail_if',
  'rules_ref',
  'token_budget',
  // apply_behavior_batch operation kinds: the platform skills spell them in
  // backticks, and they are ops inside one tool call, never tools.
  'add_acceptance_criterion',
  'add_action',
  'add_action_rule',
  'add_effect',
  'add_entity',
  'add_event',
  'add_invariant',
  'add_parameter',
  'add_persona',
  'add_reachability_goal',
  'add_resource',
  'add_scenario',
  'add_state_definition',
  'add_surface',
  'add_surface_invariant',
  'add_transition',
  'update_effect',
  // Effect types of an action rule.
  'allow_action',
  'block_action',
  'emit_event',
  'set_state',
  // Enum values the skills quote (issue statuses, scope kinds, source modes).
  'accepted_risk',
  'code_to_spec',
  'full_product',
  'in_review',
  'missing_rule',
  'not_applicable',
  'selected_scope',
  'web_interface',
  // Example identifiers the skills quote in their prose.
  'invoice_record_v2',
])

const toolNamesIn = (markdown: string): string[] => {
  const found = new Set<string>()
  // A tool reference is a backticked identifier, optionally followed by a call.
  for (const [, name] of markdown.matchAll(/`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)[`(]/g)) {
    if (!NOT_TOOLS.has(name)) found.add(name)
  }
  return [...found].sort()
}

function registeredTools(): Set<string> {
  // The Community tool list: the same names as Enterprise, stand-ins included.
  const server = createMcpServer(null)
  // @ts-expect-error accessing internal _registeredTools
  return new Set(Object.keys(server._registeredTools as Record<string, unknown>))
}

describe('bundled skills name only registered tools', () => {
  const skills = existsSync(SKILLS_DIR)
    ? readdirSync(SKILLS_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory() && existsSync(join(SKILLS_DIR, e.name, 'SKILL.md')))
        .map((e) => e.name)
    : []

  it('finds the bundled skills', () => {
    expect(skills.length).toBeGreaterThan(0)
  })

  for (const skill of skills) {
    it(`${skill} — every tool it names is registered`, () => {
      const markdown = readFileSync(join(SKILLS_DIR, skill, 'SKILL.md'), 'utf8')
      const registered = registeredTools()
      const named = toolNamesIn(markdown)
      const missing = named.filter((name) => !registered.has(name))

      // Named so a failure reads as a work list, not just "expected [] to equal".
      expect({ skill, missing }).toEqual({ skill, missing: [] })
    })
  }
})
